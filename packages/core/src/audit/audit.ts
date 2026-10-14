import { schema } from "../db/client";
import type { AuditChange } from "../db/schema/audit";
import type { Ctx } from "../rbac/types";

/** Pole, která se do auditu nikdy neukládají v čitelné podobě. */
const SECRET_FIELD = /password|passwd|secret|token|hash|backup_?codes|api_?key|authorization/i;
const REDACTED = "***";

/** Kopie hodnoty bez tajných polí (rekurzivně). */
export function redact<T>(value: T): T {
  if (Array.isArray(value)) return value.map(redact) as T;
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        SECRET_FIELD.test(k) ? REDACTED : redact(v),
      ]),
    ) as T;
  }
  return value;
}

/** Zamaskuje změny tajných polí a tajné klíče uvnitř vnořených hodnot. */
export function redactChanges(changes: readonly AuditChange[]): AuditChange[] {
  return changes.map((c) =>
    SECRET_FIELD.test(c.field)
      ? {
          field: c.field,
          old: c.old === null || c.old === undefined ? null : REDACTED,
          new: c.new === null || c.new === undefined ? null : REDACTED,
        }
      : { field: c.field, old: redact(c.old), new: redact(c.new) },
  );
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export type DiffOptions = {
  /** Pole, která se nesledují (např. `updatedAt`). */
  ignore?: readonly string[];
};

const ALWAYS_IGNORED = ["updatedAt", "updatedBy", "createdAt", "createdBy"];

/** Strukturovaný rozdíl dvou záznamů: jen změněná pole, tajná pole zamaskovaná. */
export function diffRecords(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  { ignore = [] }: DiffOptions = {},
): AuditChange[] {
  const skip = new Set([...ALWAYS_IGNORED, ...ignore]);
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const changes: AuditChange[] = [];
  for (const field of [...keys].sort()) {
    if (skip.has(field)) continue;
    const o = before?.[field];
    const n = after?.[field];
    if (same(o, n)) continue;
    const secret = SECRET_FIELD.test(field);
    changes.push({
      field,
      old: secret && o !== undefined ? REDACTED : (o ?? null),
      new: secret && n !== undefined ? REDACTED : (n ?? null),
    });
  }
  return changes;
}

export type AuditEntry = {
  action: string;
  entityType: string;
  entityId: string;
  summary?: string;
  changes?: AuditChange[];
};

/**
 * Zapíše auditní záznam. Volat uvnitř téže transakce jako změna (`inTx`), aby změna
 * bez stopy nemohla vzniknout. Při selhání zápisu se vrací celá transakce.
 */
export async function recordAudit(ctx: Ctx, entry: AuditEntry): Promise<void> {
  await ctx.db.insert(schema.auditLog).values({
    actorKind: ctx.actor.kind,
    actorId: ctx.actor.userId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    summary: entry.summary ?? null,
    changes: redactChanges(entry.changes ?? []),
    requestId: ctx.requestId ?? null,
    ip: ctx.ip ?? null,
  });
}

/** Spočítá rozdíl `before` → `after` a zapíše ho; když se nic nezměnilo, nezapíše nic. */
export async function auditChange(
  ctx: Ctx,
  spec: {
    entityType: string;
    entityId: string;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    summary?: string;
    ignore?: readonly string[];
  },
): Promise<AuditChange[]> {
  const changes = diffRecords(spec.before, spec.after, spec.ignore ? { ignore: spec.ignore } : {});
  if (!changes.length) return changes;
  await recordAudit(ctx, {
    action: "update",
    entityType: spec.entityType,
    entityId: spec.entityId,
    changes,
    ...(spec.summary ? { summary: spec.summary } : {}),
  });
  return changes;
}
