import { roundMinor } from "@rebar/core/shared";

/**
 * Součty dokladu: základ se sčítá po sazbách, DPH se počítá ze základu sazby (ne po řádcích), jak to chce zákon o DPH.
 * Čistá logika bez databáze (sdílí ji server i UI): přenesená daňová povinnost, zádržné, role řádků.
 */

/** Režim DPH dokladu: běžný, nebo přenesená daňová povinnost (doklad bez DPH, daň odvede zákazník). */
export type VatMode = "standard" | "reverse_charge";

/** Povinný text na dokladu v režimu přenesené daňové povinnosti. */
export const REVERSE_CHARGE_TEXT = "Daň odvede zákazník (§ 92a zákona č. 235/2004 Sb., o DPH)";

/**
 * Role řádku: `work` (plnění), `previous` (odpočet už fakturovaných prací), `advance` (odpočet zaplacené zálohy),
 * `retention` (strženo zádržné, záporný základ), `release` (uvolněné zádržné).
 */
export type LineRole = "work" | "previous" | "advance" | "retention" | "release";

export type LineInput = {
  quantity: string | number;
  unitPriceMinor: number;
  vatRateBp: number;
  role?: LineRole;
};
export type LineTotals = { netMinor: number; vatMinor: number; grossMinor: number };
export type VatGroup = {
  vatRateBp: number;
  netMinor: number;
  vatMinor: number;
  grossMinor: number;
};

/** Základ řádku: množství (3 desetinná místa) × cena za jednotku, zaokrouhleno na haléře půl od nuly. */
export function lineNetMinor(quantity: string | number, unitPriceMinor: number): number {
  return roundMinor((Math.round(Number(quantity) * 1000) * unitPriceMinor) / 1000);
}

export function vatOf(netMinor: number, rateBp: number): number {
  return roundMinor((netMinor * rateBp) / 10_000);
}

/** Sazba řádku v daném režimu: při přenesené daňové povinnosti vždy 0. */
export function effectiveRateBp(rateBp: number, mode: VatMode = "standard"): number {
  return mode === "reverse_charge" ? 0 : rateBp;
}

/** Součty řádku pro zobrazení (DPH řádku je orientační; závazné jsou součty po sazbách). */
export function lineTotals(l: LineInput, mode: VatMode = "standard"): LineTotals {
  const net = lineNetMinor(l.quantity, l.unitPriceMinor);
  const vat = vatOf(net, effectiveRateBp(l.vatRateBp, mode));
  return { netMinor: net, vatMinor: vat, grossMinor: net + vat };
}

export function documentTotals(
  lines: readonly LineInput[],
  opts: { vatMode?: VatMode } = {},
): {
  groups: VatGroup[];
  netMinor: number;
  vatMinor: number;
  grossMinor: number;
} {
  const mode = opts.vatMode ?? "standard";
  const byRate = new Map<number, number>();
  for (const l of lines) {
    const rate = effectiveRateBp(l.vatRateBp, mode);
    byRate.set(rate, (byRate.get(rate) ?? 0) + lineNetMinor(l.quantity, l.unitPriceMinor));
  }
  const groups = [...byRate.entries()]
    .sort(([a], [b]) => b - a)
    .map(([vatRateBp, netMinor]) => {
      const vatMinor = vatOf(netMinor, vatRateBp);
      return { vatRateBp, netMinor, vatMinor, grossMinor: netMinor + vatMinor };
    });
  return {
    groups,
    netMinor: groups.reduce((a, g) => a + g.netMinor, 0),
    vatMinor: groups.reduce((a, g) => a + g.vatMinor, 0),
    grossMinor: groups.reduce((a, g) => a + g.grossMinor, 0),
  };
}

/** Stav úhrady z celkové částky a součtu plateb (kladná faktura; dobropis se neplatí). */
export function paymentState(grossMinor: number, paidMinor: number): "issued" | "partial" | "paid" {
  if (grossMinor > 0 && paidMinor >= grossMinor) return "paid";
  return paidMinor > 0 ? "partial" : "issued";
}

/* ---------- zádržné ---------- */

/** Řádky, ze kterých se zádržné počítá: plnění a odpočet už fakturovaných prací (ne zálohy, ne samo zádržné). */
const retentionBaseRole = (r: LineRole | undefined) =>
  r === undefined || r === "work" || r === "previous";

/** Základ zádržného po sazbách DPH (u PDP jediná skupina se sazbou 0). Záporné základy se nezapočítají. */
export function retentionBaseGroups(
  lines: readonly LineInput[],
  mode: VatMode = "standard",
): { vatRateBp: number; netMinor: number }[] {
  const byRate = new Map<number, number>();
  for (const l of lines) {
    if (!retentionBaseRole(l.role)) continue;
    const rate = effectiveRateBp(l.vatRateBp, mode);
    byRate.set(rate, (byRate.get(rate) ?? 0) + lineNetMinor(l.quantity, l.unitPriceMinor));
  }
  return [...byRate.entries()]
    .sort(([a], [b]) => b - a)
    .map(([vatRateBp, netMinor]) => ({ vatRateBp, netMinor }));
}

/**
 * Zádržné z dokladu: pro každou sazbu DPH samostatně `základ × retentionBp / 10 000` (setiny procenta), zaokrouhleno
 * na haléře. Vrací kladné částky `retainMinor` (kolik se zadrží) a `basisMinor`. Skupiny bez kladného základu se vynechají.
 */
export function retentionGroups(
  lines: readonly LineInput[],
  retentionBp: number,
  mode: VatMode = "standard",
): { vatRateBp: number; basisMinor: number; retainMinor: number }[] {
  if (retentionBp <= 0) return [];
  return retentionBaseGroups(lines, mode)
    .filter((g) => g.netMinor > 0)
    .map((g) => ({
      vatRateBp: g.vatRateBp,
      basisMinor: g.netMinor,
      retainMinor: roundMinor((g.netMinor * retentionBp) / 10_000),
    }))
    .filter((g) => g.retainMinor > 0);
}

export function retentionTotal(
  lines: readonly LineInput[],
  retentionBp: number,
  mode: VatMode = "standard",
): number {
  return retentionGroups(lines, retentionBp, mode).reduce((a, g) => a + g.retainMinor, 0);
}

/** Součet základů řádků dané role (v haléřích). */
export function netByRole(lines: readonly LineInput[]): Record<LineRole, number> {
  const out: Record<LineRole, number> = {
    work: 0,
    previous: 0,
    advance: 0,
    retention: 0,
    release: 0,
  };
  for (const l of lines) out[l.role ?? "work"] += lineNetMinor(l.quantity, l.unitPriceMinor);
  return out;
}

/** Procento ze setin procenta pro zobrazení: 500 → „5“, 250 → „2,5“. */
export const retentionPct = (bp: number) => (bp / 100).toLocaleString("cs-CZ");

/**
 * Rozdělí základ na sazby DPH podle vah (poměr základů ve skupinách). Zbytek po zaokrouhlení jde do největší
 * skupiny, takže součet vždy sedí. Bez vah jedna skupina s výchozí sazbou.
 */
export function allocateByRate(
  totalMinor: number,
  weights: readonly { vatRateBp: number; weight: number }[],
  fallbackRateBp: number,
): { vatRateBp: number; netMinor: number }[] {
  const usable = weights.filter((w) => w.weight > 0);
  const sum = usable.reduce((a, w) => a + w.weight, 0);
  if (!usable.length || sum <= 0) return [{ vatRateBp: fallbackRateBp, netMinor: totalMinor }];
  const parts = usable.map((w) => ({
    vatRateBp: w.vatRateBp,
    weight: w.weight,
    netMinor: roundMinor((totalMinor * w.weight) / sum),
  }));
  const rest = totalMinor - parts.reduce((a, p) => a + p.netMinor, 0);
  if (rest !== 0) {
    const biggest = parts.reduce((a, p) => (p.weight > a.weight ? p : a));
    biggest.netMinor += rest;
  }
  return parts.map(({ vatRateBp, netMinor }) => ({ vatRateBp, netMinor }));
}
