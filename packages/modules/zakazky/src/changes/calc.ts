/**
 * Čistá logika změn (ZBV): dopad řádků na prodejní a nákladovou cenu a stavy dokladu.
 * Množství jsou desetinné řetězce (3 místa), počítá se v tisícinách jako celá čísla, peníze v haléřích (ADR 003).
 */

export const CHANGE_LINE_KINDS = ["add", "qty", "remove"] as const;
export type ChangeLineKind = (typeof CHANGE_LINE_KINDS)[number];

export const CHANGE_LINE_LABEL: Record<ChangeLineKind, string> = {
  add: "Nová položka",
  qty: "Změna množství",
  remove: "Odebrání",
};

export const CHANGE_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  draft: { label: "Koncept", color: "gray" },
  sent: { label: "Ke schválení", color: "yellow" },
  approved: { label: "Schváleno", color: "green" },
  rejected: { label: "Zamítnuto", color: "red" },
};

/** Desetinný řetězec → tisíciny (celé číslo). Neplatný vstup je 0. */
export function toThousandths(q: string | number): number {
  const n = typeof q === "number" ? q : Number(String(q).trim().replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 1000) : 0;
}

/** Tisíciny → desetinný řetězec s nejvýš třemi místy (`12500` → `"12.5"`). */
export function fromThousandths(t: number): string {
  const sign = t < 0 ? "-" : "";
  const abs = Math.abs(t);
  const whole = Math.floor(abs / 1000);
  const frac = String(abs % 1000)
    .padStart(3, "0")
    .replace(/0+$/, "");
  return `${sign}${whole}${frac ? `.${frac}` : ""}`;
}

/** Cena v haléřích za množství v tisícinách, půl od nuly. */
export function amountMinor(thousandths: number, unitMinor: number): number {
  const raw = (thousandths * unitMinor) / 1000;
  return Math.sign(raw) * Math.round(Math.abs(raw));
}

export type LineQuantities = {
  kind: ChangeLineKind;
  /** Množství položky před změnou (u `add` 0). */
  quantityBefore: string;
  /** Množství po změně (u `remove` 0). */
  quantityAfter: string;
  unitCostMinor: number;
  unitPriceMinor: number;
};

/** Dopad řádku na množství (v tisícinách): nová položka +, změna rozdíl, odebrání −původní. */
export function quantityDelta(l: LineQuantities): number {
  const before = l.kind === "add" ? 0 : toThousandths(l.quantityBefore);
  const after = l.kind === "remove" ? 0 : toThousandths(l.quantityAfter);
  return after - before;
}

/** Dopad řádku na prodejní a nákladovou cenu v haléřích. */
export function lineImpact(l: LineQuantities): {
  priceImpactMinor: number;
  costImpactMinor: number;
} {
  const delta = quantityDelta(l);
  return {
    priceImpactMinor: amountMinor(delta, l.unitPriceMinor),
    costImpactMinor: amountMinor(delta, l.unitCostMinor),
  };
}

/** Součet dopadů řádků = částka změny (prodej) a dopad na náklad. */
export function sumImpacts(
  lines: readonly { priceImpactMinor: number; costImpactMinor: number }[],
) {
  return {
    priceMinor: lines.reduce((a, l) => a + l.priceImpactMinor, 0),
    costMinor: lines.reduce((a, l) => a + l.costImpactMinor, 0),
  };
}

/**
 * Aktualizuje řádek podle aktuální položky rozpočtu (jiná změna mezitím mohla množství posunout): zachová
 * zamýšlený rozdíl a přepočte „před“ a „po“. Výsledné množství nikdy nejde pod nulu.
 */
export function rebaseLine<L extends LineQuantities>(l: L, currentQuantity: string): L {
  if (l.kind === "add") return l;
  const cur = toThousandths(currentQuantity);
  if (l.kind === "remove")
    return { ...l, quantityBefore: fromThousandths(cur), quantityAfter: "0" };
  const delta = toThousandths(l.quantityAfter) - toThousandths(l.quantityBefore);
  return {
    ...l,
    quantityBefore: fromThousandths(cur),
    quantityAfter: fromThousandths(Math.max(0, cur + delta)),
  };
}

/** Předpona dokladu podle znaménka částky: vícepráce `VP`, méněpráce `MP`. */
export const changeLabel = (n: number, amount: number) => `${amount < 0 ? "MP" : "VP"}-${n}`;

/** Text dopadu s označením znaménka (`+11 200 Kč` řeší UI formátováním; tady jen znaménko). */
export const signOf = (amount: number) => (amount > 0 ? "+" : "");
