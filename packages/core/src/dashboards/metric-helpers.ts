// Pomocníci pro pojmenované metriky nástěnek (`dashboardMetrics` v serverové části modulů): rozsah aktéra v SQL,
// období, koše a drobná čistá matematika. Moduly je importují z `@rebar/core/dashboards`.

import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { getTableColumns } from "drizzle-orm";
import {
  buildEntityWhere,
  queryInput,
  resolveEntity,
  visibleTo,
  type EntityRegistry,
  type ResolvedEntity,
} from "../entities/engine";
import type { FilterGroup } from "../entities/operators";
import { PermissionError, UserError } from "../rbac/errors";
import { scopeOf } from "../rbac/permissions";
import type { Ctx } from "../rbac/types";
import { addDaysIso, addMonthsIso, monthRange, weekStartIso, zonedToUtc } from "../time/dates";
import { bucketStart } from "./periods";
import type { Bucket, DateRange } from "./types";

/** Entita zúžená na to, co aktér smí vidět, s hotovou podmínkou `WHERE` (smazané, oprávnění, rozsah „jen moje“). */
export type ScopedEntity = {
  /** Entita bez atributů, které aktér nesmí vidět (ceny, marže). */
  entity: ResolvedEntity;
  /** Podmínka pro dotaz nad tabulkou entity: nesmazané záznamy v rozsahu aktéra (a případný filtr). */
  where: SQL;
  /** Poddotaz `select id from <tabulka> where <podmínka>`: id záznamů, které aktér vidí. */
  idsSubquery: SQL;
  /** Odkaz na detail záznamu, o kterém víme, že ho aktér vidí. */
  href: (id: string) => string;
};

function build(ctx: Ctx, entity: ResolvedEntity, filters?: FilterGroup): ScopedEntity {
  const visible = visibleTo(ctx, entity);
  const where = buildEntityWhere(ctx, visible, queryInput.parse(filters ? { filters } : {}));
  const idCol = (getTableColumns(visible.def.table) as Record<string, AnyPgColumn>).id!;
  return {
    entity: visible,
    where,
    idsSubquery: sql`select ${idCol} from ${visible.def.table} where ${where}`,
    href: (id) => visible.def.url(id),
  };
}

/**
 * Rozsah aktéra pro dotaz metriky: stejná podmínka, kterou používá seznam entity (oprávnění ke čtení, rozsah „vše“ /
 * „jen moje“, nesmazané). Bez oprávnění vyhodí chybu, chybějící entita (vypnutý modul) je srozumitelná chyba.
 */
export async function scopedEntity(
  ctx: Ctx,
  deps: { registry: EntityRegistry },
  entityKey: string,
  filters?: FilterGroup,
): Promise<ScopedEntity> {
  const def = deps.registry.get(entityKey);
  if (!def) throw new UserError("Zdroj dat této metriky není v systému dostupný (vypnutý modul).");
  if (!scopeOf(ctx, def.permissions.read))
    throw new PermissionError("Na data této metriky nemáte oprávnění.");
  return build(ctx, await resolveEntity(ctx.db, def), filters);
}

/** Jako `scopedEntity`, ale bez oprávnění nebo při vypnutém modulu vrátí `null` (pro doplňkové popisky a odkazy). */
export async function tryScopedEntity(
  ctx: Ctx,
  deps: { registry: EntityRegistry },
  entityKey: string,
): Promise<ScopedEntity | null> {
  const def = deps.registry.get(entityKey);
  if (!def || !scopeOf(ctx, def.permissions.read)) return null;
  return build(ctx, await resolveEntity(ctx.db, def));
}

/**
 * Odkaz na detail cizí entity (zákazník…), jen když aktér čte všechny její záznamy; při rozsahu „jen moje“ by odkaz
 * mohl vést na záznam, který aktér nevidí.
 */
export function entityHref(
  ctx: Ctx,
  deps: { registry: EntityRegistry },
  entityKey: string,
  id: string,
): string | undefined {
  const def = deps.registry.get(entityKey);
  if (!def || scopeOf(ctx, def.permissions.read) !== "all") return undefined;
  return def.url(id);
}

/** Počet řádků, který widget smí chtít: 1 až 100. */
export function clampLimit(limit: number, fallback = 12): number {
  return Number.isFinite(limit) ? Math.min(100, Math.max(1, Math.trunc(limit))) : fallback;
}

/** Podíl `num / den` v procentech na jedno desetinné místo; při nulovém jmenovateli `null`. */
export function pct1(num: number, den: number): number | null {
  return den > 0 ? Math.round((num / den) * 1000) / 10 : null;
}

/** Hodnota parametru `select` jen z povolených voleb (whitelist); cokoli jiného padá na výchozí. */
export function choiceParam<T extends string>(
  params: Record<string, string | number | boolean>,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const v = params[key];
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** Číselný parametr omezený na výčet povolených hodnot (`days` = 7, 14, 30…). */
export function numberChoiceParam(
  params: Record<string, string | number | boolean>,
  key: string,
  allowed: readonly number[],
  fallback: number,
): number {
  const n = Number(params[key]);
  return allowed.includes(n) ? n : fallback;
}

/**
 * Období kalendářních dnů (včetně obou konců) jako okamžiky: začátek `od 00:00` a **vyloučený** konec `do + 1 den 00:00`
 * v české zóně. Přechod letního času tak nikdy neposune hranici dne (den má 23 nebo 25 hodin).
 */
export function dayRangeInstants(
  range: DateRange,
  tz = "Europe/Prague",
): { start: Date; end: Date } {
  return {
    start: zonedToUtc(range.from, "00:00", tz),
    end: zonedToUtc(addDaysIso(range.to, 1), "00:00", tz),
  };
}

/** Zkrátí konec období na dnešek (fond pracovní doby a využití se počítají jen do teď); `null`, když období ještě nezačalo. */
export function capRangeToToday(range: DateRange, today: string): DateRange | null {
  if (range.from > today) return null;
  return range.to > today ? { from: range.from, to: today } : range;
}

/** SQL výraz začátku koše pro datumový sloupec; koš je jen z whitelistu, SQL se nikdy nesestavuje z řetězce (týden začíná pondělím). */
export function bucketTruncSql(column: AnyPgColumn | SQL, bucket: Bucket): SQL {
  const d = sql`${column}::timestamp`;
  switch (bucket) {
    case "day":
      return sql`(date_trunc('day', ${d})::date)::text`;
    case "week":
      return sql`(date_trunc('week', ${d})::date)::text`;
    case "month":
      return sql`(date_trunc('month', ${d})::date)::text`;
    case "quarter":
      return sql`(date_trunc('quarter', ${d})::date)::text`;
    case "year":
      return sql`(date_trunc('year', ${d})::date)::text`;
    default:
      throw new UserError("Neplatné období seskupení.");
  }
}

/**
 * Výchozí rozsah časové řady bez zvoleného období: od začátku současného koše dopředu (6 měsíců, 12 týdnů, 30 dní,
 * 4 čtvrtletí, 3 roky). Používá ho plán peněžních toků, který se dívá do budoucna.
 */
export function defaultForwardRange(today: string, bucket: Bucket): DateRange {
  const from = bucketStart(today, bucket);
  switch (bucket) {
    case "day":
      return { from, to: addDaysIso(from, 29) };
    case "week":
      return { from, to: addDaysIso(weekStartIso(from), 12 * 7 - 1) };
    case "month":
      return { from, to: monthRange(addMonthsIso(from, 5).slice(0, 7)).to };
    case "quarter":
      return { from, to: monthRange(addMonthsIso(from, 11).slice(0, 7)).to };
    case "year":
      return { from, to: `${Number(from.slice(0, 4)) + 2}-12-31` };
  }
}
