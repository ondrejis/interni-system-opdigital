import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
  bigint,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { auditColumnsWith, pk, ts } from "../columns";

/*
  Identita a oprávnění. Tabulky `session`, `account`, `verification`, `two_factor`
  a `rate_limit` spravuje Better Auth, proto nemají `created_by`/`updated_by`/`deleted_at`
  (zdokumentovaná výjimka z ADR 002). `user` je měkce mazaný (`deleted_at`) a deaktivuje se `active`.
*/

const audit = () => auditColumnsWith((): AnyPgColumn => user.id);

export const role = pgTable(
  "role",
  {
    id: pk(),
    /** Stabilní klíč role (owner, admin, …); na něj se odkazuje konfigurace (`require2faRoles`). */
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    /** Systémové role (owner, admin) nejde smazat ani ořezat. */
    isSystem: boolean("is_system").notNull().default(false),
    require2fa: boolean("require_2fa").notNull().default(false),
    ...audit(),
  },
  (t) => [
    uniqueIndex("role_key_uq")
      .on(t.key)
      .where(sql`${t.deletedAt} is null`),
  ],
);

/** Oprávnění role. `scope`: `all` = všechny záznamy, `own` = jen vlastní/přidělené. */
export const rolePermission = pgTable(
  "role_permission",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => role.id, { onDelete: "cascade" }),
    permission: text("permission").notNull(),
    scope: text("scope", { enum: ["all", "own"] })
      .notNull()
      .default("all"),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permission] })],
);

export const user = pgTable(
  "user",
  {
    id: pk(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    roleId: uuid("role_id")
      .notNull()
      .references(() => role.id),
    active: boolean("active").notNull().default(true),
    twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    lastLoginAt: ts("last_login_at"),
    /** Zkrácené jméno do tabulek, avatarů a rozpisů (Ondřej → „OD“). */
    shortName: text("short_name"),
    /** IČO, pod kterým uživatel fakturuje (vyrovnání mezi IČO, NAS-06). */
    ico: text("ico"),
    /** Fakturační nástroj uživatele, volný text (O-5). */
    billingTool: text("billing_tool"),
    /** Barva avataru (klíč barvy z palety UI). */
    avatarColor: text("avatar_color"),
    /** Osobní předvolby (zobrazení, naposledy použité filtry…); struktura je zod schéma v jádru. */
    prefs: jsonb("prefs")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...auditColumnsWith((): AnyPgColumn => user.id),
  },
  (t) => [
    uniqueIndex("user_email_uq").on(sql`lower(${t.email})`),
    index("user_role_idx").on(t.roleId),
  ],
);

export const session = pgTable(
  "session",
  {
    id: pk(),
    expiresAt: ts("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: pk(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: pk(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

/** TOTP tajemství a záložní kódy (plugin `twoFactor` Better Auth). */
export const twoFactor = pgTable(
  "two_factor",
  {
    id: pk(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    /** Tajemství je aktivní, až když uživatel potvrdí první kód. */
    verified: boolean("verified").notNull().default(true),
    /** Počet neúspěšných ověření za sebou (zámek účtu po opakovaných chybách). */
    failedVerificationCount: integer("failed_verification_count").notNull().default(0),
    lockedUntil: ts("locked_until"),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("two_factor_user_idx").on(t.userId)],
);

/** Omezení počtu požadavků na přihlášení a citlivé endpointy (Better Auth, úložiště v DB). */
export const rateLimit = pgTable("rate_limit", {
  id: pk(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

/** Pozvánka do systému. Platí 7 dní; v DB je jen otisk tokenu. */
export const invitation = pgTable(
  "invitation",
  {
    id: pk(),
    email: text("email").notNull(),
    roleId: uuid("role_id")
      .notNull()
      .references(() => role.id),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: ts("expires_at").notNull(),
    acceptedAt: ts("accepted_at"),
    revokedAt: ts("revoked_at"),
    ...audit(),
  },
  (t) => [index("invitation_email_idx").on(sql`lower(${t.email})`)],
);

export const loginEvent = pgTable(
  "login_event",
  {
    id: pk(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** `success` | `failed` | `2fa_failed` | `logout` */
    outcome: text("outcome").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("login_event_user_idx").on(t.userId, t.createdAt)],
);
