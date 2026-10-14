import { describe, expect, it } from "vitest";
import {
  buildTree,
  itemAmounts,
  lineAmount,
  sumAmounts,
  vatBreakdown,
  versionTotals,
  type ItemLike,
  type ObjectLike,
  type SectionLike,
} from "./math";
import { buildPlan } from "../costs/plan";
import { allocationState, validateParts } from "../costs/model";

/** Náhodné (s pevným seedem) kontroly invariantů rozpočtu: součty stromu = součty verze, DPH po sazbách, plán × skutečnost. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const make = (seed: number) => {
  const r = rng(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const pick = <T>(xs: readonly T[]): T => xs[int(0, xs.length - 1)]!;
  return { r, int, pick };
};
const QTYS = ["1", "0", "0.001", "0.5", "2.5", "12.345", "100", "1000.125", "-2", "-0.5", "33.333"];
const RATES = [0, 1000, 1200, 1500, 2100];
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

function randomBudget(g: ReturnType<typeof make>) {
  const objects: ObjectLike[] = Array.from({ length: g.int(1, 3) }, (_, i) => ({
    id: `o${i}`,
    position: i,
  }));
  const sections: SectionLike[] = [];
  for (const o of objects)
    for (let k = 0; k < g.int(1, 4); k++) {
      const parent = sections.filter((s) => s.objectId === o.id);
      sections.push({
        id: `s${sections.length}`,
        objectId: o.id,
        parentId: parent.length && g.r() > 0.5 ? g.pick(parent).id : null,
        position: k,
      });
    }
  const items: ItemLike[] = Array.from({ length: g.int(0, 25) }, (_, i) => {
    const o = g.r() > 0.5 ? g.int(0, 9_00_00) : null;
    return {
      id: `i${i}`,
      sectionId: g.pick(sections).id,
      position: i,
      quantity: g.pick(QTYS),
      unitCostMinor: g.int(0, 500_000),
      unitPriceMinor: g.int(0, 900_000),
      originalQuantity: o === null ? null : g.pick(QTYS),
      originalUnitCostMinor: o,
      originalUnitPriceMinor: o === null ? null : o + 1,
    };
  });
  return { objects, sections, items };
}

describe("rozpočet: invariants", () => {
  it("součet stromu (objekty, oddíly, pododdíly) = součet verze = součet přes položky", () => {
    const g = make(11);
    for (let n = 0; n < 300; n++) {
      const { objects, sections, items } = randomBudget(g);
      const tree = buildTree(objects, sections, items);
      const all = sumAmounts(items.map(itemAmounts));
      const v = versionTotals(sections, items);
      const treeSell = sum(tree.map((o) => o.totals.sellMinor));
      expect(treeSell).toBe(all.sellMinor);
      expect(v.sellMinor).toBe(all.sellMinor);
      expect(sum(Object.values(v.bySection).map((b) => b.sellMinor))).toBe(all.sellMinor);
      expect(sum(Object.values(v.bySection).map((b) => b.costMinor))).toBe(all.costMinor);
      expect(sum(tree.map((o) => o.totals.originalSellMinor))).toBe(all.originalSellMinor);
      expect(sum(tree.map((o) => o.totals.costMinor))).toBe(all.costMinor);
    }
  });

  it("DPH rozpočtu po sazbách: základ = součet řádků, celkem = základ + DPH", () => {
    const g = make(12);
    for (let n = 0; n < 300; n++) {
      const items = Array.from({ length: g.int(0, 20) }, () => ({
        quantity: g.pick(QTYS),
        unitPriceMinor: g.int(0, 900_000),
        vatRateBp: g.pick(RATES),
      }));
      const std = vatBreakdown(items);
      expect(std.netMinor).toBe(sum(items.map((i) => lineAmount(i.quantity, i.unitPriceMinor))));
      expect(std.grossMinor).toBe(std.netMinor + std.vatMinor);
      expect(vatBreakdown(items, "reverse_charge").vatMinor + 0).toBe(0);
    }
  });
});

describe("plán × skutečnost a rozpad nákladu", () => {
  it("náklad rozpadlý po oddílech dá v součtu celý náklad (včetně nespárovaného zbytku)", () => {
    const g = make(13);
    for (let n = 0; n < 500; n++) {
      const amount = g.int(-5_000_00, 90_000_00) || 1;
      const k = g.int(1, 4);
      const parts = Array.from({ length: k }, (_, i) => ({
        sectionId: `s${i}`,
        amountMinor: Math.trunc(amount / k),
      }));
      parts[k - 1]!.amountMinor = amount - sum(parts.slice(0, -1).map((p) => p.amountMinor));
      const bad = validateParts(amount, parts);
      if (parts.some((p) => p.amountMinor === 0) && k > 1) continue;
      expect(bad, JSON.stringify({ amount, parts })).toBeNull();
      const st = allocationState(
        amount,
        parts.map((p) => ({ sectionId: p.sectionId, itemId: null, amountMinor: p.amountMinor })),
      );
      expect(st.allocatedMinor + st.remainingMinor).toBe(amount);
      expect(st.status).toBe("paired");
      // změna částky zdroje: spárované + zbývající se pořád rovná nové částce
      const changed = amount + g.int(-1000, 1000);
      const st2 = allocationState(
        changed,
        parts.map((p) => ({ sectionId: p.sectionId, itemId: null, amountMinor: p.amountMinor })),
      );
      expect(st2.allocatedMinor + st2.remainingMinor).toBe(changed);
    }
  });

  it("celek plánu = součet oddílů; skutečnost mimo oddíly jde jen do celku", () => {
    const g = make(14);
    for (let n = 0; n < 200; n++) {
      const { objects, sections, items } = randomBudget(g);
      const v = versionTotals(sections, items);
      const actual: Record<string, number> = {};
      for (const s of sections) actual[s.id] = g.int(0, 100_000);
      const unpaired = g.int(0, 50_000);
      const plan = buildPlan({
        objects: objects.map((o, i) => ({
          id: o.id,
          code: null,
          title: `O${i}`,
          isDefault: false,
          position: o.position,
        })),
        sections: sections.map((s, i) => ({ ...s, code: null, title: `S${i}` })),
        own: v.bySection,
        actualBySection: actual,
        orderedBySection: {},
        unpairedActualMinor: unpaired,
        unassignedOrderedMinor: 0,
      });
      expect(plan.totals.plannedSellMinor).toBe(v.sellMinor);
      expect(plan.totals.plannedCostMinor).toBe(v.costMinor);
      expect(plan.totals.actualMinor).toBe(sum(Object.values(actual)) + unpaired);
      expect(plan.totals.varianceMinor).toBe(
        plan.totals.plannedCostMinor - plan.totals.actualMinor,
      );
    }
  });
});
