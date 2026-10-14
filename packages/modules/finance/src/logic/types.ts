/*
  Společné typy čisté logiky financí. Žádné importy ze schématu ani z DB — FIN-B mapuje řádky z databáze na tyto typy.
  Peníze: celá čísla v minor units (haléře), měna CZK. Data: řetězce ISO `YYYY-MM-DD`, měsíce `YYYY-MM` (žádné `Date`,
  žádná časová pásma → výpočty jsou deterministické).
*/

/** Druh platby (shodný s `payment.kind`; `recurring` = faktura z Fakturoidu bez zakázky, vždy soukromá a mimo saldo). */
export type PaymentKind = "one_off" | "intro" | "retainer" | "extra" | "recurring";

/** Druhy plateb, na které se dá cílit pravidlem rozdělení (`recurring` pravidla nemá). */
export type RuleKind = Exclude<PaymentKind, "recurring">;

/** Na které platby pravidlo platí: na všechny, nebo jen na konkrétní druh. */
export type AppliesTo = "all" | RuleKind;

/** Způsob pravidla: procenta ze zbytku, fixní částka z každé platby, fixní částka za celou zakázku. */
export type SplitMode = "percent" | "fixed_per_payment" | "fixed_total";

/** Stav platby (shodný s `payment.status`). */
export type PaymentStatus = "planned" | "issued" | "paid" | "canceled";

/** Režim rozdělení platby: z pravidel zakázky, nebo ručně přepsané. */
export type AllocationMode = "rules" | "manual";

/** Pravidlo rozdělení na zakázce (FIN-02, FIN-03). */
export interface SplitRule {
  /** Identifikátor pravidla; potřebný u `fixed_total` pro průběžný odečet (bez něj se použije pořadí ve vstupu). */
  id?: string;
  userId: string;
  mode: SplitMode;
  /** Procenta (0 < p ≤ 100, max. 4 desetinná místa); číslo, nebo řetězec z numeric sloupce („60.00“). Jen `mode = percent`. */
  percent?: number | string | null;
  /** Fixní částka v haléřích; jen `fixed_per_payment` a `fixed_total`. */
  fixedMinor?: number | null;
  appliesTo: AppliesTo;
  /** Platí od měsíce včetně (`YYYY-MM`), prázdné = od počátku. */
  validFromMonth?: string | null;
  /** Platí do měsíce včetně (`YYYY-MM`), prázdné = bez konce. */
  validToMonth?: string | null;
  /** Pořadí pravidla (menší dřív); určuje pořadí odečtu fixních částek a pořadí řádků ve výsledku. */
  position?: number | null;
}

/** Podíl jednoho člověka na platbě. */
export interface Allocation {
  userId: string;
  amountMinor: number;
}

/** Platba tak, jak ji potřebuje rozdělení. */
export interface PaymentForAllocation {
  id?: string;
  kind: PaymentKind;
  amountMinor: number;
  /** Kdo fakturuje (dostane peníze, haléře po zaokrouhlení a vše, co nepokryjí pravidla). */
  issuerId: string;
  status?: PaymentStatus;
  /** Měsíc, za který platba je (`YYYY-MM`); u retaineru určuje platnost pravidel. */
  periodMonth?: string | null;
  /** Datum vystavení (`YYYY-MM-DD`). */
  issuedOn?: string | null;
  /** Čas vytvoření (ISO řetězec) — pomocný klíč řazení pro `fixed_total`. */
  createdAt?: string | null;
  allocationMode?: AllocationMode;
  /** Uložené ruční alokace (jen `allocationMode = manual`). */
  manualAllocations?: readonly Allocation[] | null;
}

/** Kód chyby/varování logiky financí. */
export type FinanceIssueCode =
  | "invalid_amount"
  | "invalid_user"
  | "invalid_month"
  | "invalid_date"
  | "invalid_percent"
  | "invalid_fixed"
  | "invalid_validity"
  | "percent_over_100"
  | "percent_under_100"
  | "fixed_capped"
  | "fixed_total_exhausted"
  | "allocation_sum_mismatch"
  | "allocation_duplicate_user"
  | "invalid_retainer"
  | "invalid_settlement";

/** Nález validace: chyba (blokuje uložení), nebo varování (jen upozornění). */
export interface ValidationIssue {
  severity: "error" | "warning";
  code: FinanceIssueCode;
  /** Česká zpráva pro uživatele. */
  message: string;
  /** Druh platby, kterého se nález týká (u součtu procent). */
  kind?: RuleKind;
  /** Od kterého měsíce nález platí (u součtu procent; `YYYY-MM`, prázdné = od počátku). */
  fromMonth?: string;
  /** Skutečný součet procent. */
  percentSum?: number;
}

/** Chyba doménové logiky financí (neplatný vstup, který nemá smysl počítat). */
export class FinanceLogicError extends Error {
  readonly code: FinanceIssueCode;
  readonly issues: readonly ValidationIssue[];

  constructor(code: FinanceIssueCode, message: string, issues?: readonly ValidationIssue[]) {
    super(message);
    this.name = "FinanceLogicError";
    this.code = code;
    this.issues = issues ?? [{ severity: "error", code, message }];
  }
}

/** Vyhodí `FinanceLogicError`, pokud podmínka neplatí. */
export function assertFinance(
  condition: unknown,
  code: FinanceIssueCode,
  message: string,
): asserts condition {
  if (!condition) throw new FinanceLogicError(code, message);
}
