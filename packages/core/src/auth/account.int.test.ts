import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { sendPasswordReset } from "../admin/users";
import { schema } from "../db/client";
import { newId } from "../db/ids";
import { loadActor } from "../rbac/actor";
import { createCtx } from "../rbac/context";
import { NotFoundError, PermissionError, UserError } from "../rbac/errors";
import {
  connectAppDb,
  cookieHeader,
  createTestAuth,
  fakeMailer,
  secretFromTotpUri,
  totpCode,
  uniqueEmail,
} from "../testing";
import { getAccount, updateOwnProfile } from "./account";
import {
  changeOwnPassword,
  listOwnSessions,
  PASSWORD_CHANGE_LIMIT,
  revokeOtherOwnSessions,
  revokeOwnSession,
} from "./credentials";
import { acceptInvitation, createInvitation } from "./invitations";

const app = connectAppDb();
const mailer = fakeMailer();
const auth = createTestAuth(app.db, mailer);
const baseURL = "http://localhost:3000";
const PASSWORD = "správné-heslo-123";
const NEW_PASSWORD = "úplně-nové-heslo-456";
afterAll(() => app.close());

const catalog = new Set(["users.manage", "zakazky.read", "account.self"]);

async function makeRole(over: { isSystem?: boolean; require2fa?: boolean; perms?: string[] } = {}) {
  const [role] = await app.db
    .insert(schema.role)
    .values({
      key: `r-${newId().slice(-8)}`,
      name: "Testovací role",
      isSystem: over.isSystem ?? false,
      require2fa: over.require2fa ?? false,
    })
    .returning();
  if (over.perms?.length)
    await app.db
      .insert(schema.rolePermission)
      .values(
        over.perms.map((permission) => ({ roleId: role!.id, permission, scope: "all" as const })),
      );
  return role!;
}

async function ctxFor(userId: string) {
  const actor = (await loadActor(app.db, userId, { catalog }))!;
  return createCtx(app.db, actor);
}

/** Správce s oprávněním `users.manage`; `owner` = systémová role (smí spravovat majitele). */
async function adminCtx(owner = true) {
  const role = owner
    ? await makeRole({ isSystem: true })
    : await makeRole({ perms: ["users.manage"] });
  const [u] = await app.db
    .insert(schema.user)
    .values({ name: "Správce", email: uniqueEmail("admin"), roleId: role.id })
    .returning();
  return ctxFor(u!.id);
}

/** Pozve a přijme pozvánku; vrací uživatele s heslem `PASSWORD`. */
async function onboard(roleId: string, name = "Jana Nováková") {
  const inviter = await adminCtx();
  const email = uniqueEmail("acct");
  await createInvitation(inviter, { email, roleId }, { mailer, baseURL });
  const token = mailer.last("invitation")!.vars.url!.split("/pozvanka/")[1]!;
  const { userId } = await acceptInvitation(
    { auth, db: app.db },
    { token, name, password: PASSWORD },
  );
  return { email, userId };
}

async function signIn(email: string, password = PASSWORD) {
  const { headers } = await auth.api.signInEmail({
    body: { email, password },
    returnHeaders: true,
  });
  const cookies = cookieHeader(headers);
  const session = await auth.api.getSession({ headers: cookies });
  return { cookies, sessionId: session!.session.id };
}

const sessionIds = async (userId: string) =>
  (
    await app.db
      .select({ id: schema.session.id })
      .from(schema.session)
      .where(eq(schema.session.userId, userId))
  ).map((s) => s.id);

const auditFor = (userId: string, action: string) =>
  app.db
    .select()
    .from(schema.auditLog)
    .where(
      and(
        eq(schema.auditLog.entityId, userId),
        eq(schema.auditLog.entityType, "user"),
        eq(schema.auditLog.action, action),
      ),
    );

describe("změna hesla", () => {
  it("nové heslo platí, staré ne; ostatní relace se zruší a aktuální zůstane; audit je bez hesel", async () => {
    const role = await makeRole({ perms: ["zakazky.read"] });
    const { email, userId } = await onboard(role.id);
    const here = await signIn(email);
    const phone = await signIn(email);
    const laptop = await signIn(email);
    expect((await sessionIds(userId)).length).toBe(3);

    const ctx = await ctxFor(userId);
    const res = await changeOwnPassword(
      ctx,
      { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
      { keepSessionId: here.sessionId },
    );
    expect(res).toEqual({ revokedSessions: 2 });
    expect(await sessionIds(userId)).toEqual([here.sessionId]);
    expect(await auth.api.getSession({ headers: phone.cookies })).toBeNull();
    expect(await auth.api.getSession({ headers: laptop.cookies })).toBeNull();
    expect(await auth.api.getSession({ headers: here.cookies })).not.toBeNull();

    await expect(auth.api.signInEmail({ body: { email, password: PASSWORD } })).rejects.toThrow();
    await expect(
      auth.api.signInEmail({ body: { email, password: NEW_PASSWORD } }),
    ).resolves.toBeDefined();

    const rows = await auditFor(userId, "change_password");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actorId).toBe(userId);
    const [acc] = await app.db
      .select({ password: schema.account.password })
      .from(schema.account)
      .where(eq(schema.account.userId, userId));
    expect(acc!.password).toMatch(/^\$argon2id\$/);
    const everything = JSON.stringify(await app.db.select().from(schema.auditLog));
    for (const secret of [PASSWORD, NEW_PASSWORD, acc!.password!])
      expect(everything).not.toContain(secret);
  });

  it("špatné současné heslo: nic se nezmění, relace zůstanou a pokus je v auditu", async () => {
    const role = await makeRole();
    const { email, userId } = await onboard(role.id);
    const a = await signIn(email);
    const b = await signIn(email);
    const ctx = await ctxFor(userId);

    await expect(
      changeOwnPassword(
        ctx,
        { currentPassword: "tohle-není-heslo-1", newPassword: NEW_PASSWORD },
        { keepSessionId: a.sessionId },
      ),
    ).rejects.toThrow("Současné heslo není správné.");

    expect((await sessionIds(userId)).sort()).toEqual([a.sessionId, b.sessionId].sort());
    await expect(
      auth.api.signInEmail({ body: { email, password: PASSWORD } }),
    ).resolves.toBeDefined();
    expect(await auditFor(userId, "change_password")).toHaveLength(0);
    expect(await auditFor(userId, "change_password_failed")).toHaveLength(1);
  });

  it("srozumitelné chyby: stejné jako staré, příliš krátké, příliš dlouhé, prázdné současné", async () => {
    const role = await makeRole();
    const { userId } = await onboard(role.id);
    const ctx = await ctxFor(userId);
    const keep = { keepSessionId: null };
    await expect(
      changeOwnPassword(ctx, { currentPassword: PASSWORD, newPassword: PASSWORD }, keep),
    ).rejects.toThrow("Nové heslo musí být jiné než současné.");
    await expect(
      changeOwnPassword(ctx, { currentPassword: PASSWORD, newPassword: "krátké" }, keep),
    ).rejects.toThrow("alespoň 12 znaků");
    await expect(
      changeOwnPassword(ctx, { currentPassword: PASSWORD, newPassword: "x".repeat(129) }, keep),
    ).rejects.toThrow("nejvýš 128");
    await expect(
      changeOwnPassword(ctx, { currentPassword: "", newPassword: NEW_PASSWORD }, keep),
    ).rejects.toThrow("Zadejte současné heslo.");
    // hesla se po žádné z chyb nezměnila
    const [acc] = await app.db
      .select({ password: schema.account.password })
      .from(schema.account)
      .where(eq(schema.account.userId, userId));
    expect(acc!.password).toMatch(/^\$argon2id\$/);
  });

  it("bez zachované relace odhlásí všechna zařízení", async () => {
    const role = await makeRole();
    const { email, userId } = await onboard(role.id);
    await signIn(email);
    await signIn(email);
    const res = await changeOwnPassword(
      await ctxFor(userId),
      { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
      { keepSessionId: null },
    );
    expect(res.revokedSessions).toBe(2);
    expect(await sessionIds(userId)).toEqual([]);
  });

  it("omezení pokusů: po vyčerpání limitu odmítne i správné heslo", async () => {
    const role = await makeRole();
    const { userId } = await onboard(role.id);
    const ctx = await ctxFor(userId);
    for (let i = 0; i < PASSWORD_CHANGE_LIMIT.attempts; i++)
      await expect(
        changeOwnPassword(
          ctx,
          { currentPassword: `špatné-heslo-${i}-xx`, newPassword: NEW_PASSWORD },
          { keepSessionId: null },
        ),
      ).rejects.toThrow("Současné heslo není správné.");
    await expect(
      changeOwnPassword(
        ctx,
        { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
        { keepSessionId: null },
      ),
    ).rejects.toThrow("Příliš mnoho pokusů");
    // heslo zůstalo původní
    await expect(
      auth.api.signInEmail({ body: { email: (await getAccount(ctx)).email, password: PASSWORD } }),
    ).resolves.toBeDefined();
  });

  it("jiný uživatel hesla nezmění: aktér je vždy z přihlášení, systémový aktér hesla nemá", async () => {
    const role = await makeRole();
    const { userId } = await onboard(role.id);
    const ctx = await ctxFor(userId);
    await expect(
      changeOwnPassword(
        { ...ctx, actor: { ...ctx.actor, userId: null } },
        { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
        { keepSessionId: null },
      ),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("přímé volání adres Better Auth pro změnu hesla a profilu je vypnuté", async () => {
    const role = await makeRole();
    const { email } = await onboard(role.id);
    const { cookies } = await signIn(email);
    for (const [path, body] of [
      ["change-password", { currentPassword: PASSWORD, newPassword: NEW_PASSWORD }],
      ["set-password", { newPassword: NEW_PASSWORD }],
      ["update-user", { name: "Podvržené jméno" }],
    ] as const) {
      const headers = new Headers(cookies);
      headers.set("content-type", "application/json");
      headers.set("origin", baseURL);
      const res = await auth.handler(
        new Request(`${baseURL}/api/auth/${path}`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        }),
      );
      expect(res.status, path).toBe(404);
    }
    await expect(
      auth.api.signInEmail({ body: { email, password: PASSWORD } }),
    ).resolves.toBeDefined();
  });
});

describe("přihlášená zařízení", () => {
  it("seznam ukáže prohlížeč, systém, zkrácenou adresu a označí aktuální; cizí relace nevidí", async () => {
    const role = await makeRole();
    const { email, userId } = await onboard(role.id);
    const other = await onboard(role.id, "Cizí Uživatel");
    const here = await signIn(email);
    const phone = await signIn(email);
    await signIn(other.email);
    await app.db
      .update(schema.session)
      .set({
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
        ipAddress: "203.0.113.45",
      })
      .where(eq(schema.session.id, phone.sessionId));
    await app.db
      .update(schema.session)
      .set({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
        ipAddress: "2001:db8:85a3:8d3:1319:8a2e:370:7344",
      })
      .where(eq(schema.session.id, here.sessionId));

    const list = await listOwnSessions(await ctxFor(userId), here.sessionId);
    expect(list).toHaveLength(2);
    const cur = list.find((s) => s.id === here.sessionId)!;
    const ph = list.find((s) => s.id === phone.sessionId)!;
    expect(cur).toMatchObject({ current: true, label: "Chrome 141 na macOS", device: "desktop" });
    expect(cur.ip).toBe("2001:db8:85a3:•••");
    expect(ph).toMatchObject({ current: false, label: "Safari 18 na iOS", device: "mobile" });
    expect(ph.ip).toBe("203.0.113.•••");
    expect(JSON.stringify(list)).not.toContain("203.0.113.45");
  });

  it("odhlášení jednoho zařízení, cizí a neexistující relace nejde", async () => {
    const role = await makeRole();
    const { email, userId } = await onboard(role.id);
    const other = await onboard(role.id, "Cizí Uživatel");
    const here = await signIn(email);
    const phone = await signIn(email);
    const foreign = await signIn(other.email);
    const ctx = await ctxFor(userId);

    await expect(revokeOwnSession(ctx, foreign.sessionId, here.sessionId)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(await auth.api.getSession({ headers: foreign.cookies })).not.toBeNull();

    expect(await revokeOwnSession(ctx, phone.sessionId, here.sessionId)).toEqual({
      current: false,
    });
    expect(await auth.api.getSession({ headers: phone.cookies })).toBeNull();
    expect(await auth.api.getSession({ headers: here.cookies })).not.toBeNull();
    expect(await revokeOwnSession(ctx, here.sessionId, here.sessionId)).toEqual({ current: true });
    expect(await sessionIds(userId)).toEqual([]);
  });

  it("odhlášení všech ostatních nechá aktuální a zapíše audit", async () => {
    const role = await makeRole();
    const { email, userId } = await onboard(role.id);
    const here = await signIn(email);
    await signIn(email);
    await signIn(email);
    const ctx = await ctxFor(userId);
    expect(await revokeOtherOwnSessions(ctx, here.sessionId)).toBe(2);
    expect(await sessionIds(userId)).toEqual([here.sessionId]);
    expect(await auditFor(userId, "revoke_sessions")).toHaveLength(1);
    await expect(revokeOtherOwnSessions(ctx, null)).rejects.toBeInstanceOf(UserError);
  });
});

describe("profil", () => {
  it("jméno a telefon se uloží, projeví v účtu i v seznamu uživatelů a zapíše audit; beze změny nic", async () => {
    const role = await makeRole();
    const { userId } = await onboard(role.id);
    const ctx = await ctxFor(userId);
    expect((await getAccount(ctx)).phone).toBeNull();

    await updateOwnProfile(ctx, { name: "  Jana Svobodová ", phone: "+420  777 123 456" });
    const acc = await getAccount(ctx);
    expect(acc).toMatchObject({ name: "Jana Svobodová", phone: "+420 777 123 456" });
    const [u] = await app.db.select().from(schema.user).where(eq(schema.user.id, userId));
    expect(u!.name).toBe("Jana Svobodová");

    const audit = await app.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.actorId, userId));
    const kinds = audit.map((a) => `${a.entityType}:${a.action}`).sort();
    expect(kinds).toEqual(expect.arrayContaining(["employee:update", "user:update"]));

    const auditCount = async () =>
      (await app.db.select().from(schema.auditLog).where(eq(schema.auditLog.actorId, userId)))
        .length;
    const before = await auditCount();
    await updateOwnProfile(ctx, { name: "Jana Svobodová", phone: "+420 777 123 456" });
    expect(await auditCount()).toBe(before);

    // smazání telefonu; ostatní údaje zaměstnance (úvazek) zůstávají
    await updateOwnProfile(ctx, { name: "Jana Svobodová", phone: "" });
    expect((await getAccount(ctx)).phone).toBeNull();
    const [emp] = await app.db
      .select()
      .from(schema.employee)
      .where(eq(schema.employee.userId, userId));
    expect(emp!.workload).toBe("1.00");
  });

  it("neplatné jméno a telefon se odmítnou srozumitelnou větou", async () => {
    const role = await makeRole();
    const { userId } = await onboard(role.id);
    const ctx = await ctxFor(userId);
    await expect(updateOwnProfile(ctx, { name: "J", phone: null })).rejects.toThrow(
      "Vyplňte jméno.",
    );
    await expect(updateOwnProfile(ctx, { name: "Jana", phone: "abc" })).rejects.toThrow(
      "Telefon zadejte",
    );
    await expect(updateOwnProfile(ctx, { name: "Jana", phone: "12" })).rejects.toThrow(
      "Telefon zadejte",
    );
    expect((await getAccount(ctx)).name).toBe("Jana Nováková");
  });
});

describe("správce: odkaz pro nové heslo a odhlášení", () => {
  it("bez e-mailů vznikne jednorázový odkaz, který nastaví heslo a zruší relace; audit je bez tokenu", async () => {
    const role = await makeRole();
    const { email, userId } = await onboard(role.id);
    const session = await signIn(email);
    const admin = await adminCtx();
    const before = mailer.sent.length;

    const res = await sendPasswordReset(admin, { auth, baseURL, deliverByEmail: false }, userId);
    expect(res.delivery).toBe("link");
    if (res.delivery !== "link") return;
    expect(mailer.sent.length).toBe(before); // nic neodešlo
    const url = new URL(res.url);
    expect(url.pathname).toBe("/obnova-hesla");
    const token = url.searchParams.get("token")!;
    expect(token.length).toBeGreaterThanOrEqual(30);
    expect(res.expiresAt.getTime() - Date.now()).toBeGreaterThan(55 * 60_000);

    const audit = await auditFor(userId, "password_reset_link");
    expect(audit).toHaveLength(1);
    expect(audit[0]!.actorId).toBe(admin.actor.userId);
    expect(JSON.stringify(await app.db.select().from(schema.auditLog))).not.toContain(token);

    await auth.api.resetPassword({ body: { token, newPassword: NEW_PASSWORD } });
    expect(await auth.api.getSession({ headers: session.cookies })).toBeNull();
    await expect(
      auth.api.signInEmail({ body: { email, password: NEW_PASSWORD } }),
    ).resolves.toBeDefined();
    // jednorázový
    await expect(
      auth.api.resetPassword({ body: { token, newPassword: "jiné-heslo-pro-test-789" } }),
    ).rejects.toThrow();
  });

  it("nový odkaz zneplatní předchozí", async () => {
    const role = await makeRole();
    const { userId } = await onboard(role.id);
    const admin = await adminCtx();
    const deps = { auth, baseURL, deliverByEmail: false };
    const first = await sendPasswordReset(admin, deps, userId);
    const second = await sendPasswordReset(admin, deps, userId);
    if (first.delivery !== "link" || second.delivery !== "link") throw new Error("odkaz");
    const tok = (u: string) => new URL(u).searchParams.get("token")!;
    await expect(
      auth.api.resetPassword({ body: { token: tok(first.url), newPassword: NEW_PASSWORD } }),
    ).rejects.toThrow();
    await expect(
      auth.api.resetPassword({ body: { token: tok(second.url), newPassword: NEW_PASSWORD } }),
    ).resolves.toBeDefined();
  });

  it("s nastaveným e-mailem odejde zpráva a správce odkaz nedostane", async () => {
    const role = await makeRole();
    const { email, userId } = await onboard(role.id);
    const admin = await adminCtx();
    const res = await sendPasswordReset(admin, { auth, baseURL, deliverByEmail: true }, userId);
    expect(res).toEqual({ delivery: "email", email });
    expect(mailer.last("password-reset")!.to).toBe(email);
    expect(JSON.stringify(res)).not.toMatch(/token|obnova-hesla/);
    expect(await auditFor(userId, "password_reset_sent")).toHaveLength(1);
  });

  it("oprávnění: bez users.manage nejde nic, majitele smí jen majitel, neaktivnímu odkaz nevznikne", async () => {
    const role = await makeRole();
    const { userId } = await onboard(role.id);
    const ownerRole = await makeRole({ isSystem: true });
    const owner = await onboard(ownerRole.id, "Majitel Systému");

    const plain = await ctxFor(userId); // role bez users.manage
    await expect(
      sendPasswordReset(plain, { auth, baseURL, deliverByEmail: false }, userId),
    ).rejects.toBeInstanceOf(PermissionError);

    const manager = await adminCtx(false); // users.manage, ale ne systémová role
    await expect(
      sendPasswordReset(manager, { auth, baseURL, deliverByEmail: false }, owner.userId),
    ).rejects.toBeInstanceOf(PermissionError);
    const ok = await sendPasswordReset(manager, { auth, baseURL, deliverByEmail: false }, userId);
    expect(ok.delivery).toBe("link");

    await app.db.update(schema.user).set({ active: false }).where(eq(schema.user.id, userId));
    await expect(
      sendPasswordReset(manager, { auth, baseURL, deliverByEmail: false }, userId),
    ).rejects.toThrow("deaktivovaný");
  });
});

describe("2FA: záložní kódy a vypnutí", () => {
  async function withTotp(requireTwoFactor: boolean) {
    const role = await makeRole({ require2fa: requireTwoFactor });
    const { email, userId } = await onboard(role.id);
    const first = await signIn(email);
    const enabled = await auth.api.enableTwoFactor({
      body: { password: PASSWORD, method: "totp" },
      headers: first.cookies,
    });
    if (enabled.method !== "totp") throw new Error("Očekáváno TOTP");
    const verified = await auth.api.verifyTOTP({
      body: { code: totpCode(secretFromTotpUri(enabled.totpURI)) },
      headers: first.cookies,
      returnHeaders: true,
    });
    const cookies = cookieHeader(verified.headers, first.cookies.get("cookie") ?? "");
    return { email, userId, cookies, oldCodes: enabled.backupCodes };
  }

  async function backupLogin(email: string, code: string) {
    const { headers } = await auth.api.signInEmail({
      body: { email, password: PASSWORD },
      returnHeaders: true,
    });
    return auth.api.verifyBackupCode({ body: { code }, headers: cookieHeader(headers) });
  }

  it("nové záložní kódy zneplatní staré, vyžadují heslo a jdou do auditu bez kódů", async () => {
    const { email, userId, cookies, oldCodes } = await withTotp(false);

    await expect(
      auth.api.generateBackupCodes({ body: { password: "špatné-heslo-123" }, headers: cookies }),
    ).rejects.toThrow();
    expect(await auditFor(userId, "regenerate_backup_codes")).toHaveLength(0);

    const fresh = await auth.api.generateBackupCodes({
      body: { password: PASSWORD },
      headers: cookies,
    });
    expect(fresh.backupCodes.length).toBe(oldCodes.length);
    expect(fresh.backupCodes.some((c) => oldCodes.includes(c))).toBe(false);

    await expect(backupLogin(email, oldCodes[0]!)).rejects.toThrow();
    await expect(backupLogin(email, fresh.backupCodes[0]!)).resolves.toBeDefined();

    const audit = await auditFor(userId, "regenerate_backup_codes");
    expect(audit).toHaveLength(1);
    const text = JSON.stringify(await app.db.select().from(schema.auditLog));
    for (const c of [...oldCodes, ...fresh.backupCodes]) expect(text).not.toContain(c);
  });

  it("roli s povinným 2FA ho nejde vypnout, ostatním ano (s heslem) a vypnutí je v auditu", async () => {
    const strict = await withTotp(true);
    await expect(
      auth.api.disableTwoFactor({ body: { password: PASSWORD }, headers: strict.cookies }),
    ).rejects.toMatchObject({ body: { code: "TWO_FACTOR_REQUIRED_FOR_ROLE" } });
    const [still] = await app.db
      .select({ on: schema.user.twoFactorEnabled })
      .from(schema.user)
      .where(eq(schema.user.id, strict.userId));
    expect(still!.on).toBe(true);
    expect(await auditFor(strict.userId, "disable_2fa")).toHaveLength(0);

    const free = await withTotp(false);
    await expect(
      auth.api.disableTwoFactor({ body: { password: "špatné-heslo-123" }, headers: free.cookies }),
    ).rejects.toThrow();
    await auth.api.disableTwoFactor({ body: { password: PASSWORD }, headers: free.cookies });
    const [off] = await app.db
      .select({ on: schema.user.twoFactorEnabled })
      .from(schema.user)
      .where(eq(schema.user.id, free.userId));
    expect(off!.on).toBe(false);
    expect(await auditFor(free.userId, "disable_2fa")).toHaveLength(1);
  });
});
