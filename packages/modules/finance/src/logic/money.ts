/*
  Peníze jako celá čísla v minor units (haléře), měna CZK. Žádná plovoucí čárka v počítání; desetinná čísla se používají
  jen při formátování. Procenta se převádějí na celočíselné setiny promile (1 % = 10 000 jednotek, tj. 4 desetinná místa).
*/
import { FinanceLogicError } from "./types";

/** Je hodnota bezpečné celé číslo (≥ 0 nebo záporné — kontrola znaménka je na volajícím)? */
export function isMinor(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

/** Vyhodí chybu, pokud částka není kladné celé číslo haléřů (FIN-08: částka > 0). */
export function assertPositiveMinor(value: unknown, what = "Částka"): number {
  if (!isMinor(value) || value <= 0) {
    throw new FinanceLogicError("invalid_amount", `${what} musí být kladné celé číslo haléřů.`);
  }
  return value;
}

/** Vyhodí chybu, pokud částka není nezáporné celé číslo haléřů. */
export function assertNonNegativeMinor(value: unknown, what = "Částka"): number {
  if (!isMinor(value) || value < 0) {
    throw new FinanceLogicError("invalid_amount", `${what} musí být nezáporné celé číslo haléřů.`);
  }
  return value;
}

/** Kolik jednotek „bp4“ je jedno procento (4 desetinná místa). */
export const PERCENT_SCALE = 10_000;

/**
 * Převede procenta (číslo, nebo řetězec „60.00“ / „33,33“) na celé jednotky 1/10 000 procenta (60 % → 600 000).
 * Povoleno max. 4 desetinná místa; jinak vyhodí `invalid_percent`.
 */
export function percentToUnits(value: number | string): number {
  let units: number;
  if (typeof value === "string") {
    const m = /^\s*(\d{1,3})(?:[.,](\d{1,4}))?\s*$/.exec(value);
    if (!m) throw new FinanceLogicError("invalid_percent", "Procenta nemají platný tvar.");
    units = Number(m[1]) * PERCENT_SCALE + Number((m[2] ?? "").padEnd(4, "0"));
  } else {
    if (!Number.isFinite(value)) {
      throw new FinanceLogicError("invalid_percent", "Procenta nemají platný tvar.");
    }
    const scaled = value * PERCENT_SCALE;
    units = Math.round(scaled);
    if (Math.abs(scaled - units) > 1e-6) {
      throw new FinanceLogicError(
        "invalid_percent",
        "Procenta mohou mít nejvýše 4 desetinná místa.",
      );
    }
  }
  return units;
}

/** Procenta z částky zaokrouhlená dolů na haléř; exaktně (BigInt), bez plovoucí čárky. `units` viz `percentToUnits`. */
export function percentOfMinor(amountMinor: number, units: number): number {
  return Number((BigInt(amountMinor) * BigInt(units)) / BigInt(100 * PERCENT_SCALE));
}

/** Formátovací volby pro `formatMoney`. */
export interface FormatMoneyOptions {
  /** Pevné mezery (výchozí `true`) mezi tisíci a před „Kč“, aby se částka nezalamovala. */
  nbsp?: boolean;
  /** Připojit „Kč“ (výchozí `true`). */
  currency?: boolean;
}

/**
 * Česky naformátovaná částka: `1 000 000 Kč`, `166,66 Kč` (haléře jen když nejsou nulové), záporná s „−“.
 * Mezery jsou pevné (U+00A0), pokud `nbsp !== false`.
 */
export function formatMoney(minor: number, options: FormatMoneyOptions = {}): string {
  if (!isMinor(minor)) throw new FinanceLogicError("invalid_amount", "Částka není celé číslo.");
  const space = options.nbsp === false ? " " : " ";
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const whole = Math.trunc(abs / 100);
  const cents = abs % 100;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, space);
  const body = cents === 0 ? grouped : `${grouped},${String(cents).padStart(2, "0")}`;
  const sign = negative ? "−" : "";
  return options.currency === false ? `${sign}${body}` : `${sign}${body}${space}Kč`;
}
