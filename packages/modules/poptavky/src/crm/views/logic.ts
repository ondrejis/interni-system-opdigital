// Čistá logika pohledů CRM (seznam, prognóza, archiv, dnešní práce). Klientsky bezpečné: žádné serverové importy,
// používá ji server (příkaz `crm.forecast`, metriky) i prohlížeč (navigace po měsících, filtry vlastníka).

import type { Condition, FilterGroup } from "@rebar/core/shared";
import { addMonthsIso, monthRange, todayIso } from "@rebar/core/time";
import { OPEN_DEAL_PHASES, WON_DEAL_PHASES } from "../logic";

/** Filtr vlastníka sdílený mezi pohledy: `all` (všichni), `me` (já) nebo id uživatele. */
export type OwnerFilter = "all" | "me" | string;

/** Atribut zakázky, který nese vlastníka obchodu (odpovědný). */
export const OWNER_ATTR = "manager";

/** Podmínka vlastníka pro filtr entity zakázky; `all` nefiltruje. */
export function ownerCondition(owner: OwnerFilter): Condition | null {
  if (owner === "all" || owner === "") return null;
  if (owner === "me") return { attr: OWNER_ATTR, op: "is_me" };
  return { attr: OWNER_ATTR, op: "is", value: owner };
}

/** Spojí podmínky do jednoho filtru `and`; bez podmínek `undefined`. */
export function allOf(
  ...parts: (Condition | FilterGroup | null | undefined)[]
): FilterGroup | undefined {
  const conditions = parts.filter((p): p is Condition | FilterGroup => !!p);
  return conditions.length ? { op: "and", conditions } : undefined;
}

/** Filtr „vlastník + nearchivované“ nad zakázkami, ke kterému se přidávají další podmínky. */
export const notArchived: Condition = { attr: "crmArchivedAt", op: "empty" };
/** Otevřený obchod: zakázka ve fázi poptávka nebo nabídka. */
export const openPhases: Condition = {
  attr: "phase",
  op: "is_any_of",
  value: [...OPEN_DEAL_PHASES],
};

/**
 * Výchozí filtr seznamu obchodů: otevřené (poptávka a nabídka), nearchivované. Pohledy nad ním zůstávají stejné jako
 * na nástěnce; uživatel filtr vidí jako chipy a může ho změnit.
 */
export const DEAL_LIST_DEFAULT_FILTER: FilterGroup = {
  op: "and",
  conditions: [openPhases, notArchived],
};

/** Rozsahy archivu, které smí příkaz `crm.archive.list` (a přepínač pohledu Archiv). */
export const ARCHIVE_SCOPES = ["closed", "archived", "lost", "won", "all"] as const;
/** Rozsah archivu: co se v něm ukazuje (viz `ARCHIVE_SCOPE_LABELS`). */
export type ArchiveScope = (typeof ARCHIVE_SCOPES)[number];

export const ARCHIVE_SCOPE_LABELS: Record<ArchiveScope, string> = {
  closed: "Archivované a prohrané",
  archived: "Archivované",
  lost: "Prohrané",
  won: "Vyhrané",
  all: "Vše",
};

/* ---------- měsíce prognózy ---------- */

/** Klíč měsíce `YYYY-MM` z data (`YYYY-MM-DD` nebo ISO okamžiku). */
export const monthKey = (date: string): string => date.slice(0, 7);

/** Je klíč platný měsíc `YYYY-MM`? */
export const isMonthKey = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

/** Posune měsíc `YYYY-MM` o `n` měsíců (i záporně). */
export function shiftMonth(key: string, n: number): string {
  return monthKey(addMonthsIso(`${key}-01`, n));
}

/** Měsíce od `from` (včetně) po `count` kusech. */
export function monthSpan(from: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => shiftMonth(from, i));
}

const monthFmt = new Intl.DateTimeFormat("cs-CZ", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const monthShortFmt = new Intl.DateTimeFormat("cs-CZ", { month: "long", timeZone: "UTC" });

/** „říjen 2026“ z `2026-10`. */
export function monthLabel(key: string): string {
  return monthFmt.format(new Date(`${key}-15T12:00:00Z`));
}

/** „říjen“ z `2026-10` (rok se vynechá, je-li jasný z okolí). */
export function monthName(key: string): string {
  return monthShortFmt.format(new Date(`${key}-15T12:00:00Z`));
}

/** Aktuální měsíc v české zóně. */
export const currentMonth = (now: Date = new Date()): string =>
  monthKey(todayIso("Europe/Prague", now));

/* ---------- sloupce prognózy ---------- */

/** Zakázka v prognóze: údaje, které potřebuje karta. Peníze jsou `null` bez oprávnění `zakazky.economics`. */
export type ForecastDeal = {
  id: string;
  number: string;
  title: string;
  companyName: string | null;
  stageId: string;
  phase: string;
  /** Předpokládané uzavření (`YYYY-MM-DD`), u vyhraných datum výhry. */
  closeDate: string | null;
  /** Cena nabídky (smluvní cena) v haléřích. */
  valueMinor: number | null;
  /** Vážená hodnota v haléřích (u vyhraných celá hodnota). */
  weightedMinor: number | null;
  /** Platná pravděpodobnost výhry v procentech (u vyhraných 100). */
  probabilityPct: number | null;
  managerId: string | null;
  managerName: string | null;
  rotting: boolean;
  won: boolean;
  /** Ve stavu od (ISO okamžik), kvůli „dny ve stavu“ na kartě. */
  stageEnteredAt: string | null;
  /** Poslední hotová aktivita (ISO okamžik), z ní se počítají dny „Bez pohybu“ na kartě. */
  lastActivityAt: string | null;
  /** Nejbližší otevřená aktivita (ISO okamžik) a počet otevřených. */
  nextActivityAt: string | null;
  openActivities: number;
};

/** Součet za skupinu zakázek: počet a částky; částky `null` bez oprávnění k ekonomice. */
export type ForecastTotals = {
  count: number;
  valueMinor: number | null;
  weightedMinor: number | null;
};

/** Jeden sloupec prognóze: měsíc, „dřívější“ (po termínu před oknem) nebo „bez data“. */
export type ForecastColumn = {
  /** `YYYY-MM`, `earlier` nebo `none`. */
  key: string;
  kind: "month" | "earlier" | "none";
  /** Otevřené obchody sloupce: počet, hodnota a vážená hodnota. */
  open: ForecastTotals;
  /** Vyhrané obchody sloupce (podle data výhry): počet a hodnota. */
  won: ForecastTotals;
  /** Celkem otevřené + vyhrané: počet a hodnota; vážená = vážená otevřená + vyhrané celé. */
  total: ForecastTotals;
  /** Karty sloupce (omezený počet), nejdřív otevřené podle termínu, potom vyhrané. */
  deals: ForecastDeal[];
  /** Kolik karet se do sloupce nevešlo. */
  hidden: number;
};

/** Výsledek příkazu `crm.forecast`. */
export type ForecastResult = {
  /** Dnešní den v české zóně. */
  today: string;
  /** Okno měsíců (první měsíc a počet). */
  from: string;
  months: number;
  /** Vidí aktér peníze (`zakazky.economics`)? Bez nich jsou částky `null`. */
  money: boolean;
  columns: ForecastColumn[];
  /** Stavy otevřených fází v pořadí (pro pruh pozice na kartě). */
  stages: { id: string; name: string; color: string; phase: string }[];
};

const emptyTotals = (money: boolean): ForecastTotals => ({
  count: 0,
  valueMinor: money ? 0 : null,
  weightedMinor: money ? 0 : null,
});

const addTo = (t: ForecastTotals, d: ForecastDeal, weighted: number | null) => {
  t.count += 1;
  if (t.valueMinor !== null) t.valueMinor += d.valueMinor ?? 0;
  if (t.weightedMinor !== null) t.weightedMinor += weighted ?? 0;
};

/** Poslední den okna a první den (včetně) kvůli dotazům: `[from-01, to]`. */
export function windowRange(from: string, months: number): { from: string; to: string } {
  return { from: `${from}-01`, to: monthRange(shiftMonth(from, months - 1)).to };
}

/**
 * Seskládá sloupce prognózy ze zakázek. Otevřené obchody padají podle předpokládaného uzavření do měsíců okna,
 * dřívější než okno do sloupce `earlier`, bez data do `none` (později než okno se nezobrazí). Vyhrané padají do měsíce
 * podle data výhry (`closeDate`) a jen do měsíců okna. Čistá funkce (testy: součty a oprávnění).
 *
 * @param deals zakázky (otevřené nearchivované a vyhrané); prohrané a archivované se nepředávají
 * @param opts `from` první měsíc, `months` počet měsíců, `money` smí aktér vidět peníze, `maxCards` karet na sloupec
 */
export function buildForecastColumns(
  deals: readonly ForecastDeal[],
  opts: { from: string; months: number; money: boolean; maxCards?: number },
): ForecastColumn[] {
  const { from, months, money } = opts;
  const maxCards = opts.maxCards ?? 40;
  const keys = monthSpan(from, months);
  const make = (key: string, kind: ForecastColumn["kind"]): ForecastColumn => ({
    key,
    kind,
    open: emptyTotals(money),
    won: emptyTotals(money),
    total: emptyTotals(money),
    deals: [],
    hidden: 0,
  });
  const cols = new Map<string, ForecastColumn>();
  const earlier = make("earlier", "earlier");
  const none = make("none", "none");
  for (const k of keys) cols.set(k, make(k, "month"));

  const sorted = [...deals].sort(
    (a, b) =>
      Number(a.won) - Number(b.won) ||
      (a.closeDate ?? "9999").localeCompare(b.closeDate ?? "9999") ||
      (b.valueMinor ?? 0) - (a.valueMinor ?? 0) ||
      a.number.localeCompare(b.number),
  );
  for (const d of sorted) {
    let col: ForecastColumn | undefined;
    if (d.won) col = d.closeDate ? cols.get(monthKey(d.closeDate)) : undefined;
    else if (!d.closeDate) col = none;
    else {
      const k = monthKey(d.closeDate);
      col = cols.get(k) ?? (k < from ? earlier : undefined);
    }
    if (!col) continue;
    if (d.won) {
      addTo(col.won, d, d.valueMinor);
      addTo(col.total, d, d.valueMinor);
    } else {
      addTo(col.open, d, d.weightedMinor);
      addTo(col.total, d, d.weightedMinor);
    }
    if (col.deals.length < maxCards) col.deals.push(d);
    else col.hidden += 1;
  }
  // `total.valueMinor` je součet hodnot (otevřených i vyhraných), `weightedMinor` vážený součet
  return [earlier, ...cols.values(), none];
}

/** Součet hodnot a vážených hodnot sloupců (rychlý souhrn pod přepínačem měsíců). */
export function sumColumns(columns: readonly ForecastColumn[]): ForecastColumn["total"] {
  const out: ForecastTotals = { count: 0, valueMinor: null, weightedMinor: null };
  for (const c of columns) {
    out.count += c.total.count;
    if (c.total.valueMinor !== null) out.valueMinor = (out.valueMinor ?? 0) + c.total.valueMinor;
    if (c.total.weightedMinor !== null)
      out.weightedMinor = (out.weightedMinor ?? 0) + c.total.weightedMinor;
  }
  return out;
}

/** Fáze, které se v prognóze počítají jako vyhrané. */
export const FORECAST_WON_PHASES: readonly string[] = WON_DEAL_PHASES;

/* ---------- pozornost (přehled) ---------- */

/** Proč obchod vyžaduje pozornost; jeden obchod patří vždy jen do jedné skupiny (bez duplicit), nejvyšší priorita vyhrává. */
export type DealAttentionKind = "overdue_activity" | "rotting" | "no_activity" | "close_passed";

/**
 * Skupina pozornosti otevřeného obchodu, nebo `null`. Pořadí priorit: aktivity po termínu, zhnilý, bez další aktivity,
 * uplynulé předpokládané uzavření (den před dneškem a dřív). Archivované a uzavřené obchody se sem nepředávají.
 */
export function dealAttentionKind(
  d: {
    overdueActivities: number;
    rotting: boolean;
    openActivities: number;
    expectedCloseDate: string | null;
  },
  today: string,
): DealAttentionKind | null {
  if (d.overdueActivities > 0) return "overdue_activity";
  if (d.rotting) return "rotting";
  if (d.openActivities <= 0) return "no_activity";
  if (d.expectedCloseDate && d.expectedCloseDate < today) return "close_passed";
  return null;
}

/** Jeden řádek archivu: uzavřený (vyhraný, prohraný) nebo archivovaný obchod. Peníze jsou `null` bez `zakazky.economics`. */
export type ArchiveRow = {
  id: string;
  number: string;
  title: string;
  companyName: string | null;
  phase: string;
  stageName: string | null;
  stageColor: string | null;
  managerName: string | null;
  valueMinor: number | null;
  /** Důvod prohry (popisek z číselníku) a poznámka. */
  lostReason: string | null;
  lostNote: string | null;
  /** Kdy byl obchod archivován (ISO), jinak `null`. */
  archivedAt: string | null;
  /** Kdy se obchod uzavřel: prohrál (změna fáze), nebo vyhrál (datum výhry). */
  closedAt: string | null;
};

/** Stránka archivu z příkazu `crm.archive.list`: řádky, celkový počet a příznak, zda aktér vidí peníze. */
export type ArchivePage = { total: number; rows: ArchiveRow[]; money: boolean };
