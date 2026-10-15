import type { People, PaymentRow } from "../contract";
import { formatMoney } from "../logic";

/*
  Čisté pomocné funkce UI financí (bez Reactu, aby šly testovat v uzlu): popisky, formát částek a dat, měsíce,
  rozsahy období filtrů a další krok stavového toku platby.
*/

export const KIND_LABELS: Record<string, string> = {
  one_off: "Jednorázová",
  intro: "Úvodní fáze",
  retainer: "Retainer",
  extra: "Navíc",
  recurring: "Opakovaná (Fakturoid)",
};
export const STATUS_LABELS: Record<string, string> = {
  planned: "Plánovaná",
  issued: "Vystavená",
  paid: "Zaplacená",
  canceled: "Zrušená",
};
export const STATUS_COLORS: Record<string, string> = {
  planned: "gray",
  issued: "blue",
  paid: "green",
  canceled: "red",
};
export const METHOD_LABELS: Record<string, string> = {
  invoice: "Faktura mezi IČO",
  transfer: "Převod",
  offset: "Zápočet",
};
export const TYPE_LABELS: Record<string, string> = {
  web: "Web",
  marketing: "Marketing",
  systemy: "Systémy",
  recurring: "Opakované (Fakturoid)",
};

/** Částka v haléřích česky (`12 400 Kč`). */
export const money = (minor: number): string => formatMoney(minor);

/** Dnešní datum `RRRR-MM-DD` v místním čase. */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Aktuální měsíc `RRRR-MM`. */
export const thisMonth = (): string => today().slice(0, 7);

/** `2026-10-14` → `14. 10. 2026`; prázdné → pomlčka. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "–";
  const [y, m, d] = iso.split("-");
  return `${Number(d)}. ${Number(m)}. ${y}`;
}

/** `2026-12` → `12/2026`. */
export function monthLabel(month: string | null | undefined): string {
  return month ? `${month.slice(5)}/${month.slice(0, 4)}` : "Bez data";
}

const MONTH_NAMES = [
  "leden",
  "únor",
  "březen",
  "duben",
  "květen",
  "červen",
  "červenec",
  "srpen",
  "září",
  "říjen",
  "listopad",
  "prosinec",
];
/** `2026-12` → `prosinec 2026`. */
export function monthName(month: string | null | undefined): string {
  return month
    ? `${MONTH_NAMES[Number(month.slice(5)) - 1] ?? month} ${month.slice(0, 4)}`
    : "Bez data";
}

/** Zkratka měsíce do osy grafu. */
export const SHORT_MONTHS = [
  "led",
  "úno",
  "bře",
  "dub",
  "kvě",
  "čvn",
  "čvc",
  "srp",
  "zář",
  "říj",
  "lis",
  "pro",
];

/** Křestní jméno z celého jména („Ondřej Dvořák“ → „Ondřej“). */
export const firstNameOf = (label: string): string => label.trim().split(/\s+/)[0] ?? label;

/** Jméno osoby z odpovědi příkazů (`people`), jinak znak „?“. */
export function personName(people: People, id: string | null | undefined): string {
  if (!id) return "–";
  return people[id]?.firstName || people[id]?.name || "?";
}

/** Rozsah dnů celého měsíce `RRRR-MM`. */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const last = new Date(y, m, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

/** Posun měsíce `RRRR-MM` o `delta` měsíců. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Další krok stavového toku, který se nabízí jako hlavní tlačítko řádku (Plánovaná → Vystavená → Zaplacená). */
export function nextStep(
  status: PaymentRow["status"],
): { to: "issued" | "paid"; label: string } | null {
  if (status === "planned") return { to: "issued", label: "Vystavit" };
  if (status === "issued") return { to: "paid", label: "Zaplaceno" };
  return null;
}
