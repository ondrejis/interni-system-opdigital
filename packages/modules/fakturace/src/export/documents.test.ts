import { describe, expect, it } from "vitest";
import { documentTotals } from "../totals";
import {
  inferRateBp,
  issuedGroups,
  issuedIsdoc,
  issuedVatDoc,
  receivedFromPayer,
  receivedGroups,
  receivedIsdoc,
  receivedVatDoc,
  type InvoiceLineRow,
  type InvoiceRow,
  type IssuedBundle,
  type ReceivedBundle,
  type ReceivedLineRow,
  type ReceivedRow,
} from "./documents";
import { buildIsdoc } from "./isdoc";
import { checkIsdocStructure, checkIsdocTotals, child, parseXml, textOf } from "./testing/xml";

const party = (name: string, dic: string | null = "CZ11111111") => ({
  name,
  ico: "11111111",
  dic,
  street: "Hlavní 1",
  city: "Plzeň",
  zip: "30100",
  bankAccount: "123456789/0100",
});

/** Řádek faktury (jen pole, která převody čtou). */
const il = (description: string, qty: string, price: number, rate: number): InvoiceLineRow => {
  const net = Math.round(Number(qty) * price);
  const vat = Math.round((net * rate) / 10_000);
  return {
    id: crypto.randomUUID(),
    invoiceId: "inv",
    position: 0,
    description,
    quantity: qty,
    unit: "ks",
    unitPriceMinor: price,
    vatRateBp: rate,
    netMinor: net,
    vatMinor: vat,
    grossMinor: net + vat,
    budgetItemId: null,
    role: "work",
    refInvoiceId: null,
  };
};

const invoiceRow = (over: Partial<InvoiceRow>, lines: InvoiceLineRow[]): InvoiceRow => {
  const t = documentTotals(
    lines.map((l) => ({
      quantity: l.quantity,
      unitPriceMinor: l.unitPriceMinor,
      vatRateBp: l.vatRateBp,
    })),
    { vatMode: (over.vatMode as "standard" | "reverse_charge" | undefined) ?? "standard" },
  );
  return {
    id: "0199a3c4-6d3b-7c1e-9a52-4f0f6a9c1b2d",
    number: "FV-1",
    title: "Faktura",
    kind: "final",
    state: "issued",
    issueDate: "2026-10-09",
    taxableDate: "2026-10-08",
    dueDate: "2026-10-23",
    currency: "CZK",
    variableSymbol: "20260001",
    note: null,
    netMinor: t.netMinor,
    vatMinor: t.vatMinor,
    grossMinor: t.grossMinor,
    vatMode: "standard",
    originalInvoiceId: null,
    ...over,
  } as InvoiceRow;
};

const bundle = (row: InvoiceRow, lines: InvoiceLineRow[], over: Partial<IssuedBundle> = {}) =>
  ({
    row,
    lines,
    supplier: party("Dodavatel s.r.o."),
    customer: party("Odběratel a.s.", "CZ22222222"),
    payer: true,
    original: null,
    defaultNote: "",
    reverseChargeCpa: "",
    ...over,
  }) satisfies IssuedBundle;

describe("rekapitulace DPH", () => {
  it("odhad sazby z dokladu bez řádků: přichytí na známou sazbu, jinak zaokrouhlí", () => {
    expect(inferRateBp(10_000, 2_100)).toBe(2100);
    expect(inferRateBp(10_001, 2_100)).toBe(2100);
    expect(inferRateBp(10_000, 1_200)).toBe(1200);
    expect(inferRateBp(10_000, 0)).toBe(0);
    expect(inferRateBp(0, 0)).toBe(0);
    expect(inferRateBp(10_000, 1_750)).toBe(1750);
  });

  it("vydaná faktura: základ po sazbách z řádků, DPH ze základu sazby; PDP vše pod sazbou 0", () => {
    const lines = [
      il("A", "1", 33_333, 2100),
      il("B", "2", 10_000, 1200),
      il("C", "1", 5_000, 2100),
    ];
    const g = issuedGroups(invoiceRow({}, lines), lines);
    expect(g).toEqual([
      { vatRateBp: 2100, netMinor: 38_333, vatMinor: 8_050 }, // 8 049,93 → 80,50
      { vatRateBp: 1200, netMinor: 20_000, vatMinor: 2_400 },
    ]);
    const pdp = issuedGroups(invoiceRow({ vatMode: "reverse_charge" }, lines), lines);
    expect(pdp).toEqual([{ vatRateBp: 0, netMinor: 58_333, vatMinor: 0 }]);
  });

  it("vydaná faktura bez řádků: jedna skupina z hlavičky", () => {
    const row = invoiceRow({ netMinor: 10_000, vatMinor: 2_100, grossMinor: 12_100 }, []);
    expect(issuedGroups(row, [])).toEqual([{ vatRateBp: 2100, netMinor: 10_000, vatMinor: 2_100 }]);
  });

  const rl = (net: number, rate: number, vat: number): ReceivedLineRow =>
    ({
      id: crypto.randomUUID(),
      invoiceId: "r",
      position: 0,
      description: "Řádek",
      sectionId: null,
      itemId: null,
      category: "material",
      netMinor: net,
      vatRateBp: rate,
      vatMinor: vat,
      grossMinor: net + vat,
    }) as ReceivedLineRow;
  const rrow = (over: Partial<ReceivedRow>): ReceivedRow =>
    ({
      id: "0199a3c4-6d3b-7c1e-9a52-4f0f6a9c1b2e",
      number: "P-1",
      state: "approved",
      issueDate: "2026-10-01",
      taxableDate: "2026-10-01",
      receivedDate: null,
      dueDate: "2026-10-15",
      currency: "CZK",
      variableSymbol: "555",
      constantSymbol: null,
      note: null,
      vatMode: "standard",
      createdAt: new Date("2026-10-02T10:00:00Z"),
      ...over,
    }) as ReceivedRow;

  it("přijatá faktura: DPH z hlavičky je závazné, rozdíl proti řádkům jde největší sazbě", () => {
    const lines = [rl(10_000, 2100, 2_100), rl(5_000, 1200, 600)];
    // dodavatel na dokladu uvedl DPH 2 701 (o 1 haléř víc než součet řádků)
    const row = rrow({ netMinor: 15_000, grossMinor: 17_701, vatMinor: 2_701 });
    expect(receivedGroups(row, lines)).toEqual([
      { vatRateBp: 2100, netMinor: 10_000, vatMinor: 2_101 },
      { vatRateBp: 1200, netMinor: 5_000, vatMinor: 600 },
    ]);
  });

  it("přijatá faktura v PDP a bez řádků", () => {
    const lines = [rl(10_000, 2100, 0), rl(5_000, 1200, 0)];
    const pdp = rrow({
      netMinor: 15_000,
      grossMinor: 15_000,
      vatMinor: 0,
      vatMode: "reverse_charge",
    });
    expect(receivedGroups(pdp, lines)).toEqual([{ vatRateBp: 0, netMinor: 15_000, vatMinor: 0 }]);
    const none = rrow({ netMinor: 10_000, grossMinor: 12_100, vatMinor: 2_100 });
    expect(receivedGroups(none, [])).toEqual([
      { vatRateBp: 2100, netMinor: 10_000, vatMinor: 2_100 },
    ]);
  });
});

describe("převod vydané faktury na ISDOC", () => {
  it("běžná faktura: typ 1, uložené údaje, UUID z id, poznámka z dokladu, struktura i součty", () => {
    const lines = [il("Práce", "3", 100_000, 2100), il("Materiál", "1", 55_555, 1200)];
    const row = invoiceRow({ note: "Poznámka k dokladu" }, lines);
    const xml = buildIsdoc(issuedIsdoc(bundle(row, lines)));
    const root = parseXml(xml);
    checkIsdocStructure(root);
    checkIsdocTotals(root);
    expect(textOf(root, "DocumentType")).toBe("1");
    expect(textOf(root, "UUID")).toBe(row.id);
    expect(textOf(root, "ID")).toBe("FV-1");
    expect(textOf(root, "TaxPointDate")).toBe("2026-10-08");
    expect(textOf(root, "Note")).toBe("Poznámka k dokladu");
    const pay = child(child(root, "PaymentMeans")!, "Payment")!;
    expect(textOf(child(pay, "Details")!, "BankCode")).toBe("0100");
    expect(textOf(child(pay, "Details")!, "VariableSymbol")).toBe("20260001");
  });

  it("dobropis: typ 2 a v poznámce odkaz na původní doklad a jeho datum", () => {
    const lines = [il("Práce", "1", -100_000, 2100)];
    const row = invoiceRow({ kind: "credit_note", number: "DP-1" }, lines);
    const doc = issuedIsdoc(
      bundle(row, lines, { original: { number: "FV-1", issueDate: "2026-10-01" } }),
    );
    expect(doc.documentType).toBe(2);
    expect(doc.note).toBe("Opravný daňový doklad k faktuře FV-1 ze dne 1. 10. 2026.");
    const root = parseXml(buildIsdoc(doc));
    checkIsdocStructure(root);
    checkIsdocTotals(root);
  });

  it("zálohová faktura: typ 4, bez DUZP a s upozorněním, že nejde o daňový doklad", () => {
    const lines = [il("Záloha", "1", 100_000, 2100)];
    const doc = issuedIsdoc(bundle(invoiceRow({ kind: "proforma" }, lines), lines));
    expect(doc.documentType).toBe(4);
    expect(doc.taxPointDate).toBeNull();
    expect(doc.note).toContain("nejde o daňový doklad");
  });

  it("přenesená daňová povinnost: sazba 0, příznak, text § 92a a kód CZ-CPA v poznámce", () => {
    const lines = [il("Zednické práce", "1", 250_000, 2100)];
    const row = invoiceRow({ vatMode: "reverse_charge" }, lines);
    const doc = issuedIsdoc(bundle(row, lines, { reverseChargeCpa: "43" }));
    expect(doc.reverseCharge).toBe(true);
    expect(doc.lines.every((l) => l.vatRateBp === 0)).toBe(true);
    expect(doc.note).toContain("§ 92a");
    expect(doc.note).toContain("CZ-CPA): 43");
    const root = parseXml(buildIsdoc(doc));
    checkIsdocStructure(root);
    checkIsdocTotals(root);
    expect(textOf(child(root, "TaxTotal")!, "TaxAmount")).toBe("0.00");
  });

  it("neplátce: VATApplicable false a poznámka; doklad bez řádků dostane souhrnný řádek", () => {
    const row = invoiceRow(
      { netMinor: 50_000, vatMinor: 0, grossMinor: 50_000, title: "Oprava" },
      [],
    );
    const doc = issuedIsdoc(bundle(row, [], { payer: false, defaultNote: "Děkujeme" }));
    expect(doc.vatApplicable).toBe(false);
    expect(doc.note).toBe("Děkujeme\nDodavatel není plátcem DPH.");
    expect(doc.lines).toHaveLength(1);
    expect(doc.lines[0]!.description).toBe("Oprava");
    const root = parseXml(buildIsdoc(doc));
    checkIsdocStructure(root);
    checkIsdocTotals(root);
  });
});

describe("převod přijaté faktury na ISDOC", () => {
  const rbundle = (
    row: ReceivedRow,
    lines: ReceivedLineRow[],
    over: Partial<ReceivedBundle> = {},
  ) =>
    ({
      row,
      lines,
      supplier: party("Dodavatel Materiál s.r.o.", "CZ87654321"),
      customer: party("Naše firma s.r.o."),
      ...over,
    }) satisfies ReceivedBundle;
  const rrow = (over: Partial<ReceivedRow>): ReceivedRow =>
    ({
      id: "0199a3c4-6d3b-7c1e-9a52-4f0f6a9c1b2e",
      number: "P-1",
      state: "approved",
      issueDate: "2026-10-01",
      taxableDate: "2026-09-30",
      receivedDate: "2026-10-03",
      dueDate: "2026-10-15",
      currency: "CZK",
      variableSymbol: "555",
      constantSymbol: "308",
      note: "Na zakázku Rekonstrukce",
      vatMode: "standard",
      netMinor: 15_000,
      vatMinor: 2_701,
      grossMinor: 17_701,
      createdAt: new Date("2026-10-04T10:00:00Z"),
      ...over,
    }) as ReceivedRow;
  const line = (net: number, rate: number, vat: number) =>
    ({
      description: "Cement",
      netMinor: net,
      vatRateBp: rate,
      vatMinor: vat,
    }) as ReceivedLineRow;

  it("dodavatel = snapshot dodavatele, odběratel = firma klienta; součty drží i s haléřovým rozdílem", () => {
    const lines = [line(10_000, 2100, 2_100), line(5_000, 1200, 600)];
    const doc = receivedIsdoc(rbundle(rrow({}), lines));
    expect(doc.supplier.name).toBe("Dodavatel Materiál s.r.o.");
    expect(doc.customer.name).toBe("Naše firma s.r.o.");
    expect(doc.number).toBe("P-1");
    expect(doc.documentType).toBe(1);
    expect(doc.taxPointDate).toBe("2026-09-30");
    const root = parseXml(buildIsdoc(doc));
    checkIsdocStructure(root);
    // hlavička: 15 000 + 2 701; po rekapitulaci sedí na haléř
    expect(textOf(child(root, "TaxTotal")!, "TaxAmount")).toBe("27.01");
    expect(textOf(child(root, "LegalMonetaryTotal")!, "PayableAmount")).toBe("177.01");
    expect(textOf(root, "Note")).toBe("Na zakázku Rekonstrukce");
    const det = child(child(child(root, "PaymentMeans")!, "Payment")!, "Details")!;
    expect(textOf(det, "ConstantSymbol")).toBe("308");
  });

  it("PDP a plátcovství dodavatele, záporná faktura je opravný doklad, chybějící datum vystavení", () => {
    const pdp = rrow({ vatMode: "reverse_charge", vatMinor: 0, grossMinor: 15_000 });
    const d = receivedIsdoc(rbundle(pdp, [line(15_000, 2100, 0)]));
    expect(d.reverseCharge).toBe(true);
    expect(d.vatApplicable).toBe(true);
    expect(d.note).toContain("§ 92a");
    expect(d.lines[0]!.vatRateBp).toBe(0);

    const neg = rrow({ netMinor: -15_000, vatMinor: -3_150, grossMinor: -18_150 });
    expect(receivedIsdoc(rbundle(neg, [])).documentType).toBe(2);

    const noDate = rrow({ issueDate: null });
    expect(receivedIsdoc(rbundle(noDate, [])).issueDate).toBe("2026-10-03");
    expect(
      receivedIsdoc(rbundle(rrow({ issueDate: null, receivedDate: null, taxableDate: null }), []))
        .issueDate,
    ).toBe("2026-10-04");

    const nonPayer = rrow({ vatMinor: 0, grossMinor: 15_000 });
    const s = { ...party("Neplátce"), dic: null };
    expect(receivedFromPayer(nonPayer, s)).toBe(false);
    expect(receivedIsdoc(rbundle(nonPayer, [], { supplier: s })).note).toContain("není plátcem");
    // bez splatnosti, symbolů a účtu se platba vynechá
    const bare = rrow({ dueDate: null, variableSymbol: null, constantSymbol: null });
    expect(
      receivedIsdoc(rbundle(bare, [], { supplier: { ...s, bankAccount: null } })).payment,
    ).toBeNull();
  });
});

describe("převod na doklad pro podklady DPH", () => {
  it("vydaná: odběratel jako partner, druh, režim a skupiny; přijatá: dodavatel jako partner", () => {
    const lines = [il("Práce", "1", 100_000, 2100)];
    const v = issuedVatDoc(bundle(invoiceRow({ kind: "credit_note" }, lines), lines));
    expect(v).toMatchObject({
      source: "issued",
      kindLabel: "dobropis",
      partner: "Odběratel a.s.",
      dic: "CZ22222222",
      taxableDate: "2026-10-08",
      reverseCharge: false,
      outsideVat: false,
    });
    const r = receivedVatDoc({
      row: {
        id: "x",
        number: "P-9",
        issueDate: "2026-10-01",
        taxableDate: null,
        variableSymbol: null,
        vatMode: "reverse_charge",
        currency: "CZK",
        netMinor: 100,
        vatMinor: 0,
        grossMinor: 100,
        receivedDate: null,
        createdAt: new Date(),
      } as ReceivedRow,
      lines: [],
      supplier: party("Dodavatel"),
      customer: party("Naše"),
    });
    expect(r).toMatchObject({
      source: "received",
      partner: "Dodavatel",
      taxableDate: "2026-10-01",
      reverseCharge: true,
      kindLabel: "faktura",
    });
  });
});
