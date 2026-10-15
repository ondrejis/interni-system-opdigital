// Čistá logika UI obchodů (bez Reactu a bez serveru): filtry boardu a seznamu, hodnota v adrese, zvýraznění karty
// z řádku entity, souhrn sloupce. Klientsky bezpečné, proto jde testovat samostatně.
import type { FilterGroup, RecordRow, StageDescriptor } from "@rebar/core/shared";
import { dealHighlight, type DealHighlight } from "../deals/logic";
import type { DealResult, DealSource } from "../shared";

/** Zobrazení stránky `/obchody` (`?zobrazeni=`). */
export const DEAL_VIEWS = ["board", "seznam"] as const;
/** Zobrazení stránky `/obchody`. */
export type DealView = (typeof DEAL_VIEWS)[number];

/** Zobrazení z adresy; neznámá nebo chybějící hodnota je board. */
export function viewFromQuery(value: string | null | undefined): DealView {
  return (DEAL_VIEWS as readonly string[]).includes(value ?? "") ? (value as DealView) : "board";
}

/** Filtr vlastníka z adresy (`?vlastnik=`): `all`, `me`, nebo id uživatele. */
export function ownerFromQuery(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  return v && v !== "all" ? v : "all";
}

/** Podmínka na vlastníka obchodu; `all` ji nepřidává. */
export function ownerCondition(owner: string) {
  if (owner === "all") return null;
  return owner === "me"
    ? ({ attr: "owner", op: "is_me" } as const)
    : ({ attr: "owner", op: "is", value: owner } as const);
}

/** Pevný filtr boardu: jen otevřené obchody (vyhrané a prohrané jsou v seznamu) a případně jeden vlastník. */
export function boardFilters(owner: string): FilterGroup {
  const conditions: FilterGroup["conditions"] = [{ attr: "result", op: "is", value: "open" }];
  const own = ownerCondition(owner);
  if (own) conditions.push(own);
  return { op: "and", conditions };
}

/** Výchozí filtr seznamu: otevřené obchody (uživatel ho smí zrušit nebo změnit). */
export function listDefaultFilters(owner: string): FilterGroup {
  return boardFilters(owner);
}

/** Souhrn sloupce z agregací serveru; `null`, když součty nejsou k dispozici. */
export function columnTotals(
  count: number,
  sums: Record<string, number> | undefined,
): { count: number; totalMinor: number; weightedMinor: number } | null {
  if (!sums || sums.value === undefined) return null;
  return { count, totalMinor: sums.value ?? 0, weightedMinor: sums.weighted ?? 0 };
}

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Zvýraznění karty z řádku entity `deal` (klíče atributů) a z fází pipeline (práh nečinnosti). */
export function highlightOfRow(
  row: RecordRow,
  stages: readonly StageDescriptor[],
  now: Date = new Date(),
): DealHighlight {
  const stage = stages.find((s) => s.id === row.status);
  return dealHighlight(
    {
      result: (text(row.result) ?? "open") as DealResult,
      stageEnteredAt: text(row.stageEnteredAt),
      nextActivityAt: text(row.nextActivityAt),
      lastActivityAt: text(row.lastActivityAt),
      rottingDays: stage?.rottingDays ?? null,
      source: (text(row.source) ?? "manual") as DealSource,
      firstOpenedAt: text(row.firstOpenedAt),
    },
    now,
  );
}

/** „1 obchod“, „2 obchody“, „5 obchodů“. */
export function pluralDeals(n: number): string {
  if (n === 1) return "obchod";
  return n >= 2 && n <= 4 ? "obchody" : "obchodů";
}

/** „1 den“, „2 dny“, „5 dní“ (jen slovo bez čísla). */
export function pluralDays(n: number): string {
  if (n === 1) return "den";
  return n >= 2 && n <= 4 ? "dny" : "dní";
}

/** Jak se obchod ukáže v pásu fází detailu. */
export type StripMode = "open" | "won" | "lost";

/** Režim pásu fází podle výsledku obchodu. */
export const stripMode = (result: unknown): StripMode =>
  result === "won" ? "won" : result === "lost" ? "lost" : "open";

/** Dny strávené v každé fázi (součet pobytů; obchod se mohl do fáze vrátit). */
export function stageDays(history: readonly { toStageId: string; days: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const h of history) out[h.toStageId] = (out[h.toStageId] ?? 0) + Math.max(0, h.days);
  return out;
}

/** Změní parametry adresy bez navigace (stav stránky zůstane, odkaz nese zobrazení a vlastníka). */
export function replaceQuery(patch: Record<string, string | null>): void {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  window.history.replaceState(window.history.state, "", url);
}
