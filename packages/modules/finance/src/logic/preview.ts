/*
  Živý náhled rozdělení (FIN-04): „Z platby 10 000 Kč dostane Ondřej 6 000 Kč, Patrik 4 000 Kč.“ Používá stejné
  `allocate` jako ukládání, takže náhled nikdy neukáže jiné číslo než to, které se uloží.
*/
import { allocate, type AllocationResult } from "./allocate";
import { formatMoney } from "./money";
import type { PersonLabel } from "./format";
import {
  FinanceLogicError,
  type Allocation,
  type PaymentKind,
  type SplitRule,
  type ValidationIssue,
} from "./types";

/** Vstup `previewSplit`. */
export interface PreviewSplitInput {
  /** Ukázková částka platby v haléřích (UI typicky 10 000 Kč = 1 000 000). */
  amountMinor: number;
  /** Druh platby, pro který se náhled počítá (výchozí `one_off`). */
  kind?: PaymentKind;
  /** Kdo fakturuje (dostane haléře a zbytek bez pravidel). */
  issuerId: string;
  /** Měsíc `YYYY-MM`, pro který se pravidla vyhodnotí (u retaineru `periodMonth`). */
  month?: string;
  /** Dnešek `YYYY-MM-DD`, když `month` chybí. */
  today?: string;
  rules: readonly SplitRule[];
  /** Jména osob podle `userId` (chybějící se zobrazí jako „?“). */
  people: Readonly<Record<string, PersonLabel>>;
  /** Kolik z `fixed_total` pravidel už vyčerpaly dřívější platby (volitelné). */
  fixedTotalConsumed?: Readonly<Record<string, number>>;
}

/** Výsledek náhledu: hotová česká věta + podíly + upozornění. */
export interface PreviewSplitResult {
  /** Např. „Z platby 10 000 Kč dostane Ondřej 6 000 Kč, Patrik 4 000 Kč.“ (pevné mezery v částkách). */
  text: string;
  allocations: Allocation[];
  warnings: ValidationIssue[];
  /** Chyba pravidel (např. součet procent > 100 %): text je prázdný, `error` obsahuje českou zprávu. */
  error: string | null;
  result: AllocationResult | null;
}

/**
 * Spočítá živý náhled rozdělení pro ukázkovou částku. Chybná pravidla (součet procent > 100 %, neplatná pole) nevyhodí
 * výjimku, ale vrátí `error` s českou zprávou, aby ji UI mohlo ukázat vedle editoru.
 */
export function previewSplit(input: PreviewSplitInput): PreviewSplitResult {
  const month = input.month;
  try {
    const result = allocate(
      {
        kind: input.kind ?? "one_off",
        amountMinor: input.amountMinor,
        issuerId: input.issuerId,
        ...(month ? { periodMonth: month } : {}),
      },
      input.rules,
      {
        ...(input.today ? { today: input.today } : {}),
        ...(input.fixedTotalConsumed ? { fixedTotalConsumed: input.fixedTotalConsumed } : {}),
      },
    );
    const parts = result.allocations
      .filter((a) => a.amountMinor > 0)
      .map((a) => `${input.people[a.userId]?.name ?? "?"} ${formatMoney(a.amountMinor)}`);
    return {
      text: `Z platby ${formatMoney(input.amountMinor)} dostane ${parts.join(", ")}.`,
      allocations: result.allocations,
      warnings: result.warnings,
      error: null,
      result,
    };
  } catch (e) {
    if (e instanceof FinanceLogicError) {
      return { text: "", allocations: [], warnings: [], error: e.message, result: null };
    }
    throw e;
  }
}
