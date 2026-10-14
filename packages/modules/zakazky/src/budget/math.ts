import { roundMinor } from "@rebar/core/shared";

/**
 * Čistá logika rozpočtu zakázky (bez databáze a bez Reactu, použitelná na serveru i v prohlížeči):
 * částka řádku, součty po oddílech, objektech a verzi, původní vs. aktuální cena, DPH po sazbách, strom oddílů.
 * Všechny částky jsou v haléřích (`*Minor`), množství je desetinný řetězec s nejvýš třemi místy (ADR 003).
 */

/** Druhy položek (stejné klíče jako kategorie nákladů, podle nich se páruje automatický náklad). */
export const ITEM_KINDS = [
  { key: "labour", label: "Práce" },
  { key: "material", label: "Materiál" },
  { key: "subcontract", label: "Subdodávka" },
  { key: "machines", label: "Stroje a doprava" },
  { key: "other", label: "Ostatní" },
] as const;
export type ItemKind = (typeof ITEM_KINDS)[number]["key"];
export const ITEM_KIND_KEYS = ITEM_KINDS.map((k) => k.key) as [ItemKind, ...ItemKind[]];
export const itemKindLabel = (k: string) => ITEM_KINDS.find((x) => x.key === k)?.label ?? k;

/** Největší povolená částka řádku (haléře): 90 miliard Kč, aby součty zůstaly v bezpečném rozsahu čísla. */
export const MAX_AMOUNT_MINOR = 9_000_000_000_000;

/** Množství jako desetinný řetězec („12.500“, „-3“); čárku nahradí tečkou. `null`, když to není číslo s nejvýš 3 místy. */
export function normalizeQuantity(text: string | number): string | null {
  const t = String(text).trim().replace(/\s/g, "").replace(",", ".");
  if (!/^-?\d{1,11}(\.\d{1,3})?$/.test(t)) return null;
  return t;
}

/** Množství v tisícinách (celé číslo) – základ přesného násobení. */
export function thousandths(quantity: string | number): bigint {
  if (typeof quantity === "number") return BigInt(Math.round(quantity * 1000));
  const t = quantity.trim();
  const neg = t.startsWith("-");
  const [int = "0", frac = ""] = t.replace(/^[+-]/, "").split(".");
  const v = BigInt(int || "0") * 1000n + BigInt(frac.padEnd(3, "0").slice(0, 3) || "0");
  return neg ? -v : v;
}

/** Množství z čísla na řetězec pro sloupec `numeric(14,3)` („12.5“ → „12.500“). */
export function quantityString(n: number): string {
  const r = Math.sign(n) * Math.round(Math.abs(n) * 1000);
  const abs = Math.abs(r);
  const s = `${Math.floor(abs / 1000)}.${String(abs % 1000).padStart(3, "0")}`;
  return r < 0 ? `-${s}` : s;
}

/** Cena řádku v haléřích: množství × jednotková cena, zaokrouhleno půl od nuly (stejně jako `lineTotalMinor`). */
export function lineAmount(quantity: string | number, unitMinor: number): number {
  const num = thousandths(quantity) * BigInt(Math.round(unitMinor));
  const neg = num < 0n;
  const abs = neg ? -num : num;
  const q = (abs + 500n) / 1000n;
  return Number(neg ? -q : q);
}

export type MathItem = {
  quantity: string;
  unitCostMinor: number;
  unitPriceMinor: number;
  originalQuantity?: string | null;
  originalUnitCostMinor?: number | null;
  originalUnitPriceMinor?: number | null;
};

export type Amounts = {
  sellMinor: number;
  costMinor: number;
  originalSellMinor: number;
  originalCostMinor: number;
  marginMinor: number;
  /** Marže z prodeje v procentech na jedno desetinné místo; `null`, když není prodej. */
  marginPct: number | null;
};

export const ZERO_AMOUNTS: Amounts = {
  sellMinor: 0,
  costMinor: 0,
  originalSellMinor: 0,
  originalCostMinor: 0,
  marginMinor: 0,
  marginPct: null,
};

export const marginPct = (sellMinor: number, marginMinor: number): number | null =>
  sellMinor > 0 ? Math.round((marginMinor / sellMinor) * 1000) / 10 : null;

/** Původní hodnoty chybějící u položky (verze nebyla zamčená) se berou jako aktuální, takže rozdíl je nulový. */
export function originalOf(i: MathItem) {
  return {
    quantity: i.originalQuantity ?? i.quantity,
    unitCostMinor: i.originalUnitCostMinor ?? i.unitCostMinor,
    unitPriceMinor: i.originalUnitPriceMinor ?? i.unitPriceMinor,
  };
}

/** Má položka uložené původní hodnoty a liší se od aktuálních? */
export function isChanged(i: MathItem): boolean {
  const o = originalOf(i);
  return (
    thousandths(o.quantity) !== thousandths(i.quantity) ||
    o.unitCostMinor !== i.unitCostMinor ||
    o.unitPriceMinor !== i.unitPriceMinor
  );
}

export function finalizeAmounts(
  a: Pick<Amounts, "sellMinor" | "costMinor" | "originalSellMinor" | "originalCostMinor">,
): Amounts {
  const marginMinor = a.sellMinor - a.costMinor;
  return { ...a, marginMinor, marginPct: marginPct(a.sellMinor, marginMinor) };
}

export function itemAmounts(i: MathItem): Amounts {
  const o = originalOf(i);
  return finalizeAmounts({
    sellMinor: lineAmount(i.quantity, i.unitPriceMinor),
    costMinor: lineAmount(i.quantity, i.unitCostMinor),
    originalSellMinor: lineAmount(o.quantity, o.unitPriceMinor),
    originalCostMinor: lineAmount(o.quantity, o.unitCostMinor),
  });
}

export function sumAmounts(list: readonly Amounts[]): Amounts {
  let sell = 0;
  let cost = 0;
  let oSell = 0;
  let oCost = 0;
  for (const a of list) {
    sell += a.sellMinor;
    cost += a.costMinor;
    oSell += a.originalSellMinor;
    oCost += a.originalCostMinor;
  }
  return finalizeAmounts({
    sellMinor: sell,
    costMinor: cost,
    originalSellMinor: oSell,
    originalCostMinor: oCost,
  });
}

/* ---------- DPH po sazbách ---------- */

export type VatGroup = {
  vatRateBp: number;
  netMinor: number;
  vatMinor: number;
  grossMinor: number;
};
export type VatBreakdown = {
  groups: VatGroup[];
  netMinor: number;
  vatMinor: number;
  grossMinor: number;
};

/**
 * Rozpočet bez DPH i s DPH po sazbách: základ se sčítá po sazbách, DPH se počítá ze základu sazby (ne po řádcích).
 * Přenesená daňová povinnost (`reverse_charge`) nese DPH nula, odvede ho zákazník.
 */
export function vatBreakdown(
  items: readonly { quantity: string; unitPriceMinor: number; vatRateBp: number }[],
  vatMode: "standard" | "reverse_charge" = "standard",
): VatBreakdown {
  const byRate = new Map<number, number>();
  for (const i of items)
    byRate.set(
      i.vatRateBp,
      (byRate.get(i.vatRateBp) ?? 0) + lineAmount(i.quantity, i.unitPriceMinor),
    );
  const groups = [...byRate.entries()]
    .sort(([a], [b]) => b - a)
    .map(([vatRateBp, netMinor]) => {
      const vatMinor =
        vatMode === "reverse_charge" ? 0 : roundMinor((netMinor * vatRateBp) / 10_000);
      return { vatRateBp, netMinor, vatMinor, grossMinor: netMinor + vatMinor };
    });
  return {
    groups,
    netMinor: groups.reduce((a, g) => a + g.netMinor, 0),
    vatMinor: groups.reduce((a, g) => a + g.vatMinor, 0),
    grossMinor: groups.reduce((a, g) => a + g.grossMinor, 0),
  };
}

/* ---------- strom ---------- */

export type ObjectLike = { id: string; position: number };
export type SectionLike = {
  id: string;
  objectId: string;
  parentId: string | null;
  position: number;
};
export type ItemLike = MathItem & { id: string; sectionId: string; position: number };

export type ItemNode<I> = I & { amounts: Amounts; changed: boolean };
export type SectionNode<S, I> = S & {
  items: ItemNode<I>[];
  children: SectionNode<S, I>[];
  /** Součty včetně pododdílů. */
  totals: Amounts;
  /** Součty jen vlastních položek oddílu. */
  own: Amounts;
  itemCount: number;
};
export type ObjectNode<O, S, I> = O & { sections: SectionNode<S, I>[]; totals: Amounts };

const byPosition = <T extends { position: number; id: string }>(a: T, b: T) =>
  a.position - b.position || a.id.localeCompare(b.id);

/**
 * Složí strom objekt → oddíl (víc úrovní) → položka a dopočítá součty na každé úrovni.
 * Oddíl s neplatným nadřazeným oddílem (jiný objekt, neexistuje, cyklus) se bere jako kořenový.
 */
export function buildTree<O extends ObjectLike, S extends SectionLike, I extends ItemLike>(
  objects: readonly O[],
  sections: readonly S[],
  items: readonly I[],
): ObjectNode<O, S, I>[] {
  const nodes = new Map<string, SectionNode<S, I>>();
  for (const s of sections)
    nodes.set(s.id, {
      ...s,
      items: [],
      children: [],
      totals: ZERO_AMOUNTS,
      own: ZERO_AMOUNTS,
      itemCount: 0,
    });
  for (const i of [...items].sort(byPosition)) {
    const n = nodes.get(i.sectionId);
    if (n) n.items.push({ ...i, amounts: itemAmounts(i), changed: isChanged(i) });
  }
  const roots = new Map<string, SectionNode<S, I>[]>();
  const cyclic = (n: SectionNode<S, I>) => {
    const seen = new Set<string>([n.id]);
    for (let p = n.parentId; p; p = nodes.get(p)?.parentId ?? null) {
      if (seen.has(p)) return true;
      seen.add(p);
    }
    return false;
  };
  for (const n of [...nodes.values()].sort(byPosition)) {
    const parent = n.parentId ? nodes.get(n.parentId) : undefined;
    if (parent && parent.objectId === n.objectId && !cyclic(n)) parent.children.push(n);
    else (roots.get(n.objectId) ?? roots.set(n.objectId, []).get(n.objectId)!).push(n);
  }
  const fill = (n: SectionNode<S, I>): void => {
    for (const c of n.children) fill(c);
    n.own = sumAmounts(n.items.map((i) => i.amounts));
    n.totals = sumAmounts([n.own, ...n.children.map((c) => c.totals)]);
    n.itemCount = n.items.length + n.children.reduce((a, c) => a + c.itemCount, 0);
  };
  return [...objects].sort(byPosition).map((o) => {
    const secs = roots.get(o.id) ?? [];
    for (const s of secs) fill(s);
    return { ...o, sections: secs, totals: sumAmounts(secs.map((s) => s.totals)) };
  });
}

/** Součty verze a vlastní součty po oddílech (ve tvaru, který čtou ostatní oblasti). */
export function versionTotals(
  sections: readonly { id: string }[],
  items: readonly (MathItem & { sectionId: string })[],
) {
  const bySection: Record<
    string,
    { sellMinor: number; costMinor: number; originalSellMinor: number; originalCostMinor: number }
  > = {};
  for (const s of sections)
    bySection[s.id] = { sellMinor: 0, costMinor: 0, originalSellMinor: 0, originalCostMinor: 0 };
  const all: Amounts[] = [];
  for (const i of items) {
    const a = itemAmounts(i);
    all.push(a);
    const b = (bySection[i.sectionId] ??= {
      sellMinor: 0,
      costMinor: 0,
      originalSellMinor: 0,
      originalCostMinor: 0,
    });
    b.sellMinor += a.sellMinor;
    b.costMinor += a.costMinor;
    b.originalSellMinor += a.originalSellMinor;
    b.originalCostMinor += a.originalCostMinor;
  }
  const t = sumAmounts(all);
  return {
    sellMinor: t.sellMinor,
    costMinor: t.costMinor,
    originalSellMinor: t.originalSellMinor,
    originalCostMinor: t.originalCostMinor,
    bySection,
  };
}

/* ---------- zamčení ---------- */

export const VERSION_STATUSES = ["draft", "sent", "locked"] as const;
export type VersionStatus = (typeof VERSION_STATUSES)[number];
export const VERSION_KINDS = ["offer", "realization"] as const;
export type VersionKind = (typeof VERSION_KINDS)[number];

/** Proč se verze nedá měnit (česká věta), nebo `null`, když se měnit smí. */
export function lockReason(v: { kind: string; status: string }): string | null {
  if (v.status !== "locked") return null;
  return v.kind === "offer"
    ? "Nabídka je zamčená, protože zakázka byla vyhrána. Rozpočet upravujte v realizaci, nabídka zůstává jako původní dohoda."
    : "Rozpočet realizace je zamčený. Změnu rozsahu zapište jako změnu (ZBV) nebo rozpočet nejdřív odemkněte.";
}

export const VERSION_STATUS_LABEL: Record<string, string> = {
  draft: "Rozpracováno",
  sent: "Odesláno zákazníkovi",
  locked: "Zamčeno",
};
export const VERSION_KIND_LABEL: Record<string, string> = {
  offer: "Nabídka",
  realization: "Realizace",
};
