import { describe, expect, it } from "vitest";
import { lineTotalMinor } from "../economics";
import {
  buildTree,
  itemAmounts,
  lineAmount,
  lockReason,
  normalizeQuantity,
  quantityString,
  sumAmounts,
  vatBreakdown,
  versionTotals,
} from "./math";

const item = (over: Partial<Parameters<typeof itemAmounts>[0]> = {}) => ({
  quantity: "1",
  unitCostMinor: 0,
  unitPriceMinor: 0,
  ...over,
});

describe("částka řádku", () => {
  it("násobí množství jednotkovou cenou a zaokrouhluje půl od nuly", () => {
    expect(lineAmount("12.5", 89_000)).toBe(1_112_500);
    expect(lineAmount("0.001", 500)).toBe(1); // 0,5 haléře -> 1
    expect(lineAmount("0.001", 499)).toBe(0);
    expect(lineAmount("-0.001", 500)).toBe(-1);
    expect(lineAmount("2.345", 100)).toBe(235);
    expect(lineAmount("3", -250)).toBe(-750);
  });

  it("odpovídá lineTotalMinor na rozumných vstupech", () => {
    for (let n = 0; n < 500; n++) {
      const q = ((n * 7919) % 100_000) / 1000;
      const u = ((n * 104_729) % 5_000_000) - 1_000_000;
      expect(lineAmount(q.toFixed(3), u) + 0).toBe(lineTotalMinor(q.toFixed(3), u) + 0);
    }
  });

  it("zvládne velká čísla bez ztráty přesnosti", () => {
    expect(lineAmount("99999999999.999", 1)).toBe(100_000_000_000); // 99 999 999 999,999 haléře
    expect(lineAmount("1000000", 9_000_000_000)).toBe(9_000_000_000_000_000);
  });

  it("normalizuje množství", () => {
    expect(normalizeQuantity("12,5")).toBe("12.5");
    expect(normalizeQuantity(" 3 ")).toBe("3");
    expect(normalizeQuantity("1.2345")).toBeNull();
    expect(normalizeQuantity("abc")).toBeNull();
    expect(quantityString(12.5)).toBe("12.500");
    expect(quantityString(-0.0005)).toBe("-0.001");
    expect(quantityString(0)).toBe("0.000");
  });
});

describe("součty a marže", () => {
  it("počítá prodej, náklad, marži a původní hodnoty", () => {
    const a = itemAmounts(
      item({
        quantity: "10",
        unitPriceMinor: 1_000,
        unitCostMinor: 600,
        originalQuantity: "8",
        originalUnitPriceMinor: 1_000,
        originalUnitCostMinor: 600,
      }),
    );
    expect(a).toMatchObject({
      sellMinor: 10_000,
      costMinor: 6_000,
      marginMinor: 4_000,
      marginPct: 40,
      originalSellMinor: 8_000,
      originalCostMinor: 4_800,
    });
  });

  it("bez uložených původních hodnot jsou původní rovné aktuálním", () => {
    const a = itemAmounts(item({ quantity: "2", unitPriceMinor: 500, unitCostMinor: 100 }));
    expect(a.originalSellMinor).toBe(a.sellMinor);
    expect(a.originalCostMinor).toBe(a.costMinor);
  });

  it("marže % je null bez prodeje a záporná při ztrátě", () => {
    expect(itemAmounts(item({ unitCostMinor: 100 })).marginPct).toBeNull();
    expect(itemAmounts(item({ unitPriceMinor: 1_000, unitCostMinor: 1_250 })).marginPct).toBe(-25);
    expect(sumAmounts([]).sellMinor).toBe(0);
  });
});

describe("DPH po sazbách", () => {
  it("sčítá základ po sazbách a DPH počítá ze základu sazby", () => {
    const v = vatBreakdown([
      { quantity: "1", unitPriceMinor: 333, vatRateBp: 2100 },
      { quantity: "1", unitPriceMinor: 333, vatRateBp: 2100 },
      { quantity: "1", unitPriceMinor: 1_000, vatRateBp: 1200 },
      { quantity: "1", unitPriceMinor: 500, vatRateBp: 0 },
    ]);
    expect(v.groups.map((g) => g.vatRateBp)).toEqual([2100, 1200, 0]);
    expect(v.groups[0]).toMatchObject({ netMinor: 666, vatMinor: 140, grossMinor: 806 });
    expect(v.netMinor).toBe(2_166);
    expect(v.vatMinor).toBe(140 + 120);
    expect(v.grossMinor).toBe(v.netMinor + v.vatMinor);
  });

  it("přenesená daňová povinnost nese nulové DPH", () => {
    const v = vatBreakdown(
      [{ quantity: "2", unitPriceMinor: 1_000, vatRateBp: 2100 }],
      "reverse_charge",
    );
    expect(v.vatMinor).toBe(0);
    expect(v.grossMinor).toBe(2_000);
  });
});

describe("strom oddílů", () => {
  const objects = [
    { id: "o1", position: 0 },
    { id: "o2", position: 1 },
  ];
  const sections = [
    { id: "s1", objectId: "o1", parentId: null, position: 0 },
    { id: "s1a", objectId: "o1", parentId: "s1", position: 0 },
    { id: "s1b", objectId: "o1", parentId: "s1", position: 1 },
    { id: "s2", objectId: "o2", parentId: null, position: 0 },
    { id: "cycA", objectId: "o2", parentId: "cycB", position: 1 },
    { id: "cycB", objectId: "o2", parentId: "cycA", position: 2 },
  ];
  const items = [
    {
      id: "i1",
      sectionId: "s1",
      position: 0,
      ...item({ quantity: "2", unitPriceMinor: 100, unitCostMinor: 60 }),
    },
    {
      id: "i2",
      sectionId: "s1a",
      position: 0,
      ...item({ quantity: "1", unitPriceMinor: 1_000, unitCostMinor: 700 }),
    },
    {
      id: "i3",
      sectionId: "s1b",
      position: 0,
      ...item({ quantity: "3", unitPriceMinor: 10, unitCostMinor: 5 }),
    },
    {
      id: "i4",
      sectionId: "s2",
      position: 0,
      ...item({ quantity: "1", unitPriceMinor: 50, unitCostMinor: 20 }),
    },
  ];

  it("dopočítá součty na každé úrovni včetně pododdílů", () => {
    const tree = buildTree(objects, sections, items);
    const s1 = tree[0]!.sections[0]!;
    expect(s1.own.sellMinor).toBe(200);
    expect(s1.totals.sellMinor).toBe(200 + 1_000 + 30);
    expect(s1.children.map((c) => c.id)).toEqual(["s1a", "s1b"]);
    expect(s1.itemCount).toBe(3);
    expect(tree[0]!.totals.sellMinor).toBe(1_230);
    expect(tree[1]!.totals.sellMinor).toBe(50);
  });

  it("cyklus oddílů nezacyklí výpočet (oddíly se berou jako kořenové)", () => {
    const tree = buildTree(objects, sections, items);
    expect(tree[1]!.sections.map((s) => s.id).sort()).toEqual(["cycA", "cycB", "s2"]);
  });

  it("součty verze a vlastní součty oddílů (včetně prázdných)", () => {
    const t = versionTotals(sections, items);
    expect(t.sellMinor).toBe(1_280);
    expect(t.bySection.s1).toMatchObject({ sellMinor: 200, costMinor: 120 });
    expect(t.bySection.cycA).toMatchObject({ sellMinor: 0 });
    const sum = Object.values(t.bySection).reduce((a, b) => a + b.sellMinor, 0);
    expect(sum).toBe(t.sellMinor);
  });
});

describe("zamčení", () => {
  it("vysvětlí, proč se verze nedá měnit", () => {
    expect(lockReason({ kind: "offer", status: "draft" })).toBeNull();
    expect(lockReason({ kind: "offer", status: "sent" })).toBeNull();
    expect(lockReason({ kind: "offer", status: "locked" })).toMatch(/vyhrána/);
    expect(lockReason({ kind: "realization", status: "locked" })).toMatch(/ZBV/);
  });
});
