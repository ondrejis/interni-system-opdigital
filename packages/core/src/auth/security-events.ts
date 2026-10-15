import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { schema, type Executor } from "../db/client";
import type { AuditActorKind, AuditChange } from "../db/schema/audit";
import { PermissionError } from "../rbac/errors";
import { can } from "../rbac/permissions";
import type { Ctx } from "../rbac/types";

/*
  Bezpečnostní události (AUT-08): přihlášení, neúspěšné pokusy, zablokování, změny 2FA, hesla a zařízení.
  Zapisují se do `audit_log` s kategorií `security`; subjektem události (`entity_id`) je vždy účet, kterého se týká.
  Vidí je správce uživatelů (majitel) všechny, ostatní jen události svého účtu (`securityVisibility`).
*/

/** Co se stalo. Hodnoty jsou stabilní kódy (ukládají se do historie); popisky jsou česky v `SECURITY_ACTION_LABELS`. */
export const SECURITY_ACTIONS = [
  "login",
  "login_failed",
  "login_blocked",
  "two_factor_failed",
  "enable_2fa",
  "disable_2fa",
  "regenerate_backup_codes",
  "change_password",
  "change_password_failed",
  "password_reset",
  "revoke_session",
  "revoke_sessions",
  "trusted_device_added",
  "trusted_device_revoked",
  "trusted_devices_revoked",
] as const;
/** Kód bezpečnostní události. */
export type SecurityAction = (typeof SECURITY_ACTIONS)[number];

/** Popisky událostí pro seznamy (profil, uživatelé). */
export const SECURITY_ACTION_LABELS: Record<SecurityAction, string> = {
  login: "Přihlášení",
  login_failed: "Neúspěšné přihlášení",
  login_blocked: "Přihlášení zablokováno (příliš mnoho pokusů)",
  two_factor_failed: "Chybný kód druhého faktoru",
  enable_2fa: "Dvoufázové ověření zapnuto",
  disable_2fa: "Dvoufázové ověření vypnuto",
  regenerate_backup_codes: "Nové záložní kódy",
  change_password: "Změna hesla",
  change_password_failed: "Změna hesla zamítnuta",
  password_reset: "Nastavení hesla z odkazu",
  revoke_session: "Odhlášeno zařízení",
  revoke_sessions: "Odhlášena zařízení",
  trusted_device_added: "Zařízení označeno jako důvěryhodné",
  trusted_device_revoked: "Důvěra k zařízení zrušena",
  trusted_devices_revoked: "Důvěra ke všem zařízením zrušena",
};

/** Popisek události; neznámý kód (starší nebo cizí záznam) vrátí beze změny. */
export const securityActionLabel = (action: string): string =>
  (SECURITY_ACTION_LABELS as Record<string, string>)[action] ?? action;

/** Neznámý účet v historii (někdo zkoušel přihlášení na neexistující e-mail); vidí ho jen správce. */
export const UNKNOWN_ACCOUNT = "unknown";

export type SecurityEvent = {
  action: SecurityAction;
  /** Účet, kterého se událost týká; `null` = neznámý účet (neúspěšné přihlášení na cizí e-mail). */
  userId: string | null;
  /**
   * Kdo událost vyvolal: výchozí je sám dotčený účet, `null` = nikdo přihlášený (formulář přihlášení),
   * jiné id = správce, který zasáhl do cizího účtu.
   */
  actorId?: string | null;
  actorKind?: AuditActorKind;
  summary: string;
  changes?: AuditChange[];
  ip?: string | null;
  requestId?: string | null;
  /** Doplňující údaje (způsob přihlášení, zařízení…); nikdy tajné hodnoty. */
  context?: Record<string, unknown>;
};

/**
 * Zapíše bezpečnostní událost do historie. Jde o přímý zápis (bez `Ctx`), aby ho šlo volat i z hooků přihlášení,
 * kde ještě žádný aktér není; uvnitř transakce předejte `ctx.db`.
 */
export async function recordSecurityEvent(exec: Executor, e: SecurityEvent): Promise<void> {
  const actorId = e.actorId === undefined ? e.userId : e.actorId;
  await exec.insert(schema.auditLog).values({
    actorKind: e.actorKind ?? (actorId ? "user" : "system"),
    actorId,
    actorLabel: actorId ? null : "Přihlašovací formulář",
    action: e.action,
    entityType: "user",
    entityId: e.userId ?? UNKNOWN_ACCOUNT,
    summary: e.summary,
    changes: e.changes ?? [],
    category: "security",
    isPrivate: false,
    requestId: e.requestId ?? null,
    ip: e.ip ?? null,
    context: e.context ?? null,
  });
}

/**
 * Podmínka do `WHERE` nad `audit_log`, která z historie vyřadí bezpečnostní události cizích účtů (Patrik vidí jen své,
 * Ondřej vše). `undefined` = bez omezení. Musí ji použít každé místo, které čte historii (záznam, `/historie`, přehled).
 */
export function securityVisibility(ctx: Ctx): SQL | undefined {
  if (can(ctx, "users.manage")) return undefined;
  const me = ctx.actor.userId ?? "";
  return sql`(${schema.auditLog.category} <> 'security' or (${schema.auditLog.entityType} = 'user' and ${schema.auditLog.entityId} = ${me}))`;
}

export type SecurityEventRow = {
  id: string;
  occurredAt: Date;
  action: string;
  label: string;
  summary: string | null;
  ip: string | null;
  /** Kdo událost vyvolal (jméno), nebo `null` pro formulář přihlášení. */
  actorName: string | null;
  /** Účet, kterého se týká (`unknown` = neznámý účet). */
  userId: string;
};

/**
 * Bezpečnostní události jednoho účtu, nejnovější první. Vlastní události vidí každý, cizí jen správce uživatelů
 * (`users.manage`). Bez `userId` jde o vlastní účet.
 */
export async function listSecurityEvents(
  ctx: Ctx,
  opts: { userId?: string; limit?: number } = {},
): Promise<SecurityEventRow[]> {
  const me = ctx.actor.userId;
  if (!me) throw new PermissionError();
  const target = opts.userId ?? me;
  if (target !== me && !can(ctx, "users.manage")) throw new PermissionError();
  const actor = schema.user;
  const rows = await ctx.db
    .select({
      id: schema.auditLog.id,
      occurredAt: schema.auditLog.occurredAt,
      action: schema.auditLog.action,
      summary: schema.auditLog.summary,
      ip: schema.auditLog.ip,
      actorId: schema.auditLog.actorId,
      actorName: actor.name,
      entityId: schema.auditLog.entityId,
    })
    .from(schema.auditLog)
    .leftJoin(actor, eq(actor.id, schema.auditLog.actorId))
    .where(
      and(
        eq(schema.auditLog.category, "security"),
        eq(schema.auditLog.entityType, "user"),
        eq(schema.auditLog.entityId, target),
      ),
    )
    .orderBy(desc(schema.auditLog.occurredAt), desc(schema.auditLog.id))
    .limit(Math.min(opts.limit ?? 50, 200));
  return rows.map((r) => ({
    id: r.id,
    occurredAt: r.occurredAt,
    action: r.action,
    label: securityActionLabel(r.action),
    summary: r.summary,
    ip: r.ip,
    actorName: r.actorId && r.actorId !== r.entityId ? r.actorName : null,
    userId: r.entityId,
  }));
}
