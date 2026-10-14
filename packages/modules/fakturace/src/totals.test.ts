import { describe, expect, it } from "vitest";
import { czAccountToIban, isValidIban, spdPayload } from "./iban";
import {
  allocateByRate,
  documentTotals,
  lineNetMinor,
  netByRole,
  paymentState,
  retentionGroups,
  retentionTotal,
  vatOf,
} from "./totals";

describe("součty dokladu", () => {
  it("základ řádku z množství s tisícinami a ceny v haléřích", () => {
    expect(lineNetMinor("2.5", 1000)).toBe(2500);
    expect(lineNetMinor("0.333", 100)).toBe(33);
    expect(lineNetMinor("0.335", 100)).toBe(34);
    expect(lineNetMinor("-1", 12345)).toBe(-12345);
  });

  it("DPH se počítá ze základu po sazbách, ne po řádcích (rozdíl v haléřích)", () => {
    // 3 řádky po 0,10 Kč základ při 21 %: po řádcích 3 × 0,02 = 0,06, ze součtu 0,30 → 0,06; zde rozdíl ukáže 4 řádky po 0,02
    const lines = Array.from({ length: 5 }, () => ({
      quantity: 1,
      unitPriceMinor: 2,
      vatRateBp: 2100,
    }));
    const t = documentTotals(lines);
    expect(t.netMinor).toBe(10);
    expect(t.vatMinor).toBe(vatOf(10, 2100)); // 2 haléře ze 10, ne 5 × 0
    expect(t.grossMinor).toBe(12);
    expect(vatOf(2, 2100)).toBe(0);
  });

  it("více sazeb dává skupiny od nejvyšší, součty sedí", () => {
    const t = documentTotals([
      { quantity: 1, unitPriceMinor: 100_000_00, vatRateBp: 2100 },
      { quantity: 2, unitPriceMinor: 50_000_00, vatRateBp: 1200 },
      { quantity: 1, unitPriceMinor: 1_000_00, vatRateBp: 0 },
    ]);
    expect(t.groups.map((g) => g.vatRateBp)).toEqual([2100, 1200, 0]);
    expect(t.vatMinor).toBe(21_000_00 + 12_000_00);
    expect(t.grossMinor).toBe(100_000_00 + 21_000_00 + 100_000_00 + 12_000_00 + 1_000_00);
  });

  it("dobropis (záporné částky) se zaokrouhluje symetricky", () => {
    const t = documentTotals([{ quantity: 1, unitPriceMinor: -12_345, vatRateBp: 2100 }]);
    expect(t.vatMinor).toBe(-2592); // 2592,45 → −2592 (půl od nuly dolů v absolutní hodnotě)
    expect(t.grossMinor).toBe(-14_937);
  });

  it("stav úhrady podle plateb", () => {
    expect(paymentState(1000, 0)).toBe("issued");
    expect(paymentState(1000, 400)).toBe("partial");
    expect(paymentState(1000, 1000)).toBe("paid");
    expect(paymentState(1000, 1200)).toBe("paid");
  });
});

describe("přenesená daňová povinnost", () => {
  const lines = [
    { quantity: 1, unitPriceMinor: 100_000_00, vatRateBp: 2100 },
    { quantity: 2, unitPriceMinor: 50_000_00, vatRateBp: 1200 },
  ];
  it("všechny řádky bez DPH, jediná skupina se sazbou 0, celkem = základ", () => {
    const t = documentTotals(lines, { vatMode: "reverse_charge" });
    expect(t.groups).toEqual([
      { vatRateBp: 0, netMinor: 200_000_00, vatMinor: 0, grossMinor: 200_000_00 },
    ]);
    expect(t.vatMinor).toBe(0);
    expect(t.grossMinor).toBe(200_000_00);
  });
  it("běžný režim zůstává beze změny", () => {
    expect(documentTotals(lines).vatMinor).toBe(21_000_00 + 12_000_00);
    expect(documentTotals(lines, { vatMode: "standard" }).grossMinor).toBe(233_000_00);
  });
});

describe("zádržné", () => {
  it("počítá se po sazbách ze základu plnění v setinách procenta, zaokrouhleno na haléře", () => {
    const lines = [
      { quantity: 1, unitPriceMinor: 100_000_00, vatRateBp: 2100 },
      { quantity: 1, unitPriceMinor: 33_333, vatRateBp: 1200 },
    ];
    expect(retentionGroups(lines, 500)).toEqual([
      { vatRateBp: 2100, basisMinor: 100_000_00, retainMinor: 5_000_00 },
      { vatRateBp: 1200, basisMinor: 33_333, retainMinor: 1667 }, // 1666,65 → 1667
    ]);
    expect(retentionTotal(lines, 500)).toBe(5_000_00 + 1667);
    expect(retentionTotal(lines, 0)).toBe(0);
  });
  it("do základu nepatří zálohy, předchozí zádržné ani uvolnění; odpočet předchozích prací ano", () => {
    const lines = [
      { quantity: 1, unitPriceMinor: 300_000_00, vatRateBp: 2100, role: "work" as const },
      { quantity: 1, unitPriceMinor: -100_000_00, vatRateBp: 2100, role: "previous" as const },
      { quantity: 1, unitPriceMinor: -60_000_00, vatRateBp: 2100, role: "advance" as const },
      { quantity: 1, unitPriceMinor: -1, vatRateBp: 2100, role: "retention" as const },
    ];
    expect(retentionTotal(lines, 1000)).toBe(20_000_00); // 10 % z 200 000
  });
  it("záporný nebo nulový základ zádržné nedává", () => {
    expect(retentionTotal([{ quantity: 1, unitPriceMinor: -5_000, vatRateBp: 2100 }], 1000)).toBe(
      0,
    );
  });
  it("při přenesené daňové povinnosti jedna skupina se sazbou 0", () => {
    const lines = [
      { quantity: 1, unitPriceMinor: 100_000_00, vatRateBp: 2100 },
      { quantity: 1, unitPriceMinor: 50_000_00, vatRateBp: 1200 },
    ];
    expect(retentionGroups(lines, 1000, "reverse_charge")).toEqual([
      { vatRateBp: 0, basisMinor: 150_000_00, retainMinor: 15_000_00 },
    ]);
  });
  it("součty podle rolí", () => {
    const r = netByRole([
      { quantity: 1, unitPriceMinor: 100, vatRateBp: 0 },
      { quantity: 1, unitPriceMinor: -30, vatRateBp: 0, role: "advance" },
      { quantity: 1, unitPriceMinor: -7, vatRateBp: 0, role: "retention" },
    ]);
    expect(r).toMatchObject({ work: 100, advance: -30, retention: -7, previous: 0 });
  });
});

describe("rozdělení základu na sazby", () => {
  it("poměrem vah, zbytek po zaokrouhlení do největší skupiny, součet sedí", () => {
    const p = allocateByRate(
      10_000,
      [
        { vatRateBp: 2100, weight: 2 },
        { vatRateBp: 1200, weight: 1 },
      ],
      2100,
    );
    expect(p.reduce((a, x) => a + x.netMinor, 0)).toBe(10_000);
    expect(p[0]!.netMinor).toBe(6667);
    expect(p[1]!.netMinor).toBe(3333);
  });
  it("bez vah jedna skupina s výchozí sazbou", () => {
    expect(allocateByRate(500, [], 2100)).toEqual([{ vatRateBp: 2100, netMinor: 500 }]);
  });
});

describe("IBAN a QR platba", () => {
  it("český účet se převede na platný IBAN (ověřeno na známých příkladech)", () => {
    expect(czAccountToIban("19-2000145399/0800")).toBe("CZ6508000000192000145399");
    expect(czAccountToIban("123456789/0100")).toBe("CZ1801000000000123456789");
    expect(isValidIban("CZ6508000000192000145399")).toBe(true);
    expect(isValidIban("CZ1801000000000123456789")).toBe(true);
    expect(isValidIban("CZ6508000000192000145398")).toBe(false);
  });

  it("neplatné formáty dají null", () => {
    expect(czAccountToIban("")).toBeNull();
    expect(czAccountToIban("123456")).toBeNull();
    expect(czAccountToIban("DE89 3704 0044 0532 0130 00")).toBeNull();
  });

  it("SPD řetězec: částka s tečkou, VS jen číslice, zpráva bez diakritiky a hvězdiček", () => {
    expect(
      spdPayload({
        iban: "CZ6508000000192000145399",
        amountMinor: 12_345_50,
        currency: "CZK",
        variableSymbol: "FV-2026-0001",
        message: "Faktura č. 2026*1 – Příliš žluťoučký",
      }),
    ).toBe(
      "SPD*1.0*ACC:CZ6508000000192000145399*AM:12345.50*CC:CZK*X-VS:20260001*MSG:FAKTURA C. 2026 1 PRILIS ZLUTOUCKY",
    );
  });
});
