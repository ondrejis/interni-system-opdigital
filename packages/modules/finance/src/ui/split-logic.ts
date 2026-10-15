import type { SplitRuleInput } from "@rebar/core/contracts";
import {
  FinanceLogicError,
  type AppliesTo,
  previewSplit,
  validateSplitRules,
  type PaymentKind,
  type PreviewSplitResult,
  type SplitRule,
  type ValidationIssue,
} from "../logic";

/*
  Čistá logika editoru rozdělení (bez Reactu): převod formuláře na pravidla logiky, validace a živý náhled.
  Používá stejné `allocate` jako ukládání, takže náhled neukáže jiné číslo než to, které se uloží.
*/

/** Pravidlo editoru → pravidlo čisté logiky (stabilní `id` podle pořadí kvůli odečtu `fixed_total`). */
export function toLogicRules(rules: readonly SplitRuleInput[]): SplitRule[] {
  return rules.map((r, i) => ({
    id: `r${i}`,
    userId: r.userId,
    mode: r.mode,
    percent: r.percent ?? null,
    fixedMinor: r.fixedMinor ?? null,
    // `recurring` (Fakturoid) pravidla nemá; editor ho nenabízí
    appliesTo: r.appliesTo as AppliesTo,
    validFromMonth: r.validFrom ?? null,
    validToMonth: r.validTo ?? null,
    position: i,
  }));
}

/** Nálezy validace pravidel; chyba pole se vrátí jako nález, ne jako výjimka. */
export function ruleIssues(rules: readonly SplitRuleInput[]): ValidationIssue[] {
  if (rules.length === 0) return [];
  try {
    return validateSplitRules(toLogicRules(rules));
  } catch (e) {
    if (e instanceof FinanceLogicError) return [...e.issues];
    throw e;
  }
}

/** Obsahují nálezy chybu, která blokuje uložení? */
export const blocking = (issues: readonly ValidationIssue[]): boolean =>
  issues.some((i) => i.severity === "error");

/** Výchozí pravidla 50/50 mezi dvěma lidmi. */
export function fiftyFifty(a: string, b: string): SplitRuleInput[] {
  return [
    { userId: a, mode: "percent", percent: 50, appliesTo: "all" },
    { userId: b, mode: "percent", percent: 50, appliesTo: "all" },
  ];
}

/** Prázdné nové pravidlo pro osobu. */
export function blankRule(userId: string): SplitRuleInput {
  return { userId, mode: "percent", percent: 0, appliesTo: "all" };
}

/** Druh platby, pro který má smysl náhled: první druh, na který cílí pravidla, jinak jednorázová. */
export function defaultPreviewKind(rules: readonly SplitRuleInput[]): PaymentKind {
  const specific = rules.find((r) => r.appliesTo !== "all");
  const all = rules.some((r) => r.appliesTo === "all");
  return !all && specific && specific.appliesTo !== "all" ? specific.appliesTo : "one_off";
}

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Živý náhled rozdělení ukázkové částky (česká věta, nebo chyba pravidel). */
export function previewText(input: {
  rules: readonly SplitRuleInput[];
  amountMinor: number;
  kind: PaymentKind;
  issuerId: string;
  month?: string | undefined;
  today?: string;
  names: Readonly<Record<string, string>>;
}): PreviewSplitResult {
  const people = Object.fromEntries(Object.entries(input.names).map(([k, v]) => [k, { name: v }]));
  return previewSplit({
    amountMinor: input.amountMinor,
    kind: input.kind,
    issuerId: input.issuerId,
    ...(input.month ? { month: input.month } : {}),
    today: input.today ?? localToday(),
    rules: toLogicRules(input.rules),
    people,
  });
}
