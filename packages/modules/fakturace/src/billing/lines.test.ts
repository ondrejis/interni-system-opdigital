import { describe, expect, it } from "vitest";
import {
  amountLines,
  buildFinalLines,
  releaseLines,
  retentionRows,
  settlementOf,
  statementInvoiceLines,
  withRetention,
  type BudgetItemRow,
  type DraftLine,
} from "./lines";
import { documentTotals } from "../totals";

const item = (id: string, qty: string, price: number, rate = 2100): BudgetItemRow => ({
  id,
  title: `Položka ${id}`,
  code: null,
  unit: "m2",
  quantity: qty,
  unitPriceMinor: price,
  vatRateBp: rate,
});

const base = {
  billedByItem: new Map(),
  previous: [],
  advances: [],
  extraChanges: [],
  retentionBp: 0,
  vatMode: "standard" as const,
  defaultRateBp: 2100,
  payer: true,
};

describe("konečná faktura z rozpočtu", () => {
  it("bez předchozího fakturování vyúčtuje celý rozpočet po položkách", () => {
    const lines = buildFinalLines({
      ...base,
      items: [item("a", "10", 30_000_00), item("b", "1", 200_000_00)],
    });
    expect(lines.map((l) => l.budgetItemId)).toEqual(["a", "b"]);
    expect(settlementOf(lines).netMinor).toBe(500_000_00);
  });

  it("zbývající část položky, kterou soupis už z části vyfakturoval", () => {
    const lines = buildFinalLines({
      ...base,
      items: [item("a", "10", 30_000_00)],
      billedByItem: new Map([["a", { netMinor: 120_000_00, quantity: 4 }]]),
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      description: "Položka a – zbývající část",
      unitPriceMinor: 180_000_00,
      budgetItemId: "a",
    });
  });

  it("zcela vyfakturovaná položka se vynechá", () => {
    const lines = buildFinalLines({
      ...base,
      items: [item("a", "10", 30_000_00), item("b", "1", 1000_00)],
      billedByItem: new Map([["a", { netMinor: 300_000_00, quantity: 10 }]]),
    });
    expect(lines.map((l) => l.budgetItemId)).toEqual(["b"]);
  });

  it("odečte zaplacenou zálohu po sazbách s odkazem na doklad a nepočítá z ní zádržné", () => {
    const lines = buildFinalLines({
      ...base,
      items: [item("a", "1", 100_000_00, 2100), item("b", "1", 50_000_00, 1200)],
      advances: [
        {
          invoiceId: "adv1",
          number: "ZF-2026-0001",
          groups: [
            { vatRateBp: 2100, netMinor: 30_000_00 },
            { vatRateBp: 1200, netMinor: 15_000_00 },
          ],
        },
      ],
      retentionBp: 1000,
    });
    const ded = lines.filter((l) => l.role === "advance");
    expect(ded.map((l) => l.unitPriceMinor)).toEqual([-30_000_00, -15_000_00]);
    expect(ded[0]).toMatchObject({
      description: "Odpočet zálohy ZF-2026-0001",
      refInvoiceId: "adv1",
    });
    const ret = lines.filter((l) => l.role === "retention");
    expect(ret.map((l) => l.unitPriceMinor)).toEqual([-10_000_00, -5_000_00]); // 10 % ze 100 + 50
    const s = settlementOf(lines);
    expect(s.advancesMinor).toBe(45_000_00);
    expect(s.retentionMinor).toBe(15_000_00);
    expect(s.netMinor).toBe(150_000_00 - 45_000_00 - 15_000_00);
  });

  it("dříve fakturované práce bez vazby na položky se odečtou a snižují základ zádržného", () => {
    const lines = buildFinalLines({
      ...base,
      items: [item("a", "1", 300_000_00)],
      previous: [
        {
          invoiceId: "p1",
          number: "FV-2026-0003",
          unlinked: [{ vatRateBp: 2100, netMinor: 100_000_00 }],
        },
      ],
      retentionBp: 500,
    });
    const s = settlementOf(lines);
    expect(s.previousMinor).toBe(100_000_00);
    expect(s.remainingWorkMinor).toBe(200_000_00);
    expect(s.retentionMinor).toBe(10_000_00);
    expect(s.netMinor).toBe(190_000_00);
  });

  it("schválené změny mimo rozpočet přibudou jako řádky; vícepráce i méněpráce", () => {
    const lines = buildFinalLines({
      ...base,
      items: [item("a", "1", 100_000_00)],
      extraChanges: [
        { number: "VP-1", title: "Podlahové topení", amountMinor: 50_000_00 },
        { number: "MP-2", title: "Bez obkladu", amountMinor: -10_000_00 },
      ],
    });
    expect(settlementOf(lines).netMinor).toBe(140_000_00);
  });

  it("přenesená daňová povinnost: všechny řádky bez DPH", () => {
    const lines = buildFinalLines({
      ...base,
      vatMode: "reverse_charge",
      items: [item("a", "1", 100_000_00, 2100)],
      retentionBp: 1000,
    });
    expect(lines.every((l) => l.vatRateBp === 0)).toBe(true);
    const t = documentTotals(lines, { vatMode: "reverse_charge" });
    expect(t.vatMinor).toBe(0);
    expect(t.grossMinor).toBe(90_000_00);
  });

  it("neplátce DPH: sazba 0 na všech řádcích", () => {
    const lines = buildFinalLines({ ...base, payer: false, items: [item("a", "1", 1000_00)] });
    expect(lines[0]!.vatRateBp).toBe(0);
  });

  it("zakázka bez rozpočtu: jeden řádek z ceny zakázky", () => {
    const lines = buildFinalLines({
      ...base,
      items: [],
      fallback: { description: "Dílo dle smlouvy", netMinor: 80_000_00 },
    });
    expect(lines).toHaveLength(1);
    expect(settlementOf(lines).netMinor).toBe(80_000_00);
  });

  it("zaokrouhlení: zádržné z lichého základu dává celé haléře a součet sedí", () => {
    const lines = buildFinalLines({
      ...base,
      items: [item("a", "3", 33_333)],
      retentionBp: 333,
    });
    const s = settlementOf(lines);
    expect(s.workMinor).toBe(99_999);
    expect(s.retentionMinor).toBe(3330); // 3329,967 → 3330
  });
});

describe("zádržné na dokladu", () => {
  const work: DraftLine[] = [
    {
      description: "Práce",
      quantity: "1",
      unit: "ks",
      unitPriceMinor: 100_000_00,
      vatRateBp: 2100,
      role: "work",
    },
  ];
  it("řádek zádržného je záporný, nese sazbu a text s procentem", () => {
    const rows = retentionRows(work, 500, "standard");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      unitPriceMinor: -5_000_00,
      vatRateBp: 2100,
      role: "retention",
    });
    expect(rows[0]!.description).toContain("Zádržné 5 %");
  });
  it("withRetention nahradí staré řádky zádržného novými (idempotentní)", () => {
    const once = withRetention(work, 500, "standard");
    const twice = withRetention(once, 500, "standard");
    expect(twice).toEqual(once);
    expect(withRetention(once, 0, "standard")).toEqual(work);
  });
  it("DPH se počítá ze základu sníženého o zádržné", () => {
    const t = documentTotals(withRetention(work, 1000, "standard"));
    expect(t.netMinor).toBe(90_000_00);
    expect(t.vatMinor).toBe(18_900_00);
  });
});

describe("záloha / dílčí faktura z částky", () => {
  it("jedna sazba: jeden řádek", () => {
    const l = amountLines({
      description: "Záloha 30 %",
      netMinor: 300_000_00,
      weights: [{ vatRateBp: 2100, weight: 1000 }],
      defaultRateBp: 2100,
      payer: true,
      vatMode: "standard",
    });
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ unitPriceMinor: 300_000_00, vatRateBp: 2100 });
  });
  it("více sazeb v rozpočtu: základ se rozdělí poměrem, součet sedí", () => {
    const l = amountLines({
      description: "Záloha",
      netMinor: 100_001,
      weights: [
        { vatRateBp: 2100, weight: 700 },
        { vatRateBp: 1200, weight: 300 },
      ],
      defaultRateBp: 2100,
      payer: true,
      vatMode: "standard",
    });
    expect(l).toHaveLength(2);
    expect(l.reduce((a, x) => a + x.unitPriceMinor, 0)).toBe(100_001);
  });
  it("PDP a neplátce: jedna skupina se sazbou 0", () => {
    for (const o of [
      { payer: true, vatMode: "reverse_charge" as const },
      { payer: false, vatMode: "standard" as const },
    ]) {
      const l = amountLines({
        description: "Záloha",
        netMinor: 1000,
        weights: [
          { vatRateBp: 2100, weight: 1 },
          { vatRateBp: 1200, weight: 1 },
        ],
        defaultRateBp: 2100,
        ...o,
      });
      expect(l).toHaveLength(1);
      expect(l[0]!.vatRateBp).toBe(0);
    }
  });
});

describe("soupis prací", () => {
  it("řádky po položkách rozpočtu s množstvím za období; nulové vynechá", () => {
    const l = statementInvoiceLines(
      [
        {
          budgetItemId: "a",
          title: "Zdění",
          unit: "m2",
          vatRateBp: 2100,
          quantityPeriod: "12.5",
          unitPriceMinor: 1000_00,
        },
        {
          budgetItemId: "b",
          title: "Omítky",
          unit: "m2",
          vatRateBp: 2100,
          quantityPeriod: "0",
          unitPriceMinor: 500_00,
        },
      ],
      true,
      "standard",
    );
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({
      budgetItemId: "a",
      quantity: "12.5",
      vatRateBp: 2100,
      role: "work",
    });
  });
  it("PDP vynutí sazbu 0", () => {
    const l = statementInvoiceLines(
      [
        {
          budgetItemId: "a",
          title: "x",
          unit: "ks",
          vatRateBp: 2100,
          quantityPeriod: "1",
          unitPriceMinor: 100,
        },
      ],
      true,
      "reverse_charge",
    );
    expect(l[0]!.vatRateBp).toBe(0);
  });
});

describe("uvolnění zádržného", () => {
  const held = [
    { vatRateBp: 2100, netMinor: 8_000_00 },
    { vatRateBp: 1200, netMinor: 2_000_00 },
  ];
  it("bez částky uvolní vše po sazbách", () => {
    const l = releaseLines({ held, jobNumber: "Z-1", vatMode: "standard" });
    expect(l.map((x) => [x.vatRateBp, x.unitPriceMinor])).toEqual([
      [2100, 8_000_00],
      [1200, 2_000_00],
    ]);
    expect(l.every((x) => x.role === "release")).toBe(true);
  });
  it("část se rozdělí poměrem držených základů a součet sedí", () => {
    const l = releaseLines({ held, amountMinor: 5_000_00, jobNumber: "Z-1", vatMode: "standard" });
    expect(l.reduce((a, x) => a + x.unitPriceMinor, 0)).toBe(5_000_00);
  });
  it("není co uvolnit → žádné řádky; částka nad drženým se ořízne", () => {
    expect(releaseLines({ held: [], jobNumber: "Z-1", vatMode: "standard" })).toEqual([]);
    const l = releaseLines({ held, amountMinor: 99_999_00, jobNumber: "Z-1", vatMode: "standard" });
    expect(l.reduce((a, x) => a + x.unitPriceMinor, 0)).toBe(10_000_00);
  });
});
