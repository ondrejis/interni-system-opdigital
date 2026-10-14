import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { schema } from "../db/client";
import { newId } from "../db/ids";
import { createCtx } from "../rbac/context";
import { loadActor } from "../rbac/actor";
import { can } from "../rbac/permissions";
import { PermissionError, UserError } from "../rbac/errors";
import {
  connectAppDb,
  cookieHeader,
  createTestAuth,
  fakeMailer,
  secretFromTotpUri,
  totpCode,
  uniqueEmail,
} from "../testing";
import {
  acceptInvitation,
  createInvitation,
  inspectInvitation,
  revokeInvitation,
} from "./invitations";
import { resolveCtx } from "./session";

const app = connectAppDb();
const mailer = fakeMailer();
const auth = createTestAuth(app.db, mailer);
const baseURL = "http://localhost:3000";
const PASSWORD = "správné-heslo-123";
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

/** Správce s oprávněním zvát uživatele (kontext jako po přihlášení). */
async function adminCtx() {
  const role = await makeRole({ isSystem: true });
  const [u] = await app.db
    .insert(schema.user)
    .values({ name: "Správce", email: uniqueEmail("admin"), roleId: role.id })
    .returning();
  const actor = (await loadActor(app.db, u!.id, { catalog }))!;
  return { ctx: createCtx(app.db, actor), userId: u!.id };
}

/** Pozve a přijme pozvánku; vrací e-mail uživatele. */
async function onboard(roleId: string, name = "Jana Nováková") {
  const { ctx } = await adminCtx();
  const email = uniqueEmail("inv");
  await createInvitation(ctx, { email, roleId }, { mailer, baseURL });
  const token = mailer.last("invitation")!.vars.url!.split("/pozvanka/")[1]!;
  const { userId } = await acceptInvitation(
    { auth, db: app.db },
    { token, name, password: PASSWORD },
  );
  return { email, userId, token };
}

async function enableTotp(cookies: Headers) {
  const res = await auth.api.enableTwoFactor({
    body: { password: PASSWORD, method: "totp" },
    headers: cookies,
  });
  if (res.method !== "totp") throw new Error("Očekáváno TOTP");
  return res;
}

async function signIn(email: string, password = PASSWORD) {
  const { headers, response } = await auth.api.signInEmail({
    body: { email, password },
    returnHeaders: true,
  });
  return { cookies: cookieHeader(headers), response };
}

describe("pozvánky", () => {
  it("pozvánka vznikne s tokenem jen v odkazu, v DB je otisk, a zapíše se audit", async () => {
    const role = await makeRole();
    const { ctx } = await adminCtx();
    const email = uniqueEmail("a");
    await createInvitation(ctx, { email, roleId: role.id }, { mailer, baseURL });
    const mail = mailer.last("invitation")!;
    expect(mail.to).toBe(email);
    const token = mail.vars.url!.split("/pozvanka/")[1]!;
    expect(mail.vars.url).toMatch(/^http:\/\/localhost:3000\/pozvanka\/[\w-]{40,}$/);

    const [inv] = await app.db
      .select()
      .from(schema.invitation)
      .where(eq(schema.invitation.email, email));
    expect(inv!.tokenHash).not.toContain(token);
    expect(inv!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(inv!.expiresAt.getTime() - Date.now()).toBeGreaterThan(6.9 * 86_400_000);

    const audit = await app.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entityId, inv!.id));
    expect(audit[0]).toMatchObject({
      action: "create",
      entityType: "invitation",
      actorKind: "user",
    });
    expect(JSON.stringify(audit[0])).not.toContain(token);
    expect(await inspectInvitation(app.db, token)).toMatchObject({ email });
  });

  it("zvát smí jen ten, kdo má users.manage", async () => {
    const role = await makeRole();
    const plainRole = await makeRole({ perms: ["zakazky.read"] });
    const [u] = await app.db
      .insert(schema.user)
      .values({ name: "Obyčejný", email: uniqueEmail(), roleId: plainRole.id })
      .returning();
    const ctx = createCtx(app.db, (await loadActor(app.db, u!.id, { catalog }))!);
    await expect(
      createInvitation(ctx, { email: uniqueEmail(), roleId: role.id }, { mailer, baseURL }),
    ).rejects.toThrow(PermissionError);
  });

  it("nová pozvánka na stejný e-mail zneplatní předchozí; zrušená ani vypršelá nejde přijmout", async () => {
    const role = await makeRole();
    const { ctx } = await adminCtx();
    const email = uniqueEmail("re");
    await createInvitation(ctx, { email, roleId: role.id }, { mailer, baseURL });
    const first = mailer.last("invitation")!.vars.url!.split("/pozvanka/")[1]!;
    await createInvitation(ctx, { email, roleId: role.id }, { mailer, baseURL });
    const second = mailer.last("invitation")!.vars.url!.split("/pozvanka/")[1]!;

    await expect(
      acceptInvitation({ auth, db: app.db }, { token: first, name: "Test", password: PASSWORD }),
    ).rejects.toThrow(UserError);
    expect(await inspectInvitation(app.db, first)).toBeNull();

    const [inv] = await app.db
      .select()
      .from(schema.invitation)
      .where(eq(schema.invitation.email, email));
    void inv;
    await app.db
      .update(schema.invitation)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.invitation.email, email));
    await expect(
      acceptInvitation({ auth, db: app.db }, { token: second, name: "Test", password: PASSWORD }),
    ).rejects.toThrow(/neplatná nebo vypršela/);

    const email2 = uniqueEmail("rv");
    await createInvitation(ctx, { email: email2, roleId: role.id }, { mailer, baseURL });
    const t = mailer.last("invitation")!.vars.url!.split("/pozvanka/")[1]!;
    const [row] = await app.db
      .select()
      .from(schema.invitation)
      .where(eq(schema.invitation.email, email2));
    await revokeInvitation(ctx, row!.id);
    await expect(
      acceptInvitation({ auth, db: app.db }, { token: t, name: "Test", password: PASSWORD }),
    ).rejects.toThrow(UserError);
  });

  it("pozvánku nejde přijmout dvakrát, ani souběžně", async () => {
    const role = await makeRole();
    const { ctx } = await adminCtx();
    await createInvitation(
      ctx,
      { email: uniqueEmail("race"), roleId: role.id },
      { mailer, baseURL },
    );
    const token = mailer.last("invitation")!.vars.url!.split("/pozvanka/")[1]!;
    const results = await Promise.allSettled([
      acceptInvitation({ auth, db: app.db }, { token, name: "Jedna", password: PASSWORD }),
      acceptInvitation({ auth, db: app.db }, { token, name: "Dvě", password: PASSWORD }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("příliš krátké heslo se odmítne a pozvánka zůstane platná", async () => {
    const role = await makeRole();
    const { ctx } = await adminCtx();
    await createInvitation(ctx, { email: uniqueEmail("pw"), roleId: role.id }, { mailer, baseURL });
    const token = mailer.last("invitation")!.vars.url!.split("/pozvanka/")[1]!;
    await expect(
      acceptInvitation({ auth, db: app.db }, { token, name: "Test", password: "krátké" }),
    ).rejects.toThrow(/alespoň 12 znaků/);
    expect(await inspectInvitation(app.db, token)).not.toBeNull();
  });

  it("nelze pozvat existujícího uživatele", async () => {
    const role = await makeRole();
    const { email } = await onboard(role.id);
    const { ctx } = await adminCtx();
    await expect(
      createInvitation(ctx, { email: email.toUpperCase(), roleId: role.id }, { mailer, baseURL }),
    ).rejects.toThrow(/už existuje/);
  });
});

describe("přihlášení", () => {
  it("po přijetí pozvánky se uživatel přihlásí a kontext má oprávnění jeho role", async () => {
    const role = await makeRole({ perms: ["zakazky.read"] });
    const { email, userId } = await onboard(role.id);
    const { cookies, response } = await signIn(email);
    expect("twoFactorRedirect" in response).toBe(false);

    const ctx = await resolveCtx({ auth, db: app.db, headers: cookies, catalog });
    expect(ctx?.actor.userId).toBe(userId);
    expect(can(ctx!, "zakazky.read")).toBe(true);
    expect(can(ctx!, "users.manage")).toBe(false);

    const [u] = await app.db.select().from(schema.user).where(eq(schema.user.id, userId));
    expect(u?.lastLoginAt).toBeInstanceOf(Date);
    const events = await app.db
      .select()
      .from(schema.loginEvent)
      .where(eq(schema.loginEvent.userId, userId));
    expect(events.map((e) => e.outcome)).toContain("success");
  });

  it("heslo je uložené jako argon2id", async () => {
    const role = await makeRole();
    const { userId } = await onboard(role.id);
    const [acc] = await app.db
      .select()
      .from(schema.account)
      .where(eq(schema.account.userId, userId));
    expect(acc?.password).toMatch(/^\$argon2id\$/);
  });

  it("špatné heslo se odmítne a zapíše do historie přihlášení", async () => {
    const role = await makeRole();
    const { email, userId } = await onboard(role.id);
    await expect(
      auth.api.signInEmail({ body: { email, password: "špatné-heslo-123" } }),
    ).rejects.toThrow();
    const events = await app.db
      .select()
      .from(schema.loginEvent)
      .where(eq(schema.loginEvent.userId, userId));
    expect(events.map((e) => e.outcome)).toContain("failed");
  });

  it("deaktivovaný uživatel se nepřihlásí a jeho stará relace přestane platit", async () => {
    const role = await makeRole({ perms: ["zakazky.read"] });
    const { email, userId } = await onboard(role.id);
    const { cookies } = await signIn(email);
    await app.db.update(schema.user).set({ active: false }).where(eq(schema.user.id, userId));
    expect(await resolveCtx({ auth, db: app.db, headers: cookies, catalog })).toBeNull();
    await expect(auth.api.signInEmail({ body: { email, password: PASSWORD } })).rejects.toThrow();
  });

  it("relace starší než absolutní maximum se zruší, i když je aktivní", async () => {
    const role = await makeRole();
    const { email, userId } = await onboard(role.id);
    const { cookies } = await signIn(email);
    await app.db
      .update(schema.session)
      .set({ createdAt: new Date(Date.now() - 31 * 86_400_000) })
      .where(eq(schema.session.userId, userId));
    expect(await resolveCtx({ auth, db: app.db, headers: cookies, catalog })).toBeNull();
  });

  it("po neaktivitě relace vyprší (klouzavé odhlášení)", async () => {
    const role = await makeRole();
    const { email, userId } = await onboard(role.id);
    const { cookies } = await signIn(email);
    expect(await resolveCtx({ auth, db: app.db, headers: cookies, catalog })).not.toBeNull();
    await app.db
      .update(schema.session)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.session.userId, userId));
    expect(await resolveCtx({ auth, db: app.db, headers: cookies, catalog })).toBeNull();
  });

  it("omezení počtu pokusů: po osmi chybných přihláštních vrátí 429 (počítadlo v DB)", async () => {
    const role = await makeRole();
    const { email } = await onboard(role.id);
    const ip = `198.51.100.${Math.floor(Math.random() * 250) + 1}`;
    const attempt = () =>
      auth.handler(
        new Request(`${baseURL}/api/auth/sign-in/email`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: baseURL, "x-forwarded-for": ip },
          body: JSON.stringify({ email, password: "špatné-heslo-123" }),
        }),
      );
    const statuses: number[] = [];
    for (let i = 0; i < 10; i++) statuses.push((await attempt()).status);
    expect(statuses.slice(0, 8).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(8)).toEqual([429, 429]);
    const rows = await app.db.select().from(schema.rateLimit);
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe("reset hesla", () => {
  it("odkaz z e-mailu nastaví nové heslo, staré přestane platit a relace se zruší", async () => {
    const role = await makeRole();
    const { email, userId } = await onboard(role.id);
    const { cookies } = await signIn(email);

    await auth.api.requestPasswordReset({ body: { email, redirectTo: "/obnova-hesla" } });
    const mail = mailer.last("password-reset")!;
    expect(mail.to).toBe(email);
    const token = new URL(mail.vars.url!).pathname.split("/").pop()!;

    await auth.api.resetPassword({ body: { token, newPassword: "úplně-nové-heslo-456" } });
    await expect(auth.api.signInEmail({ body: { email, password: PASSWORD } })).rejects.toThrow();
    await expect(
      auth.api.signInEmail({ body: { email, password: "úplně-nové-heslo-456" } }),
    ).resolves.toBeDefined();
    const remaining = await app.db
      .select()
      .from(schema.session)
      .where(eq(schema.session.userId, userId));
    expect(remaining.length).toBe(1); // jen nová relace z posledního přihlášení
    void cookies;
  });
});

describe("dvoufázové ověření", () => {
  it("TOTP: zapnutí, přihlášení s výzvou a ověření kódem", async () => {
    const role = await makeRole({ perms: ["zakazky.read"] });
    const { email, userId } = await onboard(role.id);
    const first = await signIn(email);

    const enabled = await enableTotp(first.cookies);
    const secret = secretFromTotpUri(enabled.totpURI);
    expect(enabled.backupCodes.length).toBeGreaterThan(5);
    let [u] = await app.db.select().from(schema.user).where(eq(schema.user.id, userId));
    expect(u?.twoFactorEnabled).toBe(false); // až po potvrzení prvního kódu

    await auth.api.verifyTOTP({ body: { code: totpCode(secret) }, headers: first.cookies });
    [u] = await app.db.select().from(schema.user).where(eq(schema.user.id, userId));
    expect(u?.twoFactorEnabled).toBe(true);

    // nové přihlášení heslem už samo relaci nedá
    const { headers, response } = await auth.api.signInEmail({
      body: { email, password: PASSWORD },
      returnHeaders: true,
    });
    expect("twoFactorRedirect" in response && response.twoFactorRedirect).toBe(true);
    const pending = cookieHeader(headers);
    expect(await resolveCtx({ auth, db: app.db, headers: pending, catalog })).toBeNull();

    // špatný kód nepustí, správný ano
    await expect(
      auth.api.verifyTOTP({ body: { code: "000000" }, headers: pending }),
    ).rejects.toThrow();
    const ok = await auth.api.verifyTOTP({
      body: { code: totpCode(secret) },
      headers: pending,
      returnHeaders: true,
    });
    const sessionCookies = cookieHeader(ok.headers, pending.get("cookie") ?? "");
    const ctx = await resolveCtx({ auth, db: app.db, headers: sessionCookies, catalog });
    expect(ctx?.actor.userId).toBe(userId);
  });

  it("záložní kód funguje jednou", async () => {
    const role = await makeRole();
    const { email } = await onboard(role.id);
    const first = await signIn(email);
    const enabled = await enableTotp(first.cookies);
    await auth.api.verifyTOTP({
      body: { code: totpCode(secretFromTotpUri(enabled.totpURI)) },
      headers: first.cookies,
    });
    const code = enabled.backupCodes[0]!;

    const attempt = async () => {
      const { headers } = await auth.api.signInEmail({
        body: { email, password: PASSWORD },
        returnHeaders: true,
      });
      return auth.api.verifyBackupCode({ body: { code }, headers: cookieHeader(headers) });
    };
    await expect(attempt()).resolves.toBeDefined();
    await expect(attempt()).rejects.toThrow();
  });

  it("role s povinným 2FA: bez nastaveného 2FA je relace omezená, po nastavení plná", async () => {
    const role = await makeRole({ require2fa: true, perms: ["zakazky.read"] });
    const { email, userId } = await onboard(role.id);
    const first = await signIn(email);

    const before = await resolveCtx({ auth, db: app.db, headers: first.cookies, catalog });
    expect(before?.actor.restriction).toBe("2fa_setup");
    expect(can(before!, "zakazky.read")).toBe(false);
    expect(can(before!, "account.self")).toBe(true);

    const enabled = await enableTotp(first.cookies);
    // potvrzení prvního kódu vystaví novou relaci (cookie z odpovědi nahradí starou)
    const verified = await auth.api.verifyTOTP({
      body: { code: totpCode(secretFromTotpUri(enabled.totpURI)) },
      headers: first.cookies,
      returnHeaders: true,
    });
    const refreshed = cookieHeader(verified.headers, first.cookies.get("cookie") ?? "");
    const after = await resolveCtx({ auth, db: app.db, headers: refreshed, catalog });
    expect(after?.actor.restriction).toBeNull();
    expect(can(after!, "zakazky.read")).toBe(true);
    void userId;
  });
});
