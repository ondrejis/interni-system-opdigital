import { and, eq, like, notLike } from "drizzle-orm";
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
    // pozvánka platí 48 hodin (AUT-02)
    const left = inv!.expiresAt.getTime() - Date.now();
    expect(left).toBeGreaterThan(47.9 * 3_600_000);
    expect(left).toBeLessThanOrEqual(48 * 3_600_000);
    expect(mail.vars.expiresIn).toBe("48 hodin");

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
  it("po přijetí pozvánky se uživatel přihlásí; bez druhého faktoru je kontext omezený, s ním má oprávnění role", async () => {
    const role = await makeRole({ perms: ["zakazky.read"] });
    const { email, userId } = await onboard(role.id);
    const { cookies, response } = await signIn(email);
    expect("twoFactorRedirect" in response).toBe(false);

    // povinné 2FA platí pro každou roli, i bez příznaku `require_2fa`
    const restricted = await resolveCtx({ auth, db: app.db, headers: cookies, catalog });
    expect(restricted?.actor.userId).toBe(userId);
    expect(restricted?.actor.restriction).toBe("2fa_setup");
    expect(can(restricted!, "zakazky.read")).toBe(false);

    const enabled = await enableTotp(cookies);
    const verified = await auth.api.verifyTOTP({
      body: { code: totpCode(secretFromTotpUri(enabled.totpURI)) },
      headers: cookies,
      returnHeaders: true,
    });
    const full = cookieHeader(verified.headers, cookies.get("cookie") ?? "");
    const ctx = await resolveCtx({ auth, db: app.db, headers: full, catalog });
    expect(ctx?.actor.restriction).toBeNull();
    expect(can(ctx!, "zakazky.read")).toBe(true);
    expect(can(ctx!, "users.manage")).toBe(false);

    const [u] = await app.db.select().from(schema.user).where(eq(schema.user.id, userId));
    expect(u?.lastLoginAt).toBeInstanceOf(Date);
    expect(u?.shortName).toBe("JN");
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
      .set({ createdAt: new Date(Date.now() - 91 * 86_400_000) })
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

  it("omezení počtu pokusů: po pěti chybných pokusech za 15 minut se šestý zablokuje (429), i se správným heslem", async () => {
    const role = await makeRole();
    const { email, userId } = await onboard(role.id);
    const ip = `198.51.100.${Math.floor(Math.random() * 250) + 1}`;
    const attempt = (password: string, from = ip) =>
      auth.handler(
        new Request(`${baseURL}/api/auth/sign-in/email`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: baseURL, "x-forwarded-for": from },
          body: JSON.stringify({ email, password }),
        }),
      );
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await attempt("špatné-heslo-123")).status);
    expect(statuses).toEqual([401, 401, 401, 401, 401]);
    expect((await attempt(PASSWORD)).status).toBe(429);
    expect((await attempt("špatné-heslo-123")).status).toBe(429);
    const blocked = await (await attempt(PASSWORD)).json();
    expect(blocked).toMatchObject({ code: "TOO_MANY_LOGIN_ATTEMPTS" });

    // jiná adresa stejného účtu zablokovaná není (omezení je na dvojici účet + IP)
    const other = `203.0.113.${Math.floor(Math.random() * 250) + 1}`;
    expect((await attempt(PASSWORD, other)).status).toBe(200);

    // do historie: pět neúspěšných pokusů a jedno zablokování (jen první)
    const events = await app.db
      .select({ action: schema.auditLog.action, category: schema.auditLog.category })
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.entityType, "user"), eq(schema.auditLog.entityId, userId)));
    expect(events.filter((e) => e.action === "login_failed")).toHaveLength(5);
    expect(events.filter((e) => e.action === "login_blocked")).toHaveLength(1);
    expect(
      events.filter((e) => e.action === "login_failed").every((e) => e.category === "security"),
    ).toBe(true);
  });

  it("po vypršení okna se počítadlo vynuluje a úspěšné přihlášení smaže neúspěšné pokusy", async () => {
    const role = await makeRole();
    const { email } = await onboard(role.id);
    const ip = `192.0.2.${Math.floor(Math.random() * 250) + 1}`;
    const post = (password: string) =>
      auth.handler(
        new Request(`${baseURL}/api/auth/sign-in/email`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: baseURL, "x-forwarded-for": ip },
          body: JSON.stringify({ email, password }),
        }),
      );
    for (let i = 0; i < 4; i++) expect((await post("špatné-heslo-123")).status).toBe(401);
    expect((await post(PASSWORD)).status).toBe(200); // čtvrtý neúspěch + správné heslo: povoleno, počítadlo pryč
    // vlastní omezení knihovny (8 / min na adresu) tu nesmí překážet: testuje se jen omezení OPSYS
    await app.db.delete(schema.rateLimit).where(notLike(schema.rateLimit.key, "app:%"));
    for (let i = 0; i < 5; i++) expect((await post("špatné-heslo-123")).status).toBe(401);
    expect((await post(PASSWORD)).status).toBe(429);
    // simulace uplynutí 15 minut: okno počítadla je pevné od prvního neúspěchu
    await app.db
      .update(schema.rateLimit)
      .set({ lastRequest: Date.now() - 16 * 60_000 })
      .where(like(schema.rateLimit.key, "app:login:%"));
    expect((await post(PASSWORD)).status).toBe(200);
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
