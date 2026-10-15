// Vstup pro prohlížeč: jen typy a čisté funkce, žádná databáze. Importuje se jako `@rebar/core/shared`.

export { ATTRIBUTE_TYPES } from "./types";
export type { AttributeType, Choice, RecordRow, Labels } from "./types";
export { OPERATORS, OPERATORS_BY_TYPE, OPERATOR_LABELS, VALUELESS_OPERATORS } from "./operators";
export type { Operator, Condition, FilterGroup } from "./operators";

import type { AttributeType, Choice, Labels, RecordRow } from "./types";
import type { FilterGroup } from "./operators";

export type StageDescriptor = {
  id: string;
  name: string;
  color: string;
  kind: "open" | "won" | "lost" | "done";
  /** Fáze životního cyklu, do které stav patří (zakázky); jinak `null`. */
  phase?: string | null;
  /** Pravděpodobnost výhry ve stavu (0–100 %) a dny do hnití (CRM); `null` = nezadáno. */
  probabilityPct?: number | null;
  rottingDays?: number | null;
};

/** Atribut tak, jak ho vidí prohlížeč (bez sloupců databáze). */
export type AttributeDescriptor = {
  key: string;
  label: string;
  type: AttributeType;
  custom: boolean;
  readonly: boolean;
  required: boolean;
  sortable: boolean;
  filterable: boolean;
  aggregate: boolean;
  defaultVisible: boolean;
  width: number;
  default?: string | number | boolean;
  /** Jednotka čísla (`percent`, `percent_bp`). */
  unit?: "percent" | "percent_bp";
  choices?: readonly Choice[];
  record?: { entityType: string };
  /** Stavy pipeline pro atribut typu `status`. */
  stages?: StageDescriptor[];
  /** Pole je i v krátkém formuláři „Nový…“ (vlastní pole s `show_in_form`). */
  showInForm?: boolean;
};

export type EntityDescriptor = {
  key: string;
  label: { one: string; many: string };
  listPath: string;
  titleKey: string;
  statusKey: string | null;
  attributes: AttributeDescriptor[];
  /**
   * Zámek (shared/private): `lockable` = aktér smí záznamy zamykat (`private.read`) a tato entita má vlastní zámek;
   * `hasLock` = entita zámek má (dítě bez vlastního zámku ho jen dědí).
   */
  visibility?: { lockable: boolean; hasLock: boolean };
  /** Co smí aktér s entitou dělat (jen pro zobrazení; skutečná kontrola je vždy na serveru). */
  can: { create: boolean; write: boolean; delete: boolean; export?: boolean };
};

export type QueryParams = {
  filters?: FilterGroup;
  sort?: { attr: string; dir: "asc" | "desc" }[];
  q?: string;
  limit?: number;
  offset?: number;
  group?: string | null;
};

export type QueryPage = {
  rows: RecordRow[];
  total: number;
  totals: Record<string, number>;
  labels: Labels;
};

export type GroupSummary = {
  value: string | boolean | null;
  count: number;
  sums: Record<string, number>;
};

/** Zaokrouhlení na celé haléře: půl od nuly (ADR 003). Jediné místo v kódu, kde se zaokrouhluje. */
export function roundMinor(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

const nf = new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 0 });

/** Částka v haléřích → „125 000 Kč“ (celé koruny; haléře se ukážou, jen když nějaké jsou). */
export function formatMinor(minor: number | null | undefined, currency = "CZK"): string {
  if (minor === null || minor === undefined) return "";
  const symbol = currency === "CZK" ? "Kč" : currency;
  const whole = minor / 100;
  const text = Number.isInteger(whole)
    ? nf.format(whole)
    : new Intl.NumberFormat("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
        whole,
      );
  return `${text}\u00a0${symbol}`;
}

/** Text zadaný uživatelem („125 000“, „1 250,50“) → haléře; `null`, když to není číslo. */
export function parseMinor(text: string): number | null {
  const clean = text
    .replace(/[\s\u00a0]/g, "")
    .replace(/Kč$/i, "")
    .replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

const dateFmt = new Intl.DateTimeFormat("cs-CZ", {
  day: "numeric",
  month: "numeric",
  year: "numeric",
});

/** „2026-10-08“ → „8. 10. 2026“. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d);
}

const pctFmt = new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 2 });

/** Číslo s jednotkou pro zobrazení: „5 %“ (`percent_bp`: 500 → „5 %“, `percent`: 23,5 → „23,5 %“). */
export function formatNumberUnit(
  unit: "percent" | "percent_bp" | undefined,
  value: number,
): string {
  const n = Number(value);
  if (unit === "percent_bp") return `${pctFmt.format(n / 100)}\u00a0%`;
  if (unit === "percent") return `${pctFmt.format(n)}\u00a0%`;
  return new Intl.NumberFormat("cs-CZ").format(n);
}

/** Uložená hodnota čísla → text v editoru (`percent_bp`: 250 → „2,5“). */
export function numberToInput(unit: "percent" | "percent_bp" | undefined, value: number): string {
  return String(unit === "percent_bp" ? Number(value) / 100 : Number(value)).replace(".", ",");
}

/** Text z editoru → uložená hodnota (`percent_bp`: „2,5“ → 250); `null`, když to není číslo. */
export function inputToNumber(
  unit: "percent" | "percent_bp" | undefined,
  text: string,
): number | null {
  const n = Number(text.replace(/[\s\u00a0%]/g, "").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return unit === "percent_bp" ? Math.round(n * 100) : n;
}
