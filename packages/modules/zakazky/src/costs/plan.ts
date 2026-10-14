/**
 * Plán vs skutečnost po oddílech rozpočtu (čistá logika, bez databáze). Vše v haléřích bez DPH.
 * Strom: objekt → oddíl (víc úrovní). Skutečný náklad a závazky z objednávek se na oddíl přiřazují přímo
 * (jen na vlastní oddíl) a součty se sčítají nahoru přes pododdíly, objekt i celou zakázku.
 */

export type OwnAmounts = {
  sellMinor: number;
  costMinor: number;
  originalSellMinor: number;
  originalCostMinor: number;
};
export const ZERO_OWN: OwnAmounts = {
  sellMinor: 0,
  costMinor: 0,
  originalSellMinor: 0,
  originalCostMinor: 0,
};

export type PlanObjectIn = {
  id: string;
  code: string | null;
  title: string;
  isDefault: boolean;
  position: number;
};
export type PlanSectionIn = {
  id: string;
  objectId: string;
  parentId: string | null;
  code: string | null;
  title: string;
  position: number;
};

export type PlanInput = {
  objects: readonly PlanObjectIn[];
  sections: readonly PlanSectionIn[];
  /** Plánované částky jen z vlastních položek oddílu (`bySection` z rozpočtu). */
  own: Readonly<Record<string, OwnAmounts>>;
  /** Skutečné náklady spárované na oddíl (součet částí, vratky záporně). */
  actualBySection: Readonly<Record<string, number>>;
  /** Otevřené závazky z objednávek (objednáno a ještě nepokryto náklady) podle oddílu objednávky. */
  orderedBySection: Readonly<Record<string, number>>;
  /** Nespárované náklady (nepřiřazené oddílu) a závazky objednávek bez oddílu. */
  unpairedActualMinor: number;
  unassignedOrderedMinor: number;
};

export type Metrics = {
  plannedSellMinor: number;
  plannedCostMinor: number;
  originalSellMinor: number;
  originalCostMinor: number;
  actualMinor: number;
  orderedMinor: number;
  /** Plánovaný náklad − skutečný (záporné = překročeno). */
  varianceMinor: number;
  /** Čerpání plánovaného nákladu v % na jedno desetinné místo; `null`, když oddíl nemá plán. */
  drawdownPct: number | null;
  /** Marže při plánovaném prodeji: plán. prodej − plán. náklad, resp. − skutečný náklad. */
  plannedMarginMinor: number;
  plannedMarginPct: number | null;
  actualMarginMinor: number;
  actualMarginPct: number | null;
  /** Změna plánovaného nákladu a prodeje proti původní nabídce. */
  costChangeMinor: number;
  sellChangeMinor: number;
};

export type PlanSectionNode = PlanSectionIn & { metrics: Metrics; children: PlanSectionNode[] };
export type PlanObjectNode = PlanObjectIn & { metrics: Metrics; sections: PlanSectionNode[] };
export type PlanResult = {
  objects: PlanObjectNode[];
  totals: Metrics;
  unpairedActualMinor: number;
  unassignedOrderedMinor: number;
};

const pct = (num: number, den: number): number | null =>
  den > 0 ? Math.round((num / den) * 1000) / 10 : null;

type Acc = {
  sell: number;
  cost: number;
  oSell: number;
  oCost: number;
  actual: number;
  ordered: number;
};
const zero = (): Acc => ({ sell: 0, cost: 0, oSell: 0, oCost: 0, actual: 0, ordered: 0 });
const add = (a: Acc, b: Acc): Acc => ({
  sell: a.sell + b.sell,
  cost: a.cost + b.cost,
  oSell: a.oSell + b.oSell,
  oCost: a.oCost + b.oCost,
  actual: a.actual + b.actual,
  ordered: a.ordered + b.ordered,
});

export function metricsOf(a: Acc): Metrics {
  return {
    plannedSellMinor: a.sell,
    plannedCostMinor: a.cost,
    originalSellMinor: a.oSell,
    originalCostMinor: a.oCost,
    actualMinor: a.actual,
    orderedMinor: a.ordered,
    varianceMinor: a.cost - a.actual,
    drawdownPct: pct(a.actual, a.cost),
    plannedMarginMinor: a.sell - a.cost,
    plannedMarginPct: pct(a.sell - a.cost, a.sell),
    actualMarginMinor: a.sell - a.actual,
    actualMarginPct: pct(a.sell - a.actual, a.sell),
    costChangeMinor: a.cost - a.oCost,
    sellChangeMinor: a.sell - a.oSell,
  };
}

const byPos = <T extends { position: number; id: string }>(a: T, b: T) =>
  a.position - b.position || a.id.localeCompare(b.id);

/** Stav čerpání pro barvu: `over` (nad 100 %), `warn` (nad 85 %), `ok`, `none` (bez plánu). */
export function drawdownTone(m: Pick<Metrics, "drawdownPct" | "plannedCostMinor" | "actualMinor">) {
  if (m.plannedCostMinor <= 0) return m.actualMinor > 0 ? "over" : "none";
  const p = m.drawdownPct ?? 0;
  return p > 100 ? "over" : p > 85 ? "warn" : "ok";
}

export function buildPlan(input: PlanInput): PlanResult {
  const own = (id: string): Acc => {
    const o = input.own[id] ?? ZERO_OWN;
    return {
      sell: o.sellMinor,
      cost: o.costMinor,
      oSell: o.originalSellMinor,
      oCost: o.originalCostMinor,
      actual: input.actualBySection[id] ?? 0,
      ordered: input.orderedBySection[id] ?? 0,
    };
  };
  const nodes = new Map<string, PlanSectionNode & { acc: Acc }>();
  for (const s of input.sections)
    nodes.set(s.id, { ...s, metrics: metricsOf(zero()), children: [], acc: own(s.id) });

  const roots = new Map<string, (PlanSectionNode & { acc: Acc })[]>();
  const cyclic = (n: PlanSectionIn) => {
    const seen = new Set<string>([n.id]);
    for (let p = n.parentId; p; p = nodes.get(p)?.parentId ?? null) {
      if (seen.has(p)) return true;
      seen.add(p);
    }
    return false;
  };
  for (const n of [...nodes.values()].sort(byPos)) {
    const parent = n.parentId ? nodes.get(n.parentId) : undefined;
    if (parent && parent.objectId === n.objectId && !cyclic(n)) parent.children.push(n);
    else (roots.get(n.objectId) ?? roots.set(n.objectId, []).get(n.objectId)!).push(n);
  }
  const fill = (n: PlanSectionNode & { acc: Acc }): Acc => {
    let acc = n.acc;
    for (const c of n.children) acc = add(acc, fill(c as PlanSectionNode & { acc: Acc }));
    n.acc = acc;
    n.metrics = metricsOf(acc);
    return acc;
  };

  let grand = zero();
  const objects = [...input.objects].sort(byPos).map((o): PlanObjectNode => {
    const secs = roots.get(o.id) ?? [];
    let acc = zero();
    for (const s of secs) acc = add(acc, fill(s));
    grand = add(grand, acc);
    return { ...o, metrics: metricsOf(acc), sections: secs.map(strip) };
  });
  // Skutečnost mimo oddíly (nespárované) patří do celku zakázky, ne do žádného oddílu
  grand = {
    ...grand,
    actual: grand.actual + input.unpairedActualMinor,
    ordered: grand.ordered + input.unassignedOrderedMinor,
  };
  return {
    objects,
    totals: metricsOf(grand),
    unpairedActualMinor: input.unpairedActualMinor,
    unassignedOrderedMinor: input.unassignedOrderedMinor,
  };
}

function strip(n: PlanSectionNode & { acc?: Acc }): PlanSectionNode {
  const { acc: _acc, ...rest } = n;
  return { ...rest, children: n.children.map((c) => strip(c as PlanSectionNode & { acc?: Acc })) };
}

/**
 * Otevřený závazek objednávky: objednaná částka minus náklady, které se k objednávce už vážou (faktura, ruční náklad).
 * Nikdy záporný. Zrušená a nezaslaná objednávka závazek nenese (rozhoduje volající stavem).
 */
export function openCommitmentMinor(orderTotalMinor: number, linkedCostMinor: number): number {
  return Math.max(0, orderTotalMinor - linkedCostMinor);
}
