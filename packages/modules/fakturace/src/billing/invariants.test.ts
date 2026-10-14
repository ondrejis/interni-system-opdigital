import { describe, expect, it } from "vitest";
import { roundMinor } from "@rebar/core/shared";
import {
  allocateByRate,
  documentTotals,
  lineNetMinor,
  retentionGroups,
  type LineInput,
  type VatMode,
} from "../totals";
import { invoicingOf } from "./api";
import type { JobHistory } from "./sources";
import {
  amountLines,
  buildFinalLines,
  releaseLines,
  settlementOf,
  withRetention,
  type BudgetItemRow,
  type DraftLine,
} from "./lines";

/**
 * Náhodné (s pevným seedem) kontroly invariantů peněz: součty řádků = součty dokladu, DPH po sazbách,
 * konečná faktura + zálohy + zádržné + dřívější plnění = smluvní cena, rozdělení částky na sazby sedí na haléř.
 */

/** mulberry32: malý deterministický generátor, aby byl běh opakovatelný. */
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

const RATES = [0, 1000, 1200, 1500, 2100];
const QTYS = [
  "1",
  "0",
  "0.001",
  "0.5",
  "2.5",
  "12.345",
  "100",
  "1000.125",
  "7",
  "33.333",
  "-2",
  "-0.5",
];
const modes: VatMode[] = ["standard", "reverse_charge"];

/** Přesný referenční výpočet v celých číslech (půl od nuly), nezávislý na implementaci. */
function lineAmount(quantity: string, unitMinor: number): number {
  const neg = quantity.startsWith("-");
  const [int = "0", frac = ""] = quantity.replace("-", "").split(".");
  const thousandths = BigInt(int) * 1000n + BigInt(frac.padEnd(3, "0"));
  const num = (neg ? -thousandths : thousandths) * BigInt(unitMinor);
  const abs = num < 0n ? -num : num;
  const q = (abs + 500n) / 1000n;
  return Number(num < 0n ? -q : q);
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const RUNS = 400;

function randomLines(g: ReturnType<typeof make>, n: number, allowNegative = true): LineInput[] {
  return Array.from({ length: n }, () => ({
    quantity: g.pick(allowNegative ? QTYS : QTYS.filter((q) => !q.startsWith("-"))),
    unitPriceMinor: g.int(allowNegative ? -5_000_000 : 0, 9_000_000_00),
    vatRateBp: g.pick(RATES),
  }));
}

describe("lineNetMinor a lineAmount (rozpočet)", () => {
  it("dávají stejný výsledek jako přesný výpočet v celých číslech", () => {
    const g = make(1);
    for (let i = 0; i < 5000; i++) {
      const q = g.pick(QTYS);
      const p = g.int(-9_000_000_000, 9_000_000_000);
      expect(lineNetMinor(q, p) + 0, `${q} × ${p}`).toBe(lineAmount(q, p) + 0);
    }
  });

  it("zaokrouhluje půl od nuly a symetricky pro záporné částky", () => {
    expect(lineNetMinor("0.5", 1)).toBe(1);
    expect(lineNetMinor("0.5", -1)).toBe(-1);
    expect(lineNetMinor("1.5", 1)).toBe(2);
    expect(lineNetMinor("0.001", 499)).toBe(0);
    expect(lineNetMinor("0.001", 500)).toBe(1);
  });
});

describe("součty dokladu", () => {
  it("základ a DPH po sazbách sedí, doklad = součet skupin, záporné zrcadlo", () => {
    const g = make(2);
    for (let i = 0; i < RUNS; i++) {
      const lines = randomLines(g, g.int(0, 12));
      const mode = g.pick(modes);
      const t = documentTotals(lines, { vatMode: mode });
      expect(t.netMinor).toBe(sum(lines.map((l) => lineNetMinor(l.quantity, l.unitPriceMinor))));
      expect(t.grossMinor).toBe(t.netMinor + t.vatMinor);
      expect(t.vatMinor).toBe(sum(t.groups.map((x) => x.vatMinor)));
      for (const x of t.groups) {
        expect(x.vatMinor).toBe(roundMinor((x.netMinor * x.vatRateBp) / 10_000));
        expect(x.grossMinor).toBe(x.netMinor + x.vatMinor);
        if (mode === "reverse_charge") expect(x.vatMinor + 0).toBe(0);
      }
      // pořadí řádků nesmí změnit výsledek
      const shuffled = [...lines].reverse();
      expect(documentTotals(shuffled, { vatMode: mode })).toEqual(t);
      // dobropis (opačná znaménka) je přesné zrcadlo
      const mirrored = documentTotals(
        lines.map((l) => ({ ...l, unitPriceMinor: -l.unitPriceMinor })),
        { vatMode: mode },
      );
      expect(mirrored.netMinor).toBe(-t.netMinor + 0);
      expect(mirrored.vatMinor).toBe(-t.vatMinor + 0);
    }
  });
});

describe("allocateByRate", () => {
  it("součet částí je vždy přesně částka, i záporná a při nulových vahách", () => {
    const g = make(3);
    for (let i = 0; i < RUNS * 3; i++) {
      const total = g.int(-50_000_000, 50_000_000);
      const w = Array.from({ length: g.int(0, 5) }, (_, k) => ({
        vatRateBp: RATES[k % RATES.length]!,
        weight: g.pick([0, 1, 3, 10, 12345, 987654321]),
      }));
      const parts = allocateByRate(total, w, 2100);
      expect(sum(parts.map((p) => p.netMinor))).toBe(total);
    }
  });

  it("amountLines: součet řádků = částka, DPH skupin se nerozejde", () => {
    const g = make(4);
    for (let i = 0; i < RUNS; i++) {
      const net = g.int(1, 90_000_000_00);
      const weights = Array.from({ length: g.int(0, 4) }, (_, k) => ({
        vatRateBp: RATES[k]!,
        weight: g.int(0, 100_000_00),
      }));
      const mode = g.pick(modes);
      const payer = g.r() > 0.2;
      const lines = amountLines({
        description: "x",
        netMinor: net,
        weights,
        defaultRateBp: 2100,
        payer,
        vatMode: mode,
      });
      const t = documentTotals(lines, { vatMode: mode });
      expect(t.netMinor).toBe(net);
      if (!payer || mode === "reverse_charge") expect(t.vatMinor).toBe(0);
    }
  });
});

describe("zádržné", () => {
  it("nikdy není větší než základ a vychází po sazbách; withRetention je idempotentní", () => {
    const g = make(5);
    for (let i = 0; i < RUNS; i++) {
      const lines = randomLines(g, g.int(1, 8), false).map((l): DraftLine => ({
        description: "x",
        quantity: String(l.quantity),
        unit: "ks",
        unitPriceMinor: l.unitPriceMinor,
        vatRateBp: l.vatRateBp,
        role: "work",
      }));
      const bp = g.pick([0, 100, 500, 1000, 1500, 2500, 10_000]);
      const mode = g.pick(modes);
      const groups = retentionGroups(lines, bp, mode);
      const baseNet = documentTotals(lines, { vatMode: mode }).netMinor;
      expect(sum(groups.map((x) => x.retainMinor))).toBeLessThanOrEqual(
        Math.max(baseNet, 0) + groups.length,
      );
      const once = withRetention(lines, bp, mode);
      const twice = withRetention(once, bp, mode);
      expect(twice).toEqual(once);
    }
  });
});

describe("konečné vyúčtování", () => {
  it("konečná faktura + dřívější plnění + zálohy + zádržné = smluvní cena", () => {
    const g = make(6);
    for (let i = 0; i < RUNS; i++) {
      const mode = g.pick(modes);
      const payer = g.r() > 0.15;
      const items: BudgetItemRow[] = Array.from({ length: g.int(1, 8) }, (_, k) => ({
        id: `i${k}`,
        title: `P${k}`,
        code: null,
        unit: "ks",
        quantity: g.pick(QTYS.filter((q) => !q.startsWith("-") && q !== "0")),
        unitPriceMinor: g.int(0, 3_000_000_00),
        vatRateBp: g.pick(RATES),
      }));
      const contractOf = (it: BudgetItemRow) => lineNetMinor(it.quantity, it.unitPriceMinor);
      const billedByItem = new Map<string, { netMinor: number; quantity: number }>();
      let billedLinked = 0;
      for (const it of items)
        if (g.r() > 0.5) {
          const c = contractOf(it);
          const b = Math.floor(c * g.pick([0.25, 0.5, 1]));
          billedByItem.set(it.id, { netMinor: b, quantity: 1 });
          billedLinked += b;
        }
      const extra =
        g.r() > 0.5 ? [{ number: "VP-1", title: "v", amountMinor: g.int(-200_000, 900_000) }] : [];
      const unlinked = g.r() > 0.5 ? g.int(1, 400_000) : 0;
      const previous = unlinked
        ? [{ invoiceId: "p1", number: "F1", unlinked: [{ vatRateBp: 2100, netMinor: unlinked }] }]
        : [];
      const adv = g.r() > 0.5 ? g.int(1, 300_000) : 0;
      const advances = adv
        ? [{ invoiceId: "a1", number: "Z1", groups: [{ vatRateBp: 2100, netMinor: adv }] }]
        : [];
      const bp = g.pick([0, 500, 1000]);
      const lines = buildFinalLines({
        items,
        billedByItem,
        previous,
        advances,
        extraChanges: extra,
        retentionBp: bp,
        vatMode: mode,
        defaultRateBp: payer ? 2100 : 0,
        payer,
      });
      const s = settlementOf(lines, mode);
      const contract = sum(items.map(contractOf)) + sum(extra.map((e) => e.amountMinor));
      // k fakturaci bez DPH = smlouva − dřívější plnění − zálohy − zádržné
      expect(s.netMinor, "net").toBe(contract - billedLinked - unlinked - adv - s.retentionMinor);
      expect(s.workMinor + s.previousMinor * -1 + billedLinked + unlinked).toBe(contract);
      expect(s.grossMinor).toBe(s.netMinor + s.vatMinor);
      if (!payer || mode === "reverse_charge") expect(s.vatMinor).toBe(0);
      expect(s.retentionMinor).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("uvolnění zádržného", () => {
  it("uvolní přesně požadovanou částku a nikdy víc než drženo v dané sazbě", () => {
    const g = make(7);
    for (let i = 0; i < RUNS * 3; i++) {
      const held = Array.from({ length: g.int(1, 4) }, (_, k) => ({
        vatRateBp: RATES[k]!,
        netMinor: g.int(1, 5_000_000),
      }));
      const total = sum(held.map((h) => h.netMinor));
      const amount = g.r() > 0.3 ? g.int(1, total) : undefined;
      const lines = releaseLines({
        held,
        ...(amount !== undefined ? { amountMinor: amount } : {}),
        jobNumber: "Z-1",
        vatMode: "standard",
      });
      const released = sum(lines.map((l) => l.unitPriceMinor));
      expect(released, JSON.stringify({ held, amount })).toBe(amount ?? total);
      for (const l of lines) {
        const h = held.find((x) => x.vatRateBp === l.vatRateBp)!;
        expect(l.unitPriceMinor).toBeLessThanOrEqual(h.netMinor);
        expect(l.unitPriceMinor).toBeGreaterThan(0);
      }
    }
  });
});

describe("souhrn uhrazeného (invoicingOf)", () => {
  const doc = (netMinor: number, grossMinor: number, paidMinor: number) =>
    ({
      id: "d1",
      kind: "partial",
      state: "partial",
      netMinor,
      grossMinor,
      paidMinor,
    }) as unknown as JobHistory["docs"][number];

  it("uhrazený základ vychází z přesného poměru, ne z poměru zaokrouhleného na milióntiny", () => {
    // faktura 1 000 000 Kč bez DPH, třetina uhrazena: přesně 333 333,33 Kč
    const net = 100_000_000;
    const gross = 121_000_000;
    const paid = Math.round(gross / 3);
    const h: JobHistory = { docs: [doc(net, gross, paid)], lines: new Map(), kindOf: new Map() };
    expect(invoicingOf(h).paidMinor).toBe(Math.round((net * paid) / gross));
    expect(Math.abs(invoicingOf(h).paidMinor - net / 3)).toBeLessThanOrEqual(1);
  });

  it("plně uhrazený doklad = celý základ, nezaplacený = 0", () => {
    const h: JobHistory = {
      docs: [doc(12_345_678_91, 14_938_271_28, 14_938_271_28), doc(500, 605, 0)],
      lines: new Map(),
      kindOf: new Map(),
    };
    expect(invoicingOf(h).paidMinor).toBe(12_345_678_91);
  });
});
