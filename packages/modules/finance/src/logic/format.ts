/*
  České věty pro UI nad čistou logikou: jména ve 3. pádě a hlavní číslo salda („Patrik dluží Ondřejovi 12 400 Kč“).
*/
import type { BalanceResult } from "./balance";
import { formatMoney } from "./money";

/** Zobrazované jméno osoby; `dative` (3. pád) se použije ve větě „X dluží Y“ (bez něj se odvodí). */
export interface PersonLabel {
  name: string;
  dative?: string;
}

/** Odvodí 3. pád mužského jména (Ondřej → Ondřejovi); jména nekončící na souhlásku nechá beze změny. */
export function dativeOf(label: PersonLabel): string {
  if (label.dative) return label.dative;
  const n = label.name;
  return /[bcčdďfghjklmnňpqrřsštťvwxzž]$/i.test(n) ? `${n}ovi` : n;
}

/** Hlavní číslo salda česky: „Patrik dluží Ondřejovi 12 400 Kč“, nebo „Vyrovnáno“ (FIN-14). */
export function describeBalance(
  result: Pick<BalanceResult, "headline">,
  people: Readonly<Record<string, PersonLabel>>,
  options: { nbsp?: boolean } = {},
): string {
  const h = result.headline;
  if (!h) return "Vyrovnáno";
  const debtor = people[h.debtorId] ?? { name: "?" };
  const creditor = people[h.creditorId] ?? { name: "?" };
  return `${debtor.name} dluží ${dativeOf(creditor)} ${formatMoney(h.amountMinor, options)}`;
}
