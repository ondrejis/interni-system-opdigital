import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { eq, sql } from "drizzle-orm";
import { schema, type Db } from "../db/client";
import { clientIp } from "./ip";
import {
  LOGIN_LIMIT,
  clearLoginFailures,
  isLoginBlocked,
  recordBlockedAttempt,
  recordLoginFailure,
} from "./login-throttle";
import { DEFAULT_TWO_FACTOR_POLICY, type TwoFactorPolicy } from "./policy";
import { assertPasswordAcceptable, type PasswordCheckOptions } from "./password-policy";
import { recordSecurityEvent } from "./security-events";
import { deleteTrustedDevices } from "./trusted-devices";

/*
  Plugin přihlášení OPSYS nad Better Auth. Řadí se až za plugin `twoFactor`, takže jeho hooky po přihlášení vidí už
  výsledek (relace vznikla, nebo čeká druhý faktor). Řeší:
  - omezení pokusů o přihlášení (5 / 15 min na účet a IP, AUT-06),
  - kontrolu nového hesla při obnově z odkazu (AUT-03),
  - zákaz vypnutí druhého faktoru,
  - zápis bezpečnostních událostí do historie (AUT-08) a historie přihlášení (`login_event`).
*/

export type SecurityPluginOptions = {
  db: Db;
  twoFactorPolicy?: TwoFactorPolicy | undefined;
  passwordCheck?: PasswordCheckOptions | undefined;
};

/** Hláška při vyčerpání pokusů; kód zná klient (`authErrorMessage`). */
export const LOGIN_BLOCKED_MESSAGE =
  "Příliš mnoho neúspěšných pokusů o přihlášení. Zkuste to znovu za 15 minut.";

type HookCtx = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

const ipOf = (ctx: HookCtx): string | null => {
  const headers = ctx.request?.headers ?? ctx.headers;
  return headers ? clientIp(headers) : null;
};
const userAgentOf = (ctx: HookCtx): string | null =>
  (ctx.request?.headers ?? ctx.headers)?.get("user-agent") ?? null;
const requestIdOf = (ctx: HookCtx): string | null =>
  (ctx.request?.headers ?? ctx.headers)?.get("x-request-id") ?? null;

/** Plugin do `betterAuth({ plugins })`. */
export function securityPlugin(opts: SecurityPluginOptions): BetterAuthPlugin {
  const { db } = opts;
  const policy = opts.twoFactorPolicy ?? DEFAULT_TWO_FACTOR_POLICY;

  const userByEmail = async (email: string) => {
    const [u] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(sql`lower(${schema.user.email}) = lower(${email})`);
    return u ?? null;
  };

  /** Účet, který právě ověřuje druhý faktor při přihlášení: z podepsané cookie výzvy (relace ještě není). */
  const pendingTwoFactorUserId = async (ctx: HookCtx): Promise<string | null> => {
    const cookie = ctx.context.createAuthCookie("two_factor");
    const id = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
    if (!id) return null;
    const v = await ctx.context.internalAdapter.findVerificationValue(id);
    return v?.value ?? null;
  };

  const recordLogin = async (
    ctx: HookCtx,
    method: "password" | "trusted_device" | "totp" | "backup_code",
  ) => {
    const created = ctx.context.newSession;
    if (!created) return;
    const ip = created.session.ipAddress ?? ipOf(ctx);
    await db
      .update(schema.user)
      .set({ lastLoginAt: new Date() })
      .where(eq(schema.user.id, created.user.id));
    await db.insert(schema.loginEvent).values({
      userId: created.user.id,
      outcome: "success",
      ipAddress: ip,
      userAgent: created.session.userAgent ?? userAgentOf(ctx),
    });
    await recordSecurityEvent(db, {
      action: "login",
      userId: created.user.id,
      summary: "Přihlášení",
      ip,
      requestId: requestIdOf(ctx),
      context: { method },
    });
  };

  return {
    id: "opsys-security",
    hooks: {
      before: [
        {
          // omezení pokusů: šestý pokus za 15 minut se zablokuje i se správným heslem
          matcher: (c) => c.path === "/sign-in/email",
          handler: createAuthMiddleware(async (ctx) => {
            const email = typeof ctx.body?.email === "string" ? ctx.body.email : null;
            if (!email) return;
            const ip = ipOf(ctx);
            if (!(await isLoginBlocked(db, email, ip))) return;
            const attempts = await recordBlockedAttempt(db, email, ip);
            if (attempts === LOGIN_LIMIT.attempts + 1) {
              const u = await userByEmail(email);
              await recordSecurityEvent(db, {
                action: "login_blocked",
                userId: u?.id ?? null,
                actorId: null,
                summary: `Přihlášení zablokováno: ${LOGIN_LIMIT.attempts} neúspěšných pokusů za 15 minut`,
                ip,
                requestId: requestIdOf(ctx),
              });
            }
            throw new APIError("TOO_MANY_REQUESTS", {
              message: LOGIN_BLOCKED_MESSAGE,
              code: "TOO_MANY_LOGIN_ATTEMPTS",
            });
          }),
        },
        {
          // nové heslo z odkazu musí splnit stejná pravidla jako při pozvánce
          matcher: (c) => c.path === "/reset-password",
          handler: createAuthMiddleware(async (ctx) => {
            const password = typeof ctx.body?.newPassword === "string" ? ctx.body.newPassword : "";
            const token = ctx.body?.token ?? ctx.query?.token;
            let subject: { email?: string; name?: string } = {};
            if (typeof token === "string" && token) {
              const v = await ctx.context.internalAdapter.findVerificationValue(
                `reset-password:${token}`,
              );
              if (v) {
                const [u] = await db
                  .select({ email: schema.user.email, name: schema.user.name })
                  .from(schema.user)
                  .where(eq(schema.user.id, v.value));
                if (u) subject = u;
              }
            }
            try {
              await assertPasswordAcceptable(password, { ...opts.passwordCheck, ...subject });
            } catch (err) {
              throw new APIError("BAD_REQUEST", {
                message: err instanceof Error ? err.message : "Heslo nelze použít.",
                code: "PASSWORD_NOT_ACCEPTABLE",
              });
            }
          }),
        },
        {
          // druhý faktor je povinný, takže ho nejde vypnout
          matcher: (c) => c.path === "/two-factor/disable",
          handler: createAuthMiddleware(async (ctx) => {
            const session = await getSessionFromCtx(ctx).catch(() => null);
            if (!session) return;
            let required = policy === "all";
            if (!required) {
              const [r] = await db
                .select({ required: schema.role.require2fa })
                .from(schema.user)
                .innerJoin(schema.role, eq(schema.user.roleId, schema.role.id))
                .where(eq(schema.user.id, session.user.id));
              required = !!r?.required;
            }
            if (required)
              throw new APIError("FORBIDDEN", {
                message: "Dvoufázové ověření je povinné, nejde vypnout.",
                code: "TWO_FACTOR_REQUIRED_FOR_ROLE",
              });
          }),
        },
      ],
      after: [
        {
          matcher: (c) => c.path === "/sign-in/email",
          handler: createAuthMiddleware(async (ctx) => {
            const email = typeof ctx.body?.email === "string" ? ctx.body.email : null;
            if (!email) return;
            const ip = ipOf(ctx);
            if (ctx.context.returned instanceof APIError) {
              const u = await userByEmail(email);
              await recordLoginFailure(db, email, ip);
              if (u)
                await db.insert(schema.loginEvent).values({
                  userId: u.id,
                  outcome: "failed",
                  ipAddress: ip,
                  userAgent: userAgentOf(ctx),
                });
              await recordSecurityEvent(db, {
                action: "login_failed",
                userId: u?.id ?? null,
                actorId: null,
                summary: u ? "Neúspěšné přihlášení heslem" : "Neúspěšné přihlášení neznámého účtu",
                ip,
                requestId: requestIdOf(ctx),
              });
              return;
            }
            await clearLoginFailures(db, email, ip);
            // heslo prošlo; přihlášení je hotové jen bez druhého faktoru nebo z důvěryhodného zařízení
            const created = ctx.context.newSession;
            if (created)
              await recordLogin(ctx, created.user.twoFactorEnabled ? "trusted_device" : "password");
          }),
        },
        {
          matcher: (c) =>
            c.path === "/two-factor/verify-totp" || c.path === "/two-factor/verify-backup-code",
          handler: createAuthMiddleware(async (ctx) => {
            const method = ctx.path === "/two-factor/verify-totp" ? "totp" : "backup_code";
            // `session` je vyplněná jen při nastavování (ověření prvního kódu přihlášeným uživatelem)
            const existing = ctx.context.session?.user ?? null;
            if (ctx.context.returned instanceof APIError) {
              if (existing) return;
              const userId = await pendingTwoFactorUserId(ctx);
              if (!userId) return;
              const ip = ipOf(ctx);
              await db.insert(schema.loginEvent).values({
                userId,
                outcome: "2fa_failed",
                ipAddress: ip,
                userAgent: userAgentOf(ctx),
              });
              await recordSecurityEvent(db, {
                action: "two_factor_failed",
                userId,
                actorId: null,
                summary:
                  method === "totp"
                    ? "Chybný kód z aplikace při přihlášení"
                    : "Chybný záložní kód při přihlášení",
                ip,
                requestId: requestIdOf(ctx),
              });
              return;
            }
            if (existing) {
              // první ověřený kód zapíná dvoufázové ověření
              if (!existing.twoFactorEnabled)
                await recordSecurityEvent(db, {
                  action: "enable_2fa",
                  userId: existing.id,
                  summary: "Zapnuto dvoufázové ověření",
                  ip: ipOf(ctx),
                  requestId: requestIdOf(ctx),
                });
              return;
            }
            await recordLogin(ctx, method);
            const created = ctx.context.newSession;
            if (created && ctx.body?.trustDevice === true)
              await recordSecurityEvent(db, {
                action: "trusted_device_added",
                userId: created.user.id,
                summary: "Zařízení označeno jako důvěryhodné na 30 dní",
                ip: ipOf(ctx),
                requestId: requestIdOf(ctx),
              });
          }),
        },
        {
          // nové záložní kódy a vypnutí dvoufázového ověření do historie (bez hodnot kódů)
          matcher: (c) =>
            c.path === "/two-factor/generate-backup-codes" || c.path === "/two-factor/disable",
          handler: createAuthMiddleware(async (ctx) => {
            if (ctx.context.returned instanceof APIError) return;
            const session =
              ctx.context.newSession ?? (await getSessionFromCtx(ctx).catch(() => null));
            if (!session) return;
            const disabled = ctx.path === "/two-factor/disable";
            await recordSecurityEvent(db, {
              action: disabled ? "disable_2fa" : "regenerate_backup_codes",
              userId: session.user.id,
              summary: disabled
                ? "Vypnuto dvoufázové ověření"
                : "Vygenerovány nové záložní kódy, staré přestaly platit",
              ip: ipOf(ctx),
              requestId: requestIdOf(ctx),
            });
          }),
        },
      ],
    },
  };
}

/**
 * Obsluha dokončené obnovy hesla z odkazu (`emailAndPassword.onPasswordReset`): zruší důvěryhodná zařízení a zapíše
 * událost. Odhlášení všech relací zařídí knihovna (`revokeSessionsOnPasswordReset`).
 */
export async function onPasswordResetDone(
  db: Db,
  user: { id: string },
  request: Request | undefined,
): Promise<void> {
  await deleteTrustedDevices(db, user.id);
  await recordSecurityEvent(db, {
    action: "password_reset",
    userId: user.id,
    summary:
      "Nastaveno nové heslo z odkazu; odhlášena všechna zařízení a zrušena důvěra k zařízením",
    ip: request ? clientIp(request.headers) : null,
    requestId: request?.headers.get("x-request-id") ?? null,
  });
}
