import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  INVITATION_TTL_HOURS,
  LOGIN_LIMIT,
  acceptInvitation,
  createInvitation,
  inspectInvitation,
  listOwnSessions,
  listSecurityEvents,
  listTrustedDevices,
  resolveCtx,
  revokeUserSessions,
  securityVisibility,
  type RangeFetcher,
} from "@rebar/core/auth";
import { schema } from "@rebar/core/db";
import { PermissionError, UserError, can, createCtx, loadActor } from "@rebar/core/rbac";
import {
  connectAppDb,
  cookieHeader,
  createTestAuth,
  fakeMailer,
  secretFromTotpUri,
  totpCode,
  uniqueEmail,
} from "@rebar/core/testing";

/*
  AS-07 Přihlášení a 2FA (C §AS-07): pozvánka platná 48 h → heslo ≥ 12 znaků, TOTP, záložní kódy; bez 2FA nejde dál;
  důvěryhodné zařízení 30 dní bez kódu; šestý pokus za 15 minut je zablokován; Ondřej odhlásí Patrikovo zařízení.
  Celý průchod jde přes skutečnou knihovnu přihlášení (cookie, hooky) nad skutečnou databází, bez mocků.
*/

const app = connectAppDb();
const mailer = fakeMailer();
const auth = createTestAuth(app.db, mailer);
const baseURL = "http://localhost:3000";
afterAll(() => app.close());

const catalog = new Set(["users.manage", "zakazky.read", "account.self"]);
const PASSWORD = "Tři-stříbrné-stříkačky-2026";
const sha1 = (v: string) => createHash("sha1").update(v).digest("hex").toUpperCase();

const ownerRole = async () => {
  const [r] = await app.db
    .insert(schema.role)
    .values({
      key: `as07-owner-${crypto.randomUUID().slice(0, 8)}`,
      name: "Vlastník",
      isSystem: true,
    })
    .returning();
  return r!;
};
const partnerRole = async () => {
  const [r] = await app.db
    .insert(schema.role)
    .values({ key: `as07-partner-${crypto.randomUUID().slice(0, 8)}`, name: "Partner" })
    .returning();
  await app.db
    .insert(schema.rolePermission)
    .values({ roleId: r!.id, permission: "zakazky.read", scope: "all" });
  return r!;
};

async function ctxOf(userId: string) {
  return createCtx(app.db, (await loadActor(app.db, userId, { catalog }))!);
}

/** Sdílené záložní „cookie jar“ jednoho zařízení: spojuje Set-Cookie z odpovědí. */
const jar = (prev: Headers | string | null, res: Headers) =>
  cookieHeader(res, typeof prev === "string" ? prev : (prev?.get("cookie") ?? ""));
const withIp = (cookies: Headers | null, ip: string) => {
  const h = new Headers(cookies ?? {});
  h.set("x-forwarded-for", ip);
  return h;
};
const randomIp = () => `198.51.100.${1 + Math.floor(Math.random() * 250)}`;

/** Odpověď služby „range“ pro dané heslo (uniklé) nebo prázdná. */
const rangeFor = (leaked: string[]): RangeFetcher =>
  vi.fn(async (prefix: string) =>
    leaked
      .map(sha1)
      .filter((h) => h.startsWith(prefix))
      .map((h) => `${h.slice(5)}:1000`)
      .join("\r\n"),
  );

describe("AS-07: přihlášení a 2FA", () => {
  const ownerId = { value: "" };
  const patrik = { id: "", email: uniqueEmail("patrik"), token: "" };
  let ownerCtx: Awaited<ReturnType<typeof ctxOf>>;
  const patrikDevice = { cookies: null as Headers | null, secret: "" };

  it("Ondřej pozve Patrika: odkaz platí 48 hodin, token je jen v odkazu, účet bez pozvánky vzniknout nejde", async () => {
    const [o] = await app.db
      .insert(schema.user)
      .values({
        name: "Ondřej Dvořák",
        email: uniqueEmail("ondrej"),
        roleId: (await ownerRole()).id,
      })
      .returning();
    ownerId.value = o!.id;
    ownerCtx = await ctxOf(o!.id);
    const role = await partnerRole();

    await createInvitation(ownerCtx, { email: patrik.email, roleId: role.id }, { mailer, baseURL });
    const mail = mailer.last("invitation")!;
    patrik.token = mail.vars.url!.split("/pozvanka/")[1]!;
    const [inv] = await app.db
      .select()
      .from(schema.invitation)
      .where(eq(schema.invitation.email, patrik.email));
    const hours = (inv!.expiresAt.getTime() - Date.now()) / 3_600_000;
    expect(INVITATION_TTL_HOURS).toBe(48);
    expect(hours).toBeGreaterThan(47.9);
    expect(hours).toBeLessThanOrEqual(48);
    expect(inv!.tokenHash).not.toContain(patrik.token);

    // veřejná registrace neexistuje
    await expect(
      auth.api.signUpEmail({
        body: { email: uniqueEmail("cizi"), password: PASSWORD, name: "Cizí" },
      }),
    ).rejects.toThrow();
    // zvát smí jen správce uživatelů; Patrik ne
    const [p] = await app.db
      .insert(schema.user)
      .values({ name: "Někdo", email: uniqueEmail("nekdo"), roleId: role.id })
      .returning();
    await expect(
      createInvitation(
        await ctxOf(p!.id),
        { email: uniqueEmail("x"), roleId: role.id },
        { mailer, baseURL },
      ),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("prošlá pozvánka (po 48 h) nejde přijmout", async () => {
    const role = await partnerRole();
    const email = uniqueEmail("late");
    await createInvitation(ownerCtx, { email, roleId: role.id }, { mailer, baseURL });
    const token = mailer.last("invitation")!.vars.url!.split("/pozvanka/")[1]!;
    await app.db
      .update(schema.invitation)
      .set({ expiresAt: sql`now() - interval '1 minute'` })
      .where(eq(schema.invitation.email, email));
    expect(await inspectInvitation(app.db, token)).toBeNull();
    await expect(
      acceptInvitation({ auth, db: app.db }, { token, name: "Pozdě Příliš", password: PASSWORD }),
    ).rejects.toThrow(/neplatná nebo vypršela/);
  });

  it("heslo musí mít ≥ 12 znaků a nesmí být běžné, osobní ani uniklé; zamítnutí pozvánku nespotřebuje", async () => {
    const leaked = "Unikle-Heslo-2026!";
    const breachCheck = rangeFor([leaked]);
    const attempt = (password: string) =>
      acceptInvitation(
        { auth, db: app.db, breachCheck },
        { token: patrik.token, name: "Patrik Šilhánek", password },
      );

    await expect(attempt("Krátké-1234")).rejects.toThrow(/alespoň 12 znaků/);
    await expect(attempt("password12345")).rejects.toThrow(/běžné/);
    await expect(attempt("Moje-silhanek-2026-x")).rejects.toThrow(/jméno, e-mail/);
    await expect(attempt(leaked)).rejects.toThrow(/uniklých databázích/);
    await expect(attempt("password12345")).rejects.toBeInstanceOf(UserError);
    expect(await inspectInvitation(app.db, patrik.token)).not.toBeNull();

    // kontrola uniklých hesel je k-anonymní: ven jde jen 5znaková předpona otisku, nikdy heslo
    const calls = (breachCheck as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((p) => /^[0-9A-F]{5}$/.test(p))).toBe(true);

    const { userId } = await attempt(PASSWORD);
    patrik.id = userId;
    expect(await inspectInvitation(app.db, patrik.token)).toBeNull(); // použitá pozvánka neplatí
    await expect(attempt(PASSWORD)).rejects.toThrow(/neplatná nebo vypršela/);
  });

  it("bez druhého faktoru se Patrik dál nedostane: přihlášení heslem dá jen omezený kontext", async () => {
    const res = await auth.api.signInEmail({
      body: { email: patrik.email, password: PASSWORD },
      headers: withIp(null, randomIp()),
      returnHeaders: true,
    });
    const cookies = jar(null, res.headers);
    const ctx = await resolveCtx({ auth, db: app.db, headers: cookies, catalog });
    expect(ctx?.actor.restriction).toBe("2fa_setup");
    expect(can(ctx!, "zakazky.read")).toBe(false);
    expect(can(ctx!, "users.manage")).toBe(false);
    expect(can(ctx!, "account.self")).toBe(true);
    patrikDevice.cookies = cookies;
  });

  it("nastavení 2FA: TOTP + 10 záložních kódů; teprve pak plný přístup", async () => {
    const cookies = patrikDevice.cookies!;
    const enabled = await auth.api.enableTwoFactor({
      body: { password: PASSWORD, method: "totp" },
      headers: cookies,
    });
    if (enabled.method !== "totp") throw new Error("Očekáváno TOTP");
    expect(enabled.backupCodes).toHaveLength(10);
    patrikDevice.secret = secretFromTotpUri(enabled.totpURI);

    // dokud se první kód nepotvrdí, přístup zůstává zavřený
    expect(
      (await resolveCtx({ auth, db: app.db, headers: cookies, catalog }))?.actor.restriction,
    ).toBe("2fa_setup");
    await expect(
      auth.api.verifyTOTP({ body: { code: "000000" }, headers: cookies }),
    ).rejects.toThrow();

    const verified = await auth.api.verifyTOTP({
      body: { code: totpCode(patrikDevice.secret) },
      headers: cookies,
      returnHeaders: true,
    });
    const full = jar(cookies, verified.headers);
    const ctx = await resolveCtx({ auth, db: app.db, headers: full, catalog });
    expect(ctx?.actor.restriction).toBeNull();
    expect(can(ctx!, "zakazky.read")).toBe(true);
    patrikDevice.cookies = full;
  });

  it("další přihlášení heslem samo relaci nedá; špatný kód nepustí; správný kód s volbou „důvěřovat zařízení“ ano", async () => {
    const ip = randomIp();
    const first = await auth.api.signInEmail({
      body: { email: patrik.email, password: PASSWORD },
      headers: withIp(null, ip),
      returnHeaders: true,
    });
    expect("twoFactorRedirect" in first.response && first.response.twoFactorRedirect).toBe(true);
    const pending = jar(withIp(null, ip), first.headers);
    expect(await resolveCtx({ auth, db: app.db, headers: pending, catalog })).toBeNull();

    await expect(
      auth.api.verifyTOTP({ body: { code: "000000" }, headers: pending }),
    ).rejects.toThrow();
    expect(await resolveCtx({ auth, db: app.db, headers: pending, catalog })).toBeNull();

    const ok = await auth.api.verifyTOTP({
      body: { code: totpCode(patrikDevice.secret), trustDevice: true },
      headers: pending,
      returnHeaders: true,
    });
    const trusted = jar(pending, ok.headers);
    expect(trusted.get("cookie")).toContain("trust_device");
    const ctx = await resolveCtx({ auth, db: app.db, headers: trusted, catalog });
    expect(ctx?.actor.userId).toBe(patrik.id);
    expect(ctx?.actor.restriction).toBeNull();

    // správa důvěryhodných zařízení: jedno, platí 30 dní, je to „toto“ zařízení
    const devices = await listTrustedDevices(ctx!, trusted.get("cookie"));
    expect(devices).toHaveLength(1);
    const days = (devices[0]!.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThanOrEqual(30);
    expect(devices[0]!.current).toBe(true);
    patrikDevice.cookies = trusted;
  });

  it("z důvěryhodného zařízení se kód 30 dní nevyžaduje, z jiného ano; po vypršení důvěry se kód vyžádá znovu", async () => {
    // stejné zařízení (cookie `trust_device`): rovnou plná relace
    const again = await auth.api.signInEmail({
      body: { email: patrik.email, password: PASSWORD },
      headers: withIp(patrikDevice.cookies, randomIp()),
      returnHeaders: true,
    });
    expect("twoFactorRedirect" in again.response).toBe(false);
    const session = jar(patrikDevice.cookies, again.headers);
    const ctx = await resolveCtx({ auth, db: app.db, headers: session, catalog });
    expect(ctx?.actor.restriction).toBeNull();
    // platnost se při použití obnoví: pořád jedno zařízení
    expect(await listTrustedDevices(ctx!, session.get("cookie"))).toHaveLength(1);

    // jiné zařízení (bez cookie) kód potřebuje
    const other = await auth.api.signInEmail({
      body: { email: patrik.email, password: PASSWORD },
      headers: withIp(null, randomIp()),
    });
    expect("twoFactorRedirect" in other && other.twoFactorRedirect).toBe(true);

    // důvěra po 30 dnech vyprší
    await app.db
      .update(schema.verification)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(and(eq(schema.verification.value, patrik.id), sql`identifier like 'trust-device-%'`));
    const expired = await auth.api.signInEmail({
      body: { email: patrik.email, password: PASSWORD },
      headers: withIp(session, randomIp()),
    });
    expect("twoFactorRedirect" in expired && expired.twoFactorRedirect).toBe(true);
  });

  it("šestý pokus o přihlášení za 15 minut je zablokován, i se správným heslem; jiná adresa ne", async () => {
    const post = (password: string, ip: string) =>
      auth.handler(
        new Request(`${baseURL}/api/auth/sign-in/email`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: baseURL, "x-forwarded-for": ip },
          body: JSON.stringify({ email: patrik.email, password }),
        }),
      );
    const ip = randomIp();
    expect(LOGIN_LIMIT).toEqual({ attempts: 5, windowSeconds: 900 });
    for (let i = 0; i < LOGIN_LIMIT.attempts; i++)
      expect((await post("Špatné-heslo-12345", ip)).status).toBe(401);
    const blocked = await post(PASSWORD, ip);
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({ code: "TOO_MANY_LOGIN_ATTEMPTS" });

    // zablokovaný pokus nenastaví relaci a nezmění nic dalšího
    const [recent] = await app.db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.session)
      .where(and(eq(schema.session.userId, patrik.id), eq(schema.session.ipAddress, ip)));
    expect(recent!.n).toBe(0);
    // pro jinou adresu omezení neplatí (stejný účet, jiná IP: pozná se podle 2FA výzvy místo 429)
    expect((await post(PASSWORD, randomIp())).status).toBe(200);
  });

  it("do historie jde přihlášení, neúspěšné pokusy, zablokování, chybný kód i změny zařízení (kategorie security)", async () => {
    const rows = await app.db
      .select({
        action: schema.auditLog.action,
        category: schema.auditLog.category,
        entityId: schema.auditLog.entityId,
      })
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.entityType, "user"), eq(schema.auditLog.entityId, patrik.id)));
    const actions = new Set(rows.map((r) => r.action));
    for (const a of [
      "login",
      "login_failed",
      "login_blocked",
      "two_factor_failed",
      "enable_2fa",
      "trusted_device_added",
    ])
      expect(actions, a).toContain(a);
    expect(rows.every((r) => r.category === "security")).toBe(true);
    // do historie nepatří hesla ani kódy
    const text = JSON.stringify(
      await app.db.select().from(schema.auditLog).where(eq(schema.auditLog.entityId, patrik.id)),
    );
    expect(text).not.toContain(PASSWORD);
    expect(text).not.toContain(patrikDevice.secret);
  });

  it("Ondřej odhlásí Patrikovo zařízení: relace i důvěryhodná zařízení zmizí, Patrik se musí přihlásit znovu s kódem", async () => {
    const live = await auth.api.signInEmail({
      body: { email: patrik.email, password: PASSWORD },
      headers: withIp(patrikDevice.cookies, randomIp()),
      returnHeaders: true,
    });
    const cookies = jar(patrikDevice.cookies, live.headers);
    // po vypršení z minulého testu zařízení důvěryhodné není: ověřit kódem a označit znovu
    let session = cookies;
    if ("twoFactorRedirect" in live.response && live.response.twoFactorRedirect) {
      const ok = await auth.api.verifyTOTP({
        body: { code: totpCode(patrikDevice.secret), trustDevice: true },
        headers: cookies,
        returnHeaders: true,
      });
      session = jar(cookies, ok.headers);
    }
    const patrikCtx = await resolveCtx({ auth, db: app.db, headers: session, catalog });
    expect(patrikCtx?.actor.userId).toBe(patrik.id);
    expect((await listOwnSessions(patrikCtx!, null)).length).toBeGreaterThan(0);

    // Patrik sám cizí zařízení odhlásit nesmí
    await expect(revokeUserSessions(patrikCtx!, ownerId.value)).rejects.toBeInstanceOf(
      PermissionError,
    );

    await revokeUserSessions(ownerCtx, patrik.id);
    expect(await resolveCtx({ auth, db: app.db, headers: session, catalog })).toBeNull();
    expect(
      await app.db.select().from(schema.session).where(eq(schema.session.userId, patrik.id)),
    ).toHaveLength(0);
    const trustedLeft = await app.db
      .select()
      .from(schema.verification)
      .where(and(eq(schema.verification.value, patrik.id), sql`identifier like 'trust-device-%'`));
    expect(trustedLeft).toHaveLength(0);

    // důvěra je pryč: po přihlášení heslem znovu čeká kód
    const next = await auth.api.signInEmail({
      body: { email: patrik.email, password: PASSWORD },
      headers: withIp(session, randomIp()),
    });
    expect("twoFactorRedirect" in next && next.twoFactorRedirect).toBe(true);
  });

  it("Patrik vidí z bezpečnostní historie jen svůj účet, Ondřej všechno", async () => {
    // události Ondřeje i neznámého účtu, které Patrik vidět nesmí
    await auth.api
      .signInEmail({
        body: { email: uniqueEmail("neznamy"), password: "Neznámé-heslo-123" },
        headers: withIp(null, randomIp()),
      })
      .catch(() => undefined);
    const [ondrej] = await app.db
      .select({ email: schema.user.email })
      .from(schema.user)
      .where(eq(schema.user.id, ownerId.value));
    await auth.api
      .signInEmail({
        body: { email: ondrej!.email, password: "Špatné-heslo-12345" },
        headers: withIp(null, randomIp()),
      })
      .catch(() => undefined);

    const patrikCtx = await ctxOf(patrik.id);
    const own = await listSecurityEvents(patrikCtx);
    expect(own.length).toBeGreaterThan(5);
    expect(own.every((e) => e.userId === patrik.id)).toBe(true);
    expect(own.map((e) => e.action)).toContain("revoke_sessions"); // zásah správce je Patrikovi vidět
    await expect(listSecurityEvents(patrikCtx, { userId: ownerId.value })).rejects.toBeInstanceOf(
      PermissionError,
    );

    // společný filtr historie (`/historie`, záznam, přehled): Patrik jen své bezpečnostní události, žádné pozvánky ani cizí účty
    const visible = (ctx: typeof patrikCtx) =>
      app.db
        .select({ entityType: schema.auditLog.entityType, entityId: schema.auditLog.entityId })
        .from(schema.auditLog)
        .where(and(eq(schema.auditLog.category, "security"), securityVisibility(ctx)));
    const forPatrik = await visible(patrikCtx);
    expect(forPatrik.length).toBeGreaterThan(0);
    expect(forPatrik.every((r) => r.entityType === "user" && r.entityId === patrik.id)).toBe(true);

    const forOwner = await visible(ownerCtx);
    const ids = new Set(forOwner.map((r) => r.entityId));
    expect(ids.has(patrik.id)).toBe(true);
    expect(ids.has(ownerId.value)).toBe(true);
    expect(ids.has("unknown")).toBe(true);
    expect(forOwner.some((r) => r.entityType === "invitation")).toBe(true);
    expect(securityVisibility(ownerCtx)).toBeUndefined();

    // Ondřej si vybere účet Patrika i svůj
    expect((await listSecurityEvents(ownerCtx, { userId: patrik.id })).length).toBe(own.length);
  });

  it("odhlášení zařízení a změna hesla ruší důvěryhodná zařízení (po změně hesla se kód vyžádá všude)", async () => {
    const ip = randomIp();
    const first = await auth.api.signInEmail({
      body: { email: patrik.email, password: PASSWORD },
      headers: withIp(null, ip),
      returnHeaders: true,
    });
    const pending = jar(withIp(null, ip), first.headers);
    const ok = await auth.api.verifyTOTP({
      body: { code: totpCode(patrikDevice.secret), trustDevice: true },
      headers: pending,
      returnHeaders: true,
    });
    const session = jar(pending, ok.headers);
    const ctx = await resolveCtx({ auth, db: app.db, headers: session, catalog });
    expect(await listTrustedDevices(ctx!, session.get("cookie"))).toHaveLength(1);
    const { changeOwnPassword } = await import("@rebar/core/auth");
    await changeOwnPassword(
      ctx!,
      { currentPassword: PASSWORD, newPassword: "Jiné-dlouhé-heslo-2027-x" },
      { keepSessionId: null, breachCheck: "off" },
    );
    expect(await listTrustedDevices(ctx!, null)).toHaveLength(0);
    const inTrail = await app.db
      .select({ id: schema.auditLog.id })
      .from(schema.auditLog)
      .where(
        and(
          inArray(schema.auditLog.action, ["change_password"]),
          eq(schema.auditLog.entityId, patrik.id),
          eq(schema.auditLog.category, "security"),
        ),
      );
    expect(inTrail).toHaveLength(1);
  });
});
