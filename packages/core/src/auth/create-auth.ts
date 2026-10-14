import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { twoFactor } from "better-auth/plugins";
import { eq, sql } from "drizzle-orm";
import { schema, type Db } from "../db/client";
import { newId } from "../db/ids";
import { clientIp } from "./ip";
import type { Mailer } from "./mailer";
import { hashPassword, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, verifyPassword } from "./password";

export type AuthOptions = {
  db: Db;
  /** Veřejná adresa aplikace (odkazy v e-mailech, kontrola původu požadavků). */
  baseURL: string;
  /** Tajemství pro podepisování cookies a šifrování 2FA (unikátní pro každou instanci). */
  secret: string;
  /** Viditelný název systému klienta (vydavatel v autentikační aplikaci). */
  appName: string;
  /** Odhlášení po neaktivitě; relace se prodlužuje s aktivitou. */
  idleTimeoutMinutes: number;
  mailer: Mailer;
  trustedOrigins?: string[];
};

/**
 * Autentizace: e-mail + heslo (argon2id), 2FA (TOTP), sessions v DB, rate limit v DB,
 * žádná veřejná registrace (účty vznikají jen pozvánkou). Role a oprávnění jsou naše
 * (`rbac`), Better Auth řeší jen identitu.
 */
export function createAuth(opts: AuthOptions) {
  const { db } = opts;
  const secure = opts.baseURL.startsWith("https://");

  return betterAuth({
    appName: opts.appName,
    baseURL: opts.baseURL,
    secret: opts.secret,
    trustedOrigins: opts.trustedOrigins ?? [],
    // Změna hesla, profilu a e-mailu jde jen přes naše akce (omezení pokusů, audit, odhlášení ostatních relací);
    // přímé volání těchto adres z prohlížeče by to obešlo.
    disabledPaths: [
      "/change-password",
      "/set-password",
      "/update-user",
      "/change-email",
      "/delete-user",
      "/sign-up/email",
    ],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        twoFactor: schema.twoFactor,
        rateLimit: schema.rateLimit,
      },
    }),
    advanced: {
      database: { generateId: () => newId() },
      useSecureCookies: secure,
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      password: { hash: hashPassword, verify: verifyPassword },
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await opts.mailer.send({
          to: user.email,
          template: "password-reset",
          vars: { name: user.name, url },
        });
      },
    },
    user: {
      additionalFields: {
        roleId: { type: "string", required: true, input: false },
        active: { type: "boolean", required: false, defaultValue: true, input: false },
        mustChangePassword: { type: "boolean", required: false, defaultValue: false, input: false },
        lastLoginAt: { type: "date", required: false, input: false },
      },
    },
    session: {
      // Klouzavé odhlášení po neaktivitě: platnost se při aktivitě prodlužuje (nejvýš jednou za 5 min).
      expiresIn: opts.idleTimeoutMinutes * 60,
      updateAge: 5 * 60,
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 120,
      customRules: {
        "/sign-in/email": { window: 60, max: 8 },
        "/request-password-reset": { window: 60, max: 3 },
        "/reset-password": { window: 60, max: 5 },
        "/two-factor/verify-totp": { window: 60, max: 8 },
        "/two-factor/verify-backup-code": { window: 60, max: 5 },
        "/two-factor/generate-backup-codes": { window: 60, max: 5 },
        "/two-factor/enable": { window: 60, max: 5 },
        "/two-factor/disable": { window: 60, max: 5 },
      },
    },
    plugins: [twoFactor({ issuer: opts.appName })],
    databaseHooks: {
      session: {
        create: {
          // Deaktivovaný nebo smazaný uživatel se nepřihlásí.
          before: async (session) => {
            const [u] = await db
              .select({ active: schema.user.active, deletedAt: schema.user.deletedAt })
              .from(schema.user)
              .where(eq(schema.user.id, session.userId));
            if (!u || !u.active || u.deletedAt) return false;
          },
          after: async (session) => {
            await db.insert(schema.loginEvent).values({
              userId: session.userId,
              outcome: "success",
              ipAddress: session.ipAddress ?? null,
              userAgent: session.userAgent ?? null,
            });
            await db
              .update(schema.user)
              .set({ lastLoginAt: new Date() })
              .where(eq(schema.user.id, session.userId));
          },
        },
      },
    },
    hooks: {
      // Role s povinným dvoufázovým ověřením si ho nemůže vypnout (jinak by obešla omezenou relaci).
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/two-factor/disable") return;
        const session = await getSessionFromCtx(ctx).catch(() => null);
        if (!session) return;
        const [r] = await db
          .select({ required: schema.role.require2fa })
          .from(schema.user)
          .innerJoin(schema.role, eq(schema.user.roleId, schema.role.id))
          .where(eq(schema.user.id, session.user.id));
        if (r?.required)
          throw new APIError("FORBIDDEN", {
            message: "Pro vaši roli je dvoufázové ověření povinné, nejde vypnout.",
            code: "TWO_FACTOR_REQUIRED_FOR_ROLE",
          });
      }),
      after: createAuthMiddleware(async (ctx) => {
        // Nové záložní kódy a vypnutí dvoufázového ověření do auditu (bez hodnot kódů).
        if (
          (ctx.path === "/two-factor/generate-backup-codes" ||
            ctx.path === "/two-factor/disable") &&
          !(ctx.context.returned instanceof APIError)
        ) {
          const session =
            ctx.context.newSession ?? (await getSessionFromCtx(ctx).catch(() => null));
          if (session)
            await db.insert(schema.auditLog).values({
              actorKind: "user",
              actorId: session.user.id,
              action:
                ctx.path === "/two-factor/disable" ? "disable_2fa" : "regenerate_backup_codes",
              entityType: "user",
              entityId: session.user.id,
              summary:
                ctx.path === "/two-factor/disable"
                  ? "Vypnuto dvoufázové ověření"
                  : "Vygenerovány nové záložní kódy, staré přestaly platit",
              requestId: ctx.request?.headers.get("x-request-id") ?? null,
              ip: ctx.request ? clientIp(ctx.request.headers) : null,
            });
          return;
        }
        // Neúspěšné přihlášení heslem do historie přihlášení (jen pro existující účty).
        if (ctx.path !== "/sign-in/email" || !(ctx.context.returned instanceof APIError)) return;
        const email = typeof ctx.body?.email === "string" ? ctx.body.email : null;
        if (!email) return;
        const [u] = await db
          .select({ id: schema.user.id })
          .from(schema.user)
          .where(sql`lower(${schema.user.email}) = lower(${email})`);
        if (!u) return;
        await db.insert(schema.loginEvent).values({
          userId: u.id,
          outcome: "failed",
          ipAddress: ctx.request ? clientIp(ctx.request.headers) : null,
          userAgent: ctx.request?.headers.get("user-agent") ?? null,
        });
      }),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
