import { eq, sql } from "drizzle-orm";
import { formatNumber, validatePattern } from "./pattern";
import { schema, type Executor } from "../db/client";
import { UserError } from "../rbac/errors";
import { assertCan } from "../rbac/permissions";
import { inTx } from "../rbac/context";
import { auditChange } from "../audit/audit";
import type { Ctx } from "../rbac/types";

export { formatNumber, validatePattern } from "./pattern";
export type SeriesDef = { key: string; pattern: string; reset?: "yearly" | "never" };

const g = globalThis as { __seriesDefs?: Map<string, SeriesDef> }; // globálně: Next bundluje route handlery zvlášť
const registry = (g.__seriesDefs ??= new Map<string, SeriesDef>());

/** Modul deklaruje své číselné řady (faktury, zakázky, doklady skladu…). */
export function defineSeries(def: SeriesDef): SeriesDef {
  registry.set(def.key, def);
  return def;
}

export function listSeriesDefs(): SeriesDef[] {
  return [...registry.values()];
}

/** Založí chybějící řady z deklarací modulů (existující se nemění). */
export async function ensureSeries(
  db: Executor,
  defs: readonly SeriesDef[] = listSeriesDefs(),
): Promise<void> {
  for (const d of defs) {
    const bad = validatePattern(d.pattern);
    if (bad) throw new Error(`Řada „${d.key}“: ${bad}`);
    await db
      .insert(schema.numberSeries)
      .values({ key: d.key, pattern: d.pattern, reset: d.reset ?? "yearly" })
      .onConflictDoNothing();
  }
}

/**
 * Přidělí další číslo řady. Jeden `UPDATE` zamkne řádek řady, takže souběžné doklady nikdy nedostanou
 * stejné číslo. Volejte ve stejné transakci, která doklad ukládá — když se vrátí, vrátí se i číslo
 * (žádné díry). Zpětné číslování do dřívějšího roku, než kde řada už je, se odmítne.
 *
 * `isTaken` chrání před kolizí s čísly, která vznikla mimo řadu (import, ruční zápis do databáze, obnova ze zálohy):
 * obsazené číslo se přeskočí a řada se posune dál, takže založení nikdy nespadne na duplicitě.
 */
export async function nextNumber(
  db: Executor,
  key: string,
  date = new Date(),
  opts: { isTaken?: (number: string) => Promise<boolean> } = {},
): Promise<string> {
  const [series] = await db
    .select()
    .from(schema.numberSeries)
    .where(eq(schema.numberSeries.key, key));
  if (!series) throw new Error(`Číselná řada „${key}“ neexistuje.`);
  const period = series.reset === "yearly" ? String(date.getFullYear()) : "all";

  for (let attempt = 0; attempt < MAX_SKIPPED; attempt++) {
    const rows = await db.execute<{ pattern: string; last_value: number }>(sql`
      update number_series
         set last_value = case when period = ${period} then last_value + 1 else 1 end,
             period = ${period},
             updated_at = now()
       where key = ${key} and (period = '' or period <= ${period})
   returning pattern, last_value`);
    const row = rows[0];
    if (!row) {
      throw new UserError(
        `Číselná řada už pokračuje v novějším roce, doklad z roku ${period} nelze zpětně očíslovat.`,
      );
    }
    const number = formatNumber(row.pattern, row.last_value, date);
    if (!opts.isTaken || !(await opts.isTaken(number))) return number;
  }
  throw new Error(
    `Číselná řada „${key}“: přeskočeno příliš mnoho obsazených čísel, zkontrolujte řadu.`,
  );
}

/** Nejvýše tolik obsazených čísel se v řadě přeskočí, než se přidělování vzdá (ochrana před nekonečnou smyčkou). */
const MAX_SKIPPED = 10_000;

/** Změna vzoru řady v administraci. */
export async function updateSeriesPattern(ctx: Ctx, key: string, pattern: string): Promise<void> {
  assertCan(ctx, "settings.manage");
  const bad = validatePattern(pattern);
  if (bad) throw new UserError(bad);
  await inTx(ctx, async (c) => {
    const [before] = await c.db
      .select()
      .from(schema.numberSeries)
      .where(eq(schema.numberSeries.key, key));
    if (!before) throw new UserError("Číselná řada neexistuje.");
    await c.db.update(schema.numberSeries).set({ pattern }).where(eq(schema.numberSeries.key, key));
    await auditChange(c, {
      entityType: "number_series",
      entityId: key,
      before: { pattern: before.pattern },
      after: { pattern },
      summary: `Vzor řady ${key}`,
    });
  });
}

/** Řada s ukázkou čísla, které dostane další doklad (bez přidělení). */
export type SeriesRow = {
  key: string;
  pattern: string;
  reset: "yearly" | "never";
  period: string;
  lastValue: number;
  /** Poslední přidělené číslo, nebo `null`, když řada ještě nebyla použitá v tomto období. */
  next: string;
};

/** Číslo, které by dostal další doklad k danému datu; nic nepřiděluje ani nezamyká. */
export function previewNext(
  row: { pattern: string; reset: "yearly" | "never"; period: string; lastValue: number },
  date = new Date(),
): string {
  const period = row.reset === "yearly" ? String(date.getFullYear()) : "all";
  const seq = row.period === period ? row.lastValue + 1 : 1;
  return formatNumber(row.pattern, seq, date);
}

/** Všechny řady v databázi s ukázkou dalšího čísla. */
export async function listSeries(db: Executor, date = new Date()): Promise<SeriesRow[]> {
  const rows = await db.select().from(schema.numberSeries).orderBy(schema.numberSeries.key);
  return rows.map((r) => ({
    key: r.key,
    pattern: r.pattern,
    reset: r.reset,
    period: r.period,
    lastValue: r.lastValue,
    next: previewNext(r, date),
  }));
}
