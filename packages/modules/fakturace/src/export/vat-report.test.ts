import { describe, expect, it } from "vitest";
import {
  vatBucket,
  vatCsv,
  vatRows,
  vatRowsOf,
  vatSheets,
  vatSummary,
  type VatDoc,
} from "./vat-report";

const doc = (over: Partial<VatDoc> = {}): VatDoc => ({
  id: crypto.randomUUID(),
  source: "issued",
  number: "FV-1",
  kindLabel: "vyúčtování",
  issueDate: "2026-10-09",
  taxableDate: "2026-10-05",
  partner: "Odběratel a.s.",
  ico: "87654321",
  dic: "CZ87654321",
  variableSymbol: "20260001",
  reverseCharge: false,
  outsideVat: false,
  currency: "CZK",
  groups: [{ vatRateBp: 2100, netMinor: 100_000, vatMinor: 21_000 }],
  ...over,
});

async function text(gen: AsyncGenerator<Buffer>) {
  const parts: Buffer[] = [];
  for await (const c of gen) parts.push(c);
  return Buffer.concat(parts).toString("utf8");
}

describe("členění podle sazeb", () => {
  it("sazby od nejvyšší, pak 0 %, přenesená daňová povinnost zvlášť, neplátce nakonec", () => {
    const std = { reverseCharge: false, outsideVat: false };
    const buckets = [
      vatBucket(0, std),
      vatBucket(1200, std),
      vatBucket(0, { reverseCharge: true, outsideVat: false }),
      vatBucket(2100, std),
      vatBucket(0, { reverseCharge: false, outsideVat: true }),
      vatBucket(1250, std),
    ].sort((a, b) => a.order - b.order);
    expect(buckets.map((b) => b.label)).toEqual([
      "21 %",
      "12,5 %",
      "12 %",
      "0 %",
      "přenesená daňová povinnost",
      "mimo DPH (neplátce)",
    ]);
    // PDP i neplátce mají stálý klíč bez ohledu na sazbu
    expect(vatBucket(2100, { reverseCharge: true, outsideVat: false }).key).toBe("pdp");
    expect(vatBucket(2100, { reverseCharge: false, outsideVat: true }).key).toBe("none");
  });

  it("doklad ve dvou sazbách dá dva řádky, nulová skupina se vynechá, jediná nulová zůstane", () => {
    const d = doc({
      groups: [
        { vatRateBp: 2100, netMinor: 100_000, vatMinor: 21_000 },
        { vatRateBp: 1200, netMinor: 50_000, vatMinor: 6_000 },
        { vatRateBp: 0, netMinor: 0, vatMinor: 0 },
      ],
    });
    const rows = vatRows(d);
    expect(rows.map((r) => [r.bucket.label, r.netMinor, r.vatMinor, r.grossMinor])).toEqual([
      ["21 %", 100_000, 21_000, 121_000],
      ["12 %", 50_000, 6_000, 56_000],
    ]);
    expect(rows.every((r) => r.docId === d.id)).toBe(true);
    expect(vatRows(doc({ groups: [{ vatRateBp: 0, netMinor: 0, vatMinor: 0 }] }))).toHaveLength(1);
    expect(
      vatRows(
        doc({ reverseCharge: true, groups: [{ vatRateBp: 0, netMinor: 5, vatMinor: 0 }] }),
      )[0]!.regime,
    ).toBe("přenesená daňová povinnost");
    expect(vatRows(doc({ outsideVat: true }))[0]!.regime).toBe("neplátce DPH");
  });

  it("řazení: vydané před přijatými, pak DUZP a číslo", () => {
    const rows = vatRowsOf([
      doc({ source: "received", number: "P-1", taxableDate: "2026-10-01" }),
      doc({ number: "FV-2", taxableDate: "2026-10-07" }),
      doc({ number: "FV-1", taxableDate: "2026-10-07" }),
      doc({ number: "FV-0", taxableDate: "2026-10-02" }),
    ]);
    expect(rows.map((r) => r.number)).toEqual(["FV-0", "FV-1", "FV-2", "P-1"]);
  });
});

describe("souhrn po sazbách", () => {
  const docs = [
    doc({
      number: "FV-1",
      groups: [
        { vatRateBp: 2100, netMinor: 100_000, vatMinor: 21_000 },
        { vatRateBp: 1200, netMinor: 50_000, vatMinor: 6_000 },
      ],
    }),
    doc({ number: "FV-2", groups: [{ vatRateBp: 2100, netMinor: 20_000, vatMinor: 4_200 }] }),
    doc({
      number: "DP-1",
      kindLabel: "dobropis",
      groups: [{ vatRateBp: 2100, netMinor: -10_000, vatMinor: -2_100 }],
    }),
    doc({
      number: "FV-3",
      reverseCharge: true,
      groups: [{ vatRateBp: 0, netMinor: 300_000, vatMinor: 0 }],
    }),
    doc({
      source: "received",
      number: "P-1",
      groups: [{ vatRateBp: 2100, netMinor: 40_000, vatMinor: 8_400 }],
    }),
    doc({
      source: "received",
      number: "P-2",
      reverseCharge: true,
      groups: [{ vatRateBp: 0, netMinor: 70_000, vatMinor: 0 }],
    }),
    doc({
      number: "FV-EUR",
      currency: "EUR",
      groups: [{ vatRateBp: 2100, netMinor: 1_000, vatMinor: 210 }],
    }),
  ];

  it("součty základu a daně z vydaných a přijatých po sazbách a měnách, rozdíl DPH, dobropis se odečte", () => {
    const s = vatSummary(vatRowsOf(docs));
    const pick = (source: string, currency: string, label: string) =>
      s.find((x) => x.source === source && x.currency === currency && x.label === label)!;
    expect(pick("issued", "CZK", "21 %")).toMatchObject({
      count: 3,
      netMinor: 110_000,
      vatMinor: 23_100,
      grossMinor: 133_100,
    });
    expect(pick("issued", "CZK", "12 %")).toMatchObject({
      count: 1,
      netMinor: 50_000,
      vatMinor: 6_000,
    });
    expect(pick("issued", "CZK", "přenesená daňová povinnost")).toMatchObject({
      count: 1,
      netMinor: 300_000,
      vatMinor: 0,
    });
    expect(pick("issued", "CZK", "Celkem")).toMatchObject({
      count: 4,
      netMinor: 460_000,
      vatMinor: 29_100,
    });
    expect(pick("received", "CZK", "21 %")).toMatchObject({ netMinor: 40_000, vatMinor: 8_400 });
    expect(pick("received", "CZK", "Celkem")).toMatchObject({ netMinor: 110_000, vatMinor: 8_400 });
    // výstup 291,00 − vstup 84,00
    expect(pick("difference", "CZK", "Výstup − vstup (orientačně)").vatMinor).toBe(20_700);
    // měny se nesčítají
    expect(pick("issued", "EUR", "Celkem")).toMatchObject({ netMinor: 1_000, vatMinor: 210 });
    expect(pick("difference", "EUR", "Výstup − vstup (orientačně)").vatMinor).toBe(210);
  });

  it("pořadí řádků souhrnu: sazby, celkem, pak přijaté, pak rozdíl", () => {
    const labels = vatSummary(vatRowsOf(docs))
      .filter((x) => x.currency === "CZK")
      .map((x) => `${x.source}:${x.label}`);
    expect(labels).toEqual([
      "issued:21 %",
      "issued:12 %",
      "issued:přenesená daňová povinnost",
      "issued:Celkem",
      "received:21 %",
      "received:přenesená daňová povinnost",
      "received:Celkem",
      "difference:Výstup − vstup (orientačně)",
    ]);
  });
});

describe("CSV podkladů DPH", () => {
  const docs = [
    doc({
      number: "FV-1",
      partner: '=HYPERLINK("http://x")',
      ico: "+420",
      groups: [
        { vatRateBp: 2100, netMinor: 100_000, vatMinor: 21_000 },
        { vatRateBp: 1250, netMinor: 12_345, vatMinor: 1_543 },
      ],
    }),
    doc({
      number: "DP-1",
      kindLabel: "dobropis",
      partner: "Novák; Syn",
      groups: [{ vatRateBp: 2100, netMinor: -5_000, vatMinor: -1_050 }],
    }),
  ];

  it("středník: BOM, desetinná čárka, česká data, vzorce zneškodněné, záporná čísla bez apostrofu, souhrn pod tabulkou", async () => {
    const out = await text(vatCsv(vatRowsOf(docs)));
    expect(out.startsWith("﻿Evidence;Číslo dokladu;Druh;DUZP;Vystaveno;Partner;")).toBe(true);
    const lines = out.split("\r\n");
    expect(lines.at(-1)).toBe("");
    expect(lines[1]).toBe(
      `Vydané;DP-1;dobropis;5. 10. 2026;9. 10. 2026;"Novák; Syn";87654321;CZ87654321;20260001;běžný;CZK;21 %;-50,00;-10,50;-60,50`,
    );
    // vzorec v partnerovi i v IČO je neutralizovaný, sazba 12,5 % a částky s čárkou
    expect(out).toContain(`;"'=HYPERLINK(""http://x"")";'+420;`);
    expect(out).toContain(";12,5 %;123,45;15,43;138,88");
    // souhrn pod prázdným řádkem, ve stejných sloupcích
    const emptyAt = lines.indexOf(";".repeat(14));
    expect(emptyAt).toBeGreaterThan(2);
    expect(lines[emptyAt + 1]).toMatch(/^Souhrn – vydané;počet 2;/);
    expect(out).toContain("Souhrn – vydané;počet 2;;;;;;;;;CZK;Celkem;");
  });

  it("čárka: desetinná tečka, data ve formátu ISO, buňky s čárkou v uvozovkách", async () => {
    const out = await text(vatCsv(vatRowsOf(docs), { delimiter: "," }));
    const lines = out.split("\r\n");
    expect(lines[0]).toBe(
      "﻿Evidence,Číslo dokladu,Druh,DUZP,Vystaveno,Partner,IČO,DIČ,Variabilní symbol,Režim DPH,Měna,Sazba DPH,Základ,DPH,Celkem",
    );
    expect(lines[1]).toBe(
      `Vydané,DP-1,dobropis,2026-10-05,2026-10-09,Novák; Syn,87654321,CZ87654321,20260001,běžný,CZK,21 %,-50.00,-10.50,-60.50`,
    );
    expect(out).toContain(`,"12,5 %",123.45,15.43,138.88`);
    expect(out).not.toMatch(/\d,\d\d(\r|,|$)/);
  });
});

describe("XLSX podkladů DPH", () => {
  it("listy Souhrn, Vydané, Přijaté: částky jako money, data jako date, řádek součtů", async () => {
    const docs = [
      doc({ number: "FV-1" }),
      doc({
        source: "received",
        number: "P-1",
        groups: [{ vatRateBp: 1200, netMinor: 1_000, vatMinor: 120 }],
      }),
    ];
    const sheets = vatSheets(vatRowsOf(docs), "1. 10. 2026 – 31. 10. 2026");
    expect(sheets.map((s) => s.name)).toEqual(["Souhrn", "Vydané", "Přijaté"]);
    const types = (i: number) => sheets[i]!.columns.map((c) => c.type);
    expect(types(1)).toEqual([
      "text",
      "text",
      "date",
      "date",
      "text",
      "text",
      "text",
      "text",
      "text",
      "text",
      "text",
      "money",
      "money",
      "money",
    ]);
    const issued = [...(sheets[1]!.rows as Iterable<readonly unknown[]>)];
    expect(issued).toEqual([
      [
        "FV-1",
        "vyúčtování",
        "2026-10-05",
        "2026-10-09",
        "Odběratel a.s.",
        "87654321",
        "CZ87654321",
        "20260001",
        "běžný",
        "CZK",
        "21 %",
        100_000,
        21_000,
        121_000,
      ],
    ]);
    expect(sheets[1]!.totals).toEqual([
      "Celkem",
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      100_000,
      21_000,
      121_000,
    ]);
    expect(sheets[1]!.title).toContain("1. 10. 2026 – 31. 10. 2026");
    // souhrn: Evidence, Měna, Sazba, Počet, Základ, DPH, Celkem
    const summary = [...(sheets[0]!.rows as Iterable<readonly unknown[]>)];
    expect(summary[0]).toEqual(["Vydané", "CZK", "21 %", 1, 100_000, 21_000, 121_000]);
    expect(summary.at(-1)).toEqual([
      "Rozdíl DPH",
      "CZK",
      "Výstup − vstup (orientačně)",
      null,
      null,
      20_880,
      null,
    ]);
  });

  it("řádek součtů se u listu s více měnami vynechá (součet různých měn nedává smysl)", () => {
    const sheets = vatSheets(
      vatRowsOf([doc({ number: "A" }), doc({ number: "B", currency: "EUR" })]),
      "x",
    );
    expect(sheets[1]!.totals).toBeUndefined();
  });
});
