import { and, count, desc, eq, gte, inArray, lt, sql, type SQL } from "drizzle-orm";
import { getTableColumns } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { z } from "zod";
import { recordAudit } from "../audit/audit";
import { auditReadScope } from "../audit/visibility";
import { schema } from "../db/client";
import { AUDIT_ACTOR_KINDS, AUDIT_CATEGORIES, type AuditChange } from "../db/schema/audit";
import { visibleAudit } from "../entities/activity";
import type { EntityRegistry } from "../entities/engine";
import { assertCan } from "../rbac/permissions";
import type { Ctx } from "../rbac/types";
import { csvCell, csvSafeText } from "../export/csv";

/** Filtry globální historie změn (`/historie`). Všechny jsou volitelné a kombinují se logickým A. */
export const historyFilterSchema = z.object({
  /** Kdo: uživatel (id). */
  actorId: z.uuid().optional(),
  /** Kdo: druh aktéra (např. jen n8n, Google, Meta, automatické úlohy). */
  actorKind: z.enum(AUDIT_ACTOR_KINDS).optional(),
  /** Typ záznamu (klíč entity, např. `company`). */
  entityType: z.string().min(1).max(60).optional(),
  /** Konkrétní záznam. */
  entityId: z.string().min(1).max(60).optional(),
  action: z.string().min(1).max(60).optional(),
  category: z.enum(AUDIT_CATEGORIES).optional(),
  /** Od data včetně (`YYYY-MM-DD`, čas Europe/Prague). */
  from: z.iso.date().optional(),
  /** Do data včetně (`YYYY-MM-DD`). */
  to: z.iso.date().optional(),
  /** Hledání v názvu záznamu, shrnutí, autorovi a změněných hodnotách (bez diakritiky a velikosti písmen). */
  q: z.string().trim().max(100).optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).max(100_000).default(0),
});
/** Filtry globální historie (vstup `queryHistory`, `exportHistoryCsv` a stránky `/historie`). */
export type HistoryFilters = z.input<typeof historyFilterSchema>;

/** Jak je záznam, kterého se změna týká, dnes: existuje, je v koši, nebo už není (trvale smazán, nebo není entita). */
export type HistoryTargetState = "live" | "deleted" | "gone" | "none";

/** Jedna změna v globální historii: kdo, co, komu, před → po a kam odkazuje (záznam, nebo koš). */
export type HistoryItem = {
  id: string;
  at: string;
  actor: string;
  actorKind: string;
  actorId: string | null;
  action: string;
  category: string;
  entityType: string;
  entityLabel: string;
  entityId: string;
  entityTitle: string | null;
  summary: string | null;
  changes: AuditChange[];
  /** Odkaz na záznam (`live`) nebo do koše (`deleted`); jinak `null`. */
  href: string | null;
  state: HistoryTargetState;
};

const ACTOR_NAMES: Record<string, string> = {
  system: "Systém",
  agency: "Agentura",
  n8n: "n8n",
  google: "Google",
  meta: "Meta",
  job: "Automatická úloha",
};

/** Půlnoc dne `d` v Europe/Prague jako okamžik (hranice období). */
function pragueMidnight(d: string, plusDays = 0): Date {
  const [y, m, day] = d.split("-").map(Number) as [number, number, number];
  const guess = new Date(Date.UTC(y, m - 1, day + plusDays, 0, 0, 0));
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Prague",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(guess);
  const hh = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const mm = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return new Date(guess.getTime() - (hh * 60 + mm) * 60_000);
}

/** Podmínky filtru nad `audit_log` (bez viditelnosti: ta se přidává vždy zvlášť). */
export function historyWhere(f: z.output<typeof historyFilterSchema>): (SQL | undefined)[] {
  const a = schema.auditLog;
  const like = (s: string) => "%" + s.replace(/[\\%_]/g, "\\$&") + "%";
  return [
    f.actorId ? eq(a.actorId, f.actorId) : undefined,
    f.actorKind ? eq(a.actorKind, f.actorKind) : undefined,
    f.entityType ? eq(a.entityType, f.entityType) : undefined,
    f.entityId ? eq(a.entityId, f.entityId) : undefined,
    f.action ? eq(a.action, f.action) : undefined,
    f.category ? eq(a.category, f.category) : undefined,
    f.from ? gte(a.occurredAt, pragueMidnight(f.from)) : undefined,
    f.to ? lt(a.occurredAt, pragueMidnight(f.to, 1)) : undefined,
    f.q
      ? sql`lower(f_unaccent(coalesce(${a.entityTitle}, '') || ' ' || coalesce(${a.summary}, '') || ' ' || coalesce(${a.actorLabel}, '') || ' ' || ${a.changes}::text)) like lower(f_unaccent(${like(f.q)})) escape '\\'`
      : undefined,
  ];
}

/**
 * Globální historie změn (HIS-02). Čte výhradně přes `auditReadScope(ctx)`: partner nevidí historii soukromých záznamů
 * (ani bývalých soukromých) a bezpečnostní události vidí jen své. Skrytá pole a částky podle oprávnění se vynechají jako
 * v časové ose záznamu. Smazané záznamy mají odkaz do koše. Vyžaduje `activity.read`.
 */
export async function queryHistory(
  ctx: Ctx,
  registry: EntityRegistry,
  raw: HistoryFilters = {},
): Promise<{
  items: HistoryItem[];
  total: number;
  /** Typy záznamů, které v (viditelné) historii jsou; pro filtr. */
  entityTypes: { value: string; label: string }[];
  /** Uživatelé, kteří v (viditelné) historii něco udělali; pro filtr. */
  actors: { value: string; label: string }[];
  actions: string[];
}> {
  assertCan(ctx, "activity.read");
  const f = historyFilterSchema.parse(raw);
  const a = schema.auditLog;
  const scope = auditReadScope(ctx);
  const where = and(scope, ...historyWhere(f));

  const [totalRow] = await ctx.db.select({ n: count() }).from(a).where(where);
  const rows = await ctx.db
    .select({
      id: a.id,
      at: a.occurredAt,
      actorKind: a.actorKind,
      actorId: a.actorId,
      actorLabel: a.actorLabel,
      actorName: schema.user.name,
      action: a.action,
      category: a.category,
      entityType: a.entityType,
      entityId: a.entityId,
      entityTitle: a.entityTitle,
      summary: a.summary,
      changes: a.changes,
    })
    .from(a)
    .leftJoin(schema.user, eq(a.actorId, schema.user.id))
    .where(where)
    .orderBy(desc(a.occurredAt), desc(a.id))
    .limit(f.limit)
    .offset(f.offset);

  // skrytá pole a částky podle oprávnění (jako v časové ose záznamu)
  const visibleRows = rows.flatMap((r) => {
    const v = visibleAudit(ctx, registry.get(r.entityType), [r])[0];
    return v ? [{ ...r, changes: v.changes, summary: v.summary }] : [];
  });

  // stav cílových záznamů: žije, v koši, nebo už není (dávkově po typech)
  const states = new Map<string, HistoryTargetState>();
  for (const type of new Set(visibleRows.map((r) => r.entityType))) {
    const def = registry.get(type);
    const ids = [
      ...new Set(
        visibleRows
          .filter((r) => r.entityType === type)
          .map((r) => r.entityId)
          .filter((x) => /^[0-9a-f-]{36}$/i.test(x)),
      ),
    ];
    if (!def || !ids.length) continue;
    const cols = getTableColumns(def.table) as Record<string, AnyPgColumn>;
    if (!cols.id || !cols.deletedAt) continue;
    const found = await ctx.db
      .select({ id: cols.id, deletedAt: cols.deletedAt })
      .from(def.table)
      .where(inArray(cols.id, ids));
    for (const x of found) states.set(`${type}:${x.id}`, x.deletedAt ? "deleted" : "live");
    for (const id of ids) if (!states.has(`${type}:${id}`)) states.set(`${type}:${id}`, "gone");
  }

  const items = visibleRows.map((r): HistoryItem => {
    const def = registry.get(r.entityType);
    const state: HistoryTargetState = def
      ? (states.get(`${r.entityType}:${r.entityId}`) ?? "none")
      : "none";
    return {
      id: r.id,
      at: r.at.toISOString(),
      actor: r.actorName ?? r.actorLabel ?? ACTOR_NAMES[r.actorKind] ?? "Neznámý",
      actorKind: r.actorKind,
      actorId: r.actorId,
      action: r.action,
      category: r.category,
      entityType: r.entityType,
      entityLabel: def?.label.one ?? r.entityType,
      entityId: r.entityId,
      entityTitle: r.entityTitle,
      summary: r.summary,
      changes: r.changes,
      state,
      href: state === "live" && def ? def.url(r.entityId) : state === "deleted" ? "/kos" : null,
    };
  });

  // nabídky filtrů: jen to, co v (viditelné) historii je
  const [types, actorRows, actionRows] = await Promise.all([
    ctx.db.selectDistinct({ v: a.entityType }).from(a).where(scope),
    ctx.db
      .selectDistinct({ id: a.actorId, name: schema.user.name })
      .from(a)
      .innerJoin(schema.user, eq(a.actorId, schema.user.id))
      .where(scope),
    ctx.db.selectDistinct({ v: a.action }).from(a).where(scope),
  ]);
  return {
    items,
    total: Number(totalRow?.n ?? 0),
    entityTypes: types
      .map((t) => ({ value: t.v, label: registry.get(t.v)?.label.one ?? t.v }))
      .sort((x, y) => x.label.localeCompare(y.label, "cs")),
    actors: actorRows
      .map((u) => ({ value: u.id!, label: u.name }))
      .sort((x, y) => x.label.localeCompare(y.label, "cs")),
    actions: actionRows.map((r) => r.v).sort(),
  };
}

const CSV_HEADER = [
  "Kdy",
  "Kdo",
  "Zdroj",
  "Typ záznamu",
  "Záznam",
  "Akce",
  "Kategorie",
  "Pole",
  "Před",
  "Po",
  "Shrnutí",
];
const MAX_EXPORT = 20_000;

const text = (v: unknown): string =>
  v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);

/**
 * Export historie do CSV (HIS-06): stejné filtry a stejná viditelnost jako stránka (`auditReadScope`), jeden řádek
 * na změněné pole. Vyžaduje `activity.export` (výchozí jen vlastník). Zapíše se do historie jako `export`.
 */
export async function exportHistoryCsv(
  ctx: Ctx,
  registry: EntityRegistry,
  filters: HistoryFilters = {},
): Promise<{ csv: string; rows: number; truncated: boolean }> {
  assertCan(ctx, "activity.export");
  const lines: string[][] = [];
  let offset = 0;
  let truncated = false;
  for (;;) {
    const page = await queryHistory(ctx, registry, { ...filters, limit: 200, offset });
    for (const it of page.items) {
      const base = [
        it.at,
        it.actor,
        it.actorKind,
        it.entityLabel,
        it.entityTitle ?? "",
        it.action,
        it.category,
      ];
      if (!it.changes.length) lines.push([...base, "", "", "", it.summary ?? ""]);
      for (const c of it.changes)
        lines.push([...base, c.field, text(c.old), text(c.new), it.summary ?? ""]);
    }
    offset += 200;
    if (offset >= page.total) break;
    if (lines.length >= MAX_EXPORT) {
      truncated = true;
      break;
    }
  }
  const csv =
    "﻿" +
    [CSV_HEADER, ...lines]
      .map((r) => r.map((c) => csvCell(csvSafeText(c))).join(";"))
      .join("\r\n") +
    "\r\n";
  await recordAudit(ctx, {
    action: "export",
    entityType: "audit_log",
    entityId: ctx.actor.userId ?? "system",
    summary: `Export historie změn do CSV (${lines.length} řádků)`,
    category: "security",
  });
  return { csv, rows: lines.length, truncated };
}
