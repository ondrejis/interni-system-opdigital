// Čistá logika nástěnky a detailu zakázky v CRM (bez Reactu a bez serveru): filtry nástěnky, stavy pásu fází, dny ve stavech,
// přiřazení věty kontroly k poli, adresa stránky. Klientsky bezpečné a bez vedlejších účinků, proto jde testovat samostatně.
import type { FilterGroup, StageDescriptor } from "@rebar/core/shared";
import { daysSince, isOpenDeal, isWonDeal, OPEN_DEAL_PHASES } from "../logic";

/** Co brání přesunu zakázky do stavu: česká věta a (když se dá určit) pole, které stačí vyplnit. */
export type MoveProblem = {
  message: string;
  /** Klíč atributu zakázky (`address`, `custom.typ`…), který chybí; `null`, když problém není o jednom poli. */
  attr: string | null;
  label: string | null;
};

/** Výsledek kontroly přesunu (`crm.deal.moveCheck`): cílový stav a problémy; prázdný seznam = přesun projde. */
export type MoveCheck = {
  target: { id: string; name: string; phase: string | null };
  problems: MoveProblem[];
};

/** Sledující zakázky (`crm.follower.*`): kdo dostává upozornění na změnu stavu, výhru a prohru. */
export type FollowerList = {
  count: number;
  /** Sleduje zakázku přihlášený uživatel? */
  following: boolean;
  followers: { userId: string; name: string; since: string }[];
};

/** Pohledy stránky `/crm` (hodnota v adrese `?zobrazeni=`). */
export const CRM_VIEWS = ["nastenka", "seznam", "prognoza", "archiv"] as const;
/** Jeden z pohledů stránky `/crm`. */
export type CrmView = (typeof CRM_VIEWS)[number];

/** Pohled z adresy; neznámá nebo chybějící hodnota je nástěnka. */
export function viewFromQuery(value: string | null | undefined): CrmView {
  return (CRM_VIEWS as readonly string[]).includes(value ?? "") ? (value as CrmView) : "nastenka";
}

/** Filtr vlastníka z adresy (`?vlastnik=`): `me`, id uživatele, jinak všichni. */
export function ownerFromQuery(value: string | null | undefined): "all" | "me" | string {
  const v = (value ?? "").trim();
  if (!v || v === "all") return "all";
  return v;
}

/** Stavy nástěnky: jen stavy fází Poptávka a Nabídka v pořadí pipeline (výhra, prohra a realizace mají vlastní cíle). */
export function boardStages(stages: readonly StageDescriptor[]): StageDescriptor[] {
  return stages.filter((s) => !!s.phase && OPEN_DEAL_PHASES.includes(s.phase));
}

/** Podmínka na vlastníka (odpovědnou osobu) zakázky; `all` ji nepřidává. */
export function ownerCondition(owner: string) {
  if (owner === "all") return null;
  return owner === "me"
    ? ({ attr: "manager", op: "is_me" } as const)
    : ({ attr: "manager", op: "is", value: owner } as const);
}

/**
 * Pevný filtr nástěnky: zakázky ve fázích Poptávka a Nabídka, které nejsou archivované, a (volitelně) jen jednoho vlastníka.
 * Výhra, prohra i archiv jsou mimo nástěnku (vyhrané a prohrané vidí Archiv).
 */
export function boardFilters(owner: string): FilterGroup {
  const conditions: FilterGroup["conditions"] = [
    { attr: "phase", op: "is_any_of", value: [...OPEN_DEAL_PHASES] },
    { attr: "crmArchivedAt", op: "empty" },
  ];
  const own = ownerCondition(owner);
  if (own) conditions.push(own);
  return { op: "and", conditions };
}

/** Řádek historie stavů tak, jak ho vrací `crm.deal.history` (jen pole, která pás fází potřebuje). */
export type HistoryLike = { stageId: string; days: number };

/** Dny ve stavech: součet pobytů v každém stavu (zakázka se do stavu mohla vrátit); stav bez návštěvy v mapě chybí. */
export function stageDays(history: readonly HistoryLike[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const h of history) out[h.stageId] = (out[h.stageId] ?? 0) + Math.max(0, h.days);
  return out;
}

/** Jak se zakázka ukáže v pásu fází. */
export type StripMode = "open" | "won" | "lost" | "other";

/** Jak se zakázka s danou fází ukáže v pásu fází: otevřená, vyhraná, prohraná, nebo jiná (pozastavená). */
export function stripMode(phase: unknown): StripMode {
  if (isOpenDeal(phase)) return "open";
  if (isWonDeal(phase)) return "won";
  if (phase === "lost") return "lost";
  return "other";
}

/**
 * Pole, které stačí doplnit, aby prošla kontrola přechodu, podle znění věty z kontroly přechodu fáze (hooky
 * jiných modulů vrací jen větu). Neznámá věta = žádné pole (UI ukáže jen větu).
 */
export function problemFields(message: string): { attr: string | null; label: string | null } {
  const text = message.toLowerCase();
  if (text.includes("adres") && text.includes("stavb"))
    return { attr: "address", label: "Adresa stavby" };
  if (text.includes("zákazník")) return { attr: "company", label: "Zákazník" };
  if (text.includes("datum zahájení")) return { attr: "startDate", label: "Zahájení" };
  return { attr: null, label: null };
}

/** Stáří zakázky a počet dní bez aktivity pro sekci Přehled. */
export function dealAge(
  input: {
    createdAt?: string | Date | null;
    lastActivityAt?: string | Date | null;
    stageEnteredAt?: string | Date | null;
  },
  now: Date = new Date(),
): { ageDays: number; inactiveDays: number } {
  const last = [input.lastActivityAt, input.stageEnteredAt, input.createdAt]
    .filter((v): v is string | Date => !!v)
    .map((v) => new Date(v).getTime())
    .filter((t) => !Number.isNaN(t));
  return {
    ageDays: daysSince(input.createdAt, now),
    inactiveDays: last.length ? daysSince(new Date(Math.max(...last)), now) : 0,
  };
}

/** Přidá do adresy `?record=` odkaz na zakázku na nástěnce (odkaz do upozornění, schránky, e-mailů). */
export const dealHref = (id: string) => `/crm?record=${id}`;

/**
 * Souhrn sloupce nástěnky z agregací serveru (`sums` skupiny): počet, součet a vážený součet. Bez práva na ekonomiku
 * (`sums` bez cen) vrátí `null` místo součtů.
 */
export function columnTotals(
  count: number,
  sums: Record<string, number> | undefined,
): { count: number; totalMinor: number; weightedMinor: number } | null {
  if (!sums || sums.sumContract === undefined) return null;
  return {
    count,
    totalMinor: sums.sumContract ?? 0,
    weightedMinor: sums.crmWeighted ?? 0,
  };
}

/** „1 den“, „2 dny“, „5 dní“ (pro čip „Bez pohybu 12 dní“). */
export function pluralDays(n: number): string {
  if (n === 1) return "den";
  if (n >= 2 && n <= 4) return "dny";
  return "dní";
}

/** „1 zakázka“, „2 zakázky“, „5 zakázek“. */
export function pluralDeals(n: number): string {
  if (n === 1) return "zakázka";
  if (n >= 2 && n <= 4) return "zakázky";
  return "zakázek";
}
