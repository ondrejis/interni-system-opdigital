import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { twoFactor } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { schema, type Db } from "../db/client";
import { newId } from "../db/ids";
import type { Mailer } from "./mailer";
import { hashPassword, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, verifyPassword } from "./password";
import type { PasswordCheckOptions } from "./password-policy";
import { DEFAULT_TWO_FACTOR_POLICY, type TwoFactorPolicy } from "./policy";
import { onPasswordResetDone, securityPlugin } from "./security-plugin";
import { TRUSTED_DEVICE_DAYS } from "./trusted-devices";

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
  /** Komu je druhý faktor povinný: výchozí všem (OPSYS), `roles` jen rolím s příznakem `require_2fa`. */
  twoFactorPolicy?: TwoFactorPolicy;
  /** Pravidla pro nová hesla při obnově z odkazu (jen testy; výchozí viz `assertPasswordAcceptable`). */
  passwordCheck?: PasswordCheckOptions;
};

/**
 * Autentizace: e-mail + heslo (argon2id), povinné 2FA (TOTP s 10 záložními kódy, důvěryhodné zařízení na 30 dní),
 * sessions v DB, omezení přihlašování 5 pokusů / 15 min, bezpečnostní události do historie, žádná veřejná registrace
 * (účty vznikají jen pozvánkou). Role a oprávnění jsou naše (`rbac`), Better Auth řeší jen identitu.
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
      onPasswordReset: async ({ user }, request) => {
        await onPasswordResetDone(db, user, request);
      },
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
    plugins: [
      twoFactor({
        issuer: opts.appName,
        // zařízení se po ověření kódem nechá označit jako důvěryhodné; platnost se při každém přihlášení z něj obnoví
        trustDeviceMaxAge: TRUSTED_DEVICE_DAYS * 86_400,
        backupCodeOptions: { amount: 10 },
      }),
      securityPlugin({
        db,
        twoFactorPolicy: opts.twoFactorPolicy ?? DEFAULT_TWO_FACTOR_POLICY,
        passwordCheck: opts.passwordCheck,
      }),
    ],
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
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
