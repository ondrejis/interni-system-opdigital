import { describe, expect, it } from "vitest";
import { allocationState, normalizeParts, suggestSection, validateParts } from "./model";
import { buildPlan, drawdownTone, openCommitmentMinor } from "./plan";
import { computeHealth, computeSummary } from "./summary";

describe("párování nákladů", () => {
  it("jediná část bez částky pokrývá celý náklad a sleduje jeho změnu", () => {
    const a = [{ sectionId: "s1", itemId: null, amountMinor: null }];
    expect(allocationState(1000, a)).toEqual({
      allocatedMinor: 1000,
      remainingMinor: 0,
      status: "paired",
    });
    expect(allocationState(2500, a).status).toBe("paired");
  });

  it("nespárovaný, částečně spárovaný a spárovaný rozpad", () => {
    expect(allocationState(1000, []).status).toBe("unpaired");
    const split = [
      { sectionId: "s1", itemId: null, amountMinor: 600 },
      { sectionId: "s2", itemId: null, amountMinor: 400 },
    ];
    expect(allocationState(1000, split).status).toBe("paired");
    // částka zdroje se mezitím změnila (oprava docházky): zbytek je nespárovaný
    expect(allocationState(1200, split)).toMatchObject({ status: "partial", remainingMinor: 200 });
    expect(allocationState(0, []).status).toBe("paired");
  });

  it("rozpad na víc oddílů musí sedět na haléř a mít znaménko nákladu", () => {
    const p = (a: number) => ({ sectionId: "x", amountMinor: a });
    expect(validateParts(1000, [p(600), p(400)])).toBeNull();
    expect(validateParts(1000, [p(600), p(300)])).toMatch(/Součet částí/);
    expect(validateParts(1000, [{ sectionId: "x" }, p(1000)])).toMatch(/vyplňte částku/);
    expect(validateParts(-1000, [p(-600), p(-400)])).toBeNull(); // vratka ze skladu
    expect(validateParts(-1000, [p(1600), p(-600)])).toMatch(/znaménko/);
    expect(validateParts(1000, [p(900)])).toMatch(/celý náklad/);
    expect(validateParts(1000, [])).toBeNull();
  });

  it("jediná část se uloží bez částky", () => {
    expect(normalizeParts([{ sectionId: "a", amountMinor: 5 }])).toEqual([
      { sectionId: "a", itemId: null, amountMinor: null },
    ]);
    expect(
      normalizeParts([
        { sectionId: "a", amountMinor: 5 },
        { sectionId: "b", amountMinor: 6 },
      ]),
    ).toHaveLength(2);
  });

  it("návrh oddílu je jen jednoznačný", () => {
    const secs = [
      { id: "a", costCategory: "material" },
      { id: "b", costCategory: "labour" },
      { id: "c", costCategory: "material" },
      { id: "d", costCategory: null },
    ];
    expect(suggestSection("labour", secs)).toBe("b");
    expect(suggestSection("material", secs)).toBeNull(); // dva oddíly
    expect(suggestSection("machines", secs)).toBeNull();
  });
});

describe("plán vs skutečnost", () => {
  const own = (sell: number, cost: number, oSell = sell, oCost = cost) => ({
    sellMinor: sell,
    costMinor: cost,
    originalSellMinor: oSell,
    originalCostMinor: oCost,
  });
  const base = {
    objects: [{ id: "o1", code: null, title: "Celá zakázka", isDefault: true, position: 0 }],
    sections: [
      { id: "root", objectId: "o1", parentId: null, code: "1", title: "Elektro", position: 0 },
      { id: "kid", objectId: "o1", parentId: "root", code: "1.1", title: "Rozvaděč", position: 0 },
      { id: "zemni", objectId: "o1", parentId: null, code: "2", title: "Zemní", position: 1 },
    ],
    own: {
      root: own(100_000, 60_000),
      kid: own(50_000, 30_000, 40_000, 25_000),
      zemni: own(80_000, 70_000),
    },
    actualBySection: { kid: 36_000, zemni: 35_000 },
    orderedBySection: { root: 10_000 },
    unpairedActualMinor: 5_000,
    unassignedOrderedMinor: 2_000,
  };

  it("součty se sčítají nahoru přes pododdíly, objekt i zakázku", () => {
    const r = buildPlan(base);
    const elektro = r.objects[0]!.sections[0]!;
    expect(elektro.children).toHaveLength(1);
    expect(elektro.metrics).toMatchObject({
      plannedCostMinor: 90_000,
      plannedSellMinor: 150_000,
      actualMinor: 36_000,
      orderedMinor: 10_000,
      varianceMinor: 54_000,
      drawdownPct: 40,
      originalCostMinor: 85_000,
      costChangeMinor: 5_000,
      sellChangeMinor: 10_000,
    });
    const kid = elektro.children[0]!;
    expect(kid.metrics.drawdownPct).toBe(120);
    expect(kid.metrics.varianceMinor).toBe(-6_000);
    expect(r.objects[0]!.metrics.plannedCostMinor).toBe(160_000);
    expect(r.objects[0]!.metrics.actualMinor).toBe(71_000);
  });

  it("nespárované náklady a závazky bez oddílu jdou jen do celku zakázky", () => {
    const r = buildPlan(base);
    expect(r.totals.actualMinor).toBe(71_000 + 5_000);
    expect(r.totals.orderedMinor).toBe(10_000 + 2_000);
    expect(r.objects[0]!.metrics.actualMinor).toBe(71_000);
    expect(r.unpairedActualMinor).toBe(5_000);
  });

  it("marže plán vs skutečnost a oddíl bez plánu nedělí nulou", () => {
    const r = buildPlan(base);
    expect(r.totals.plannedMarginMinor).toBe(230_000 - 160_000);
    expect(r.totals.plannedMarginPct).toBe(30.4);
    const empty = buildPlan({
      ...base,
      own: {},
      actualBySection: { zemni: 100 },
      unpairedActualMinor: 0,
      unassignedOrderedMinor: 0,
    });
    expect(empty.totals.drawdownPct).toBeNull();
    expect(empty.totals.plannedMarginPct).toBeNull();
    expect(drawdownTone(empty.totals)).toBe("over");
  });

  it("oddíl s neplatným nadřazeným oddílem (cyklus) se bere jako kořenový", () => {
    const r = buildPlan({
      ...base,
      sections: [
        { id: "a", objectId: "o1", parentId: "b", code: null, title: "A", position: 0 },
        { id: "b", objectId: "o1", parentId: "a", code: null, title: "B", position: 1 },
      ],
      own: {},
      actualBySection: {},
      orderedBySection: {},
    });
    expect(r.objects[0]!.sections.length).toBeGreaterThan(0);
  });

  it("barva čerpání a otevřený závazek objednávky", () => {
    const m = (cost: number, actual: number) => ({
      plannedCostMinor: cost,
      actualMinor: actual,
      drawdownPct: cost ? Math.round((actual / cost) * 1000) / 10 : null,
    });
    expect(drawdownTone(m(100, 50))).toBe("ok");
    expect(drawdownTone(m(100, 90))).toBe("warn");
    expect(drawdownTone(m(100, 101))).toBe("over");
    expect(drawdownTone(m(0, 0))).toBe("none");
    expect(openCommitmentMinor(10_000, 4_000)).toBe(6_000);
    expect(openCommitmentMinor(10_000, 12_000)).toBe(0);
  });
});

describe("souhrn zakázky a semafor", () => {
  const sum = computeSummary({
    valueMinor: 1_000_000_00,
    approvedChangesMinor: 80_000_00,
    plannedCostMinor: 700_000_00,
    costMinor: 740_000_00,
    invoicedMinor: 400_000_00,
    paidMinor: 250_000_00,
    unpairedCount: 3,
  });

  it("smluvní cena = původní + schválené změny, marže a čerpání", () => {
    expect(sum).toMatchObject({
      contractMinor: 1_080_000_00,
      originalContractMinor: 1_000_000_00,
      marginMinor: 340_000_00,
      marginPct: 31.5,
      plannedMarginMinor: 380_000_00,
      plannedMarginPct: 35.2,
      drawdownPct: 105.7,
      unpairedCount: 3,
    });
  });

  it("zakázka bez ceny a bez plánu nedělí nulou", () => {
    const s = computeSummary({
      valueMinor: 0,
      approvedChangesMinor: 0,
      plannedCostMinor: 0,
      costMinor: 100,
      invoicedMinor: 0,
      paidMinor: 0,
      unpairedCount: 0,
    });
    expect(s.marginPct).toBeNull();
    expect(s.drawdownPct).toBeNull();
  });

  const health = (over: Partial<Parameters<typeof computeHealth>[0]>) =>
    computeHealth({
      phase: "execution",
      costMinor: 100,
      marginMinor: 50,
      marginPct: 30,
      plannedMarginPct: 32,
      drawdownPct: 50,
      endDate: "2030-01-01",
      today: "2026-10-09",
      ...over,
    });

  it("semafor: ok, pozor, problém, bez hodnocení", () => {
    expect(health({})).toBe("ok");
    expect(health({ drawdownPct: 90 })).toBe("warning");
    expect(health({ marginPct: 15, plannedMarginPct: 30 })).toBe("warning");
    expect(health({ marginPct: 25, plannedMarginPct: 30 })).toBe("ok");
    expect(health({ drawdownPct: 100.1 })).toBe("danger");
    expect(health({ marginMinor: -1 })).toBe("danger");
    expect(health({ endDate: "2026-10-01" })).toBe("danger");
    expect(health({ endDate: "2026-10-01", phase: "warranty" })).toBe("ok");
    expect(health({ phase: "offer" })).toBeNull();
    expect(health({ phase: "closed" })).toBeNull();
    expect(health({ costMinor: 0, marginMinor: -1, marginPct: -5, plannedMarginPct: 30 })).toBe(
      "ok",
    );
  });
});
