/** Kategorie nákladů zakázky. Moduly (sklad, stroje, docházka) dodávají náklady pod těmito klíči. */
export const COST_CATEGORIES = [
  { key: "labour", label: "Práce", hint: "z docházky × hodinový náklad zaměstnance" },
  { key: "material", label: "Materiál", hint: "výdejky ze skladu minus vratky, ruční nákupy" },
  { key: "machines", label: "Stroje a doprava", hint: "provoz strojů a vozidel, palivo" },
  { key: "subcontract", label: "Subdodávky", hint: "řemeslníci a firmy na fakturu" },
  { key: "other", label: "Ostatní", hint: "kontejnery, poplatky, ubytování…" },
] as const;
export type CostCategory = (typeof COST_CATEGORIES)[number]["key"];
export const COST_CATEGORY_KEYS = COST_CATEGORIES.map((c) => c.key) as [
  CostCategory,
  ...CostCategory[],
];
/** Cena řádku v haléřích: množství (desetinný řetězec, 3 místa) × jednotková cena, zaokrouhleno půl od nuly. */
export function lineTotalMinor(quantity: string | number, unitMinor: number): number {
  const thousandths = Math.round(Number(quantity) * 1000);
  const raw = (thousandths * unitMinor) / 1000;
  return Math.sign(raw) * Math.round(Math.abs(raw));
}

export const CHANGE_STATUSES = ["draft", "sent", "approved", "rejected"] as const;
export type ChangeStatus = (typeof CHANGE_STATUSES)[number];

export const changeLabel = (n: number, amountMinor: number) =>
  `${amountMinor < 0 ? "MP" : "VP"}-${n}`;
