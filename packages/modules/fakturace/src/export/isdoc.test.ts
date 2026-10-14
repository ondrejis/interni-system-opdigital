import { describe, expect, it } from "vitest";
import { isValidIban } from "../iban";
import {
  buildIsdoc,
  isdocAmount,
  isdocPercent,
  reconcileLineVat,
  splitStreet,
  xmlText,
  type IsdocInput,
} from "./isdoc";
import { documentTotals } from "../totals";
import {
  checkIsdocStructure,
  checkIsdocTotals,
  child,
  childAll,
  minorOf,
  parseXml,
  textOf,
} from "./testing/xml";

const supplier = {
  name: "Stavby Test s.r.o.",
  ico: "12345678",
  dic: "CZ12345678",
  street: "Hlavní 12/3a",
  city: "Plzeň",
  zip: "30100",
  email: "kancelar@stavby-test.example",
  phone: "+420 123 456 789",
  web: null,
  bankAccount: "19-2000145399/0800",
};
const customer = {
  name: "Odběratel a.s.",
  ico: "87654321",
  dic: "CZ87654321",
  street: "Dlouhá",
  city: "Praha",
  zip: "11000",
};

const line = (description: string, qty: number, priceMinor: number, rate: number) => {
  const net = Math.round(qty * priceMinor);
  const vat = Math.round((net * rate) / 10_000);
  return {
    description,
    quantity: qty,
    unit: "ks",
    unitPriceMinor: priceMinor,
    vatRateBp: rate,
    netMinor: net,
    vatMinor: vat,
  };
};

/** Doklad ze zadaných řádků; rekapitulace stejně jako na faktuře (DPH ze základu sazby). */
function input(over: Partial<IsdocInput> = {}): IsdocInput {
  const lines = over.lines ?? [line("Práce", 3, 100_000, 2100), line("Materiál", 1, 55_555, 1200)];
  const groups = documentTotals(
    lines.map((l) => ({
      quantity: l.quantity,
      unitPriceMinor: l.unitPriceMinor,
      vatRateBp: l.vatRateBp,
    })),
  ).groups;
  return {
    documentType: 1,
    number: "FV-2026-0001",
    uuid: "0199a3c4-6d3b-7c1e-9a52-4f0f6a9c1b2d",
    issueDate: "2026-10-09",
    taxPointDate: "2026-10-09",
    vatApplicable: true,
    note: "Děkujeme za spolupráci.",
    currency: "CZK",
    supplier,
    customer,
    lines,
    groups,
    payment: {
      dueDate: "2026-10-23",
      variableSymbol: "20260001",
      bankAccount: "19-2000145399/0800",
    },
    ...over,
  };
}

describe("ISDOC: struktura a součty", () => {
  it("vydaná faktura v jedné i dvou sazbách: kořen, jmenný prostor, pořadí prvků a součty sedí", () => {
    const xml = buildIsdoc(input());
    const root = parseXml(xml);
    checkIsdocStructure(root);
    checkIsdocTotals(root);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<Invoice xmlns=')).toBe(true);
    expect(textOf(root, "DocumentType")).toBe("1");
    expect(textOf(root, "ID")).toBe("FV-2026-0001");
    expect(textOf(root, "UUID")).toBe("0199a3c4-6d3b-7c1e-9a52-4f0f6a9c1b2d");
    expect(textOf(root, "LocalCurrencyCode")).toBe("CZK");
    expect(textOf(root, "CurrRate")).toBe("1");
    expect(textOf(root, "TaxPointDate")).toBe("2026-10-09");
    expect(textOf(root, "VATApplicable")).toBe("true");
    // 3 × 1 000,00 při 21 % a 555,55 při 12 %
    const subs = childAll(child(root, "TaxTotal")!, "TaxSubTotal");
    expect(subs.map((s) => textOf(child(s, "TaxCategory")!, "Percent"))).toEqual(["21", "12"]);
    expect(minorOf(subs[0]!, "TaxableAmount")).toBe(300_000);
    expect(minorOf(subs[0]!, "TaxAmount")).toBe(63_000);
    expect(minorOf(subs[1]!, "TaxableAmount")).toBe(55_555);
    expect(minorOf(subs[1]!, "TaxAmount")).toBe(6_667); // 6 666,6 → 66,67 Kč
    const m = child(root, "LegalMonetaryTotal")!;
    expect(textOf(m, "TaxExclusiveAmount")).toBe("3555.55");
    expect(textOf(m, "TaxInclusiveAmount")).toBe("4252.22");
    expect(textOf(m, "PayableAmount")).toBe("4252.22");
    // dodavatel a odběratel
    const sup = child(child(root, "AccountingSupplierParty")!, "Party")!;
    expect(textOf(child(sup, "PartyIdentification")!, "ID")).toBe("12345678");
    expect(textOf(child(sup, "PartyName")!, "Name")).toBe("Stavby Test s.r.o.");
    const addr = child(sup, "PostalAddress")!;
    expect(textOf(addr, "StreetName")).toBe("Hlavní");
    expect(textOf(addr, "BuildingNumber")).toBe("12/3a");
    expect(textOf(addr, "PostalZone")).toBe("30100");
    expect(textOf(child(addr, "Country")!, "IdentificationCode")).toBe("CZ");
    expect(textOf(child(sup, "PartyTaxScheme")!, "CompanyID")).toBe("CZ12345678");
    expect(textOf(child(sup, "Contact")!, "ElectronicMail")).toBe("kancelar@stavby-test.example");
    const cus = child(child(root, "AccountingCustomerParty")!, "Party")!;
    expect(textOf(child(cus, "PartyTaxScheme")!, "CompanyID")).toBe("CZ87654321");
    expect(textOf(child(child(cus, "PostalAddress")!, "Country")!, "Name")).toBe("Česká republika");
    // bez čísla domu zůstává celé v názvu ulice
    expect(textOf(child(cus, "PostalAddress")!, "StreetName")).toBe("Dlouhá");
    expect(textOf(child(cus, "PostalAddress")!, "BuildingNumber")).toBe("");
  });

  it("řádky: množství s jednotkou, částky s tečkou a dvěma místy, DPH řádků se doladí na rekapitulaci", () => {
    const lines = [
      line("A", 1, 333, 2100),
      line("B", 1, 333, 2100),
      line("C", 1, 333, 2100),
      line("D", 2.5, 4_001, 1200),
    ];
    const root = parseXml(buildIsdoc(input({ lines })));
    checkIsdocStructure(root);
    checkIsdocTotals(root);
    const l = childAll(child(root, "InvoiceLines")!, "InvoiceLine");
    expect(textOf(l[3]!, "InvoicedQuantity")).toBe("2.5");
    expect(child(l[3]!, "InvoicedQuantity")!.attrs).toEqual({ unitCode: "ks" });
    expect(textOf(l[3]!, "LineExtensionAmount")).toBe("100.03"); // 2,5 × 40,01 = 100,025 → 100,03
    expect(textOf(l[3]!, "UnitPrice")).toBe("40.01");
    expect(textOf(child(l[3]!, "ClassifiedTaxCategory")!, "Percent")).toBe("12");
    expect(textOf(child(l[3]!, "ClassifiedTaxCategory")!, "VATCalculationMethod")).toBe("0");
    expect(textOf(child(l[3]!, "Item")!, "Description")).toBe("D");
  });

  it("reconcileLineVat připíše haléřový rozdíl řádku s největším základem v dané sazbě", () => {
    const lines = [line("A", 1, 333, 2100), line("B", 1, 334, 2100), line("C", 1, 100, 1200)];
    const groups = [
      { vatRateBp: 2100, netMinor: 667, vatMinor: 140 }, // 667 × 21 % = 140,07 → 140
      { vatRateBp: 1200, netMinor: 100, vatMinor: 12 },
    ];
    const out = reconcileLineVat(lines, groups);
    // po řádcích 70 + 70 = 140 – sedí; rozdíl 0
    expect(out.map((l) => l.vatMinor)).toEqual([70, 70, 12]);
    const forced = reconcileLineVat(lines, [
      { vatRateBp: 2100, netMinor: 667, vatMinor: 141 },
      { vatRateBp: 1200, netMinor: 100, vatMinor: 12 },
    ]);
    expect(forced[1]!.vatMinor).toBe(71); // největší základ (334)
    expect(forced[1]!.grossMinor).toBe(334 + 71);
    expect(forced[0]!.vatMinor).toBe(70);
  });

  it("dobropis: typ 2, záporné částky, odkaz na původní doklad v poznámce", () => {
    const lines = [line("Práce", 1, -100_000, 2100)];
    const root = parseXml(
      buildIsdoc(
        input({
          documentType: 2,
          lines,
          note: "Opravný daňový doklad k faktuře FV-2026-0001 ze dne 1. 10. 2026.",
        }),
      ),
    );
    checkIsdocStructure(root);
    checkIsdocTotals(root);
    expect(textOf(root, "DocumentType")).toBe("2");
    expect(textOf(root, "Note")).toContain("FV-2026-0001");
    expect(textOf(child(root, "LegalMonetaryTotal")!, "TaxExclusiveAmount")).toBe("-1000.00");
    expect(textOf(child(root, "LegalMonetaryTotal")!, "PayableAmount")).toBe("-1210.00");
    expect(textOf(child(root, "TaxTotal")!, "TaxAmount")).toBe("-210.00");
  });

  it("zálohová faktura: typ 4 a bez data zdanitelného plnění", () => {
    const root = parseXml(buildIsdoc(input({ documentType: 4, taxPointDate: null })));
    checkIsdocStructure(root);
    expect(textOf(root, "DocumentType")).toBe("4");
    expect(child(root, "TaxPointDate")).toBeUndefined();
  });

  it("přenesená daňová povinnost: sazba 0, LocalReverseChargeFlag, doklad zůstává plátcovský", () => {
    const lines = [line("Zednické práce", 1, 250_000, 0)];
    const root = parseXml(
      buildIsdoc(
        input({
          lines,
          reverseCharge: true,
          note: "Daň odvede zákazník (§ 92a zákona č. 235/2004 Sb., o DPH).",
        }),
      ),
    );
    checkIsdocStructure(root);
    checkIsdocTotals(root);
    expect(textOf(root, "VATApplicable")).toBe("true");
    const sub = childAll(child(root, "TaxTotal")!, "TaxSubTotal");
    expect(sub).toHaveLength(1);
    const cat = child(sub[0]!, "TaxCategory")!;
    expect(textOf(cat, "Percent")).toBe("0");
    expect(textOf(cat, "VATApplicable")).toBe("true");
    expect(textOf(cat, "LocalReverseChargeFlag")).toBe("true");
    expect(textOf(child(root, "TaxTotal")!, "TaxAmount")).toBe("0.00");
    expect(textOf(child(root, "LegalMonetaryTotal")!, "TaxInclusiveAmount")).toBe("2500.00");
    expect(textOf(root, "Note")).toContain("§ 92a");
    // běžná faktura nese příznak false
    const normal = parseXml(buildIsdoc(input()));
    expect(
      textOf(
        child(child(normal, "TaxTotal")!, "TaxSubTotal")!.children.at(-1)!,
        "LocalReverseChargeFlag",
      ),
    ).toBe("false");
  });

  it("neplátce DPH: VATApplicable false, bez DIČ a bez data zdanitelného plnění", () => {
    const lines = [line("Služba", 1, 100_000, 0)];
    const root = parseXml(
      buildIsdoc(
        input({
          lines,
          vatApplicable: false,
          supplier: { ...supplier, dic: null },
          customer: { ...customer, dic: null },
        }),
      ),
    );
    checkIsdocStructure(root);
    checkIsdocTotals(root);
    expect(textOf(root, "VATApplicable")).toBe("false");
    expect(child(root, "TaxPointDate")).toBeUndefined();
    const sup = child(child(root, "AccountingSupplierParty")!, "Party")!;
    expect(child(sup, "PartyTaxScheme")).toBeUndefined();
    const cat = child(child(child(root, "TaxTotal")!, "TaxSubTotal")!, "TaxCategory")!;
    expect(textOf(cat, "VATApplicable")).toBe("false");
  });

  it("doklad bez řádků a bez částek má jednu nulovou rekapitulaci a souhrnný řádek (povinné prvky zůstanou)", () => {
    const root = parseXml(buildIsdoc(input({ lines: [], groups: [] })));
    checkIsdocStructure(root);
    checkIsdocTotals(root);
    expect(childAll(child(root, "InvoiceLines")!, "InvoiceLine")).toHaveLength(1);
    expect(childAll(child(root, "TaxTotal")!, "TaxSubTotal")).toHaveLength(1);
    expect(textOf(child(root, "LegalMonetaryTotal")!, "PayableAmount")).toBe("0.00");
  });
});

describe("ISDOC: platba", () => {
  it("číslo účtu se rozdělí na účet a kód banky, IBAN je platný, variabilní symbol a splatnost jsou v Details", () => {
    const root = parseXml(buildIsdoc(input()));
    checkIsdocStructure(root);
    const d = child(child(child(root, "PaymentMeans")!, "Payment")!, "Details")!;
    expect(textOf(d, "PaymentDueDate")).toBe("2026-10-23");
    expect(textOf(d, "ID")).toBe("19-2000145399");
    expect(textOf(d, "BankCode")).toBe("0800");
    expect(isValidIban(textOf(d, "IBAN")!)).toBe(true);
    expect(textOf(d, "IBAN")).toMatch(/^CZ\d{22}$/);
    expect(textOf(d, "VariableSymbol")).toBe("20260001");
    expect(textOf(child(child(root, "PaymentMeans")!, "Payment")!, "PaymentMeansCode")).toBe("42");
    expect(textOf(child(child(root, "PaymentMeans")!, "Payment")!, "PaidAmount")).toBe("4252.22");
  });

  it("bez účtu zůstanou povinné prvky bankovního spojení prázdné; bez platby se PaymentMeans vynechá", () => {
    const noAccount = parseXml(
      buildIsdoc(input({ payment: { dueDate: null, variableSymbol: null, bankAccount: null } })),
    );
    checkIsdocStructure(noAccount);
    const d = child(child(child(noAccount, "PaymentMeans")!, "Payment")!, "Details")!;
    expect(textOf(d, "ID")).toBe("");
    expect(textOf(d, "IBAN")).toBe("");
    expect(child(d, "PaymentDueDate")).toBeUndefined();
    expect(child(parseXml(buildIsdoc(input({ payment: null }))), "PaymentMeans")).toBeUndefined();
  });
});

describe("ISDOC: XML injection a nepovolené znaky", () => {
  it("texty z dokladu se vždy escapují, žádný prvek ani atribut z nich nevznikne", () => {
    const evil = '</Name><Injected attr="1"/><![CDATA[x]]> & "a" \'b\' <!-- c -->';
    const root = parseXml(
      buildIsdoc(
        input({
          number: `FV</ID><Evil/>${"&"}1`,
          note: `${evil}\n</Note><Evil2/>`,
          supplier: { ...supplier, name: evil, city: "<script>alert(1)</script>" },
          customer: { ...customer, name: `${evil}`, street: `"><Evil3/> 5` },
          lines: [
            {
              ...line('Položka "x" <b>&</b>', 1, 1_000, 2100),
              unit: 'ks" onload="alert(1)',
            },
          ],
          payment: { dueDate: null, variableSymbol: `1"/><X/>`, bankAccount: null },
        }),
      ),
    );
    checkIsdocStructure(root);
    const all: string[] = [];
    const walk = (n: ReturnType<typeof parseXml>) => {
      all.push(n.name);
      n.children.forEach(walk);
    };
    walk(root);
    for (const bad of ["Evil", "Evil2", "Evil3", "Injected", "script", "X", "b"])
      expect(all, bad).not.toContain(bad);
    expect(textOf(root, "ID")).toBe("FV</ID><Evil/>&1");
    expect(textOf(root, "Note")).toBe(`${evil}\n</Note><Evil2/>`);
    const sup = child(child(root, "AccountingSupplierParty")!, "Party")!;
    expect(textOf(child(sup, "PartyName")!, "Name")).toBe(evil);
    expect(textOf(child(sup, "PostalAddress")!, "CityName")).toBe("<script>alert(1)</script>");
    const l = child(child(root, "InvoiceLines")!, "InvoiceLine")!;
    expect(child(l, "InvoicedQuantity")!.attrs).toEqual({ unitCode: 'ks" onload="alert(1)' });
    expect(textOf(child(l, "Item")!, "Description")).toBe('Položka "x" <b>&</b>');
  });

  it("řídicí znaky a nepárové surrogáty se zahodí, platné znaky (české, emoji) zůstanou", () => {
    expect(xmlText("a\u0000b\u0001c\u000Bd\u001Fe￾f￿g")).toBe("abcdefg");
    expect(xmlText("x\uD800y")).toBe("xy"); // nepárový surrogát
    expect(xmlText("Žluťoučký kůň 🐴\tTab")).toBe("Žluťoučký kůň 🐴\tTab");
    expect(xmlText('<a href="x">&\'</a>')).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;",
    );
    expect(xmlText("řádek1\r\nřádek2\nřádek3")).toBe("řádek1&#10;řádek2&#10;řádek3");
    const root = parseXml(buildIsdoc(input({ note: "a\u0000b\nc 🐴" })));
    expect(textOf(root, "Note")).toBe("ab\nc 🐴");
  });
});

describe("ISDOC: pomocné funkce", () => {
  it("částky z haléřů bez plovoucí čárky a se znaménkem", () => {
    expect(isdocAmount(0)).toBe("0.00");
    expect(isdocAmount(5)).toBe("0.05");
    expect(isdocAmount(-5)).toBe("-0.05");
    expect(isdocAmount(123_456)).toBe("1234.56");
    expect(isdocAmount(-100)).toBe("-1.00");
    expect(isdocAmount(10_000_000_000_001)).toBe("100000000000.01");
    expect(isdocPercent(2100)).toBe("21");
    expect(isdocPercent(1250)).toBe("12.5");
    expect(isdocPercent(0)).toBe("0");
  });

  it("rozdělení ulice na název a číslo domu", () => {
    expect(splitStreet("Hlavní 1")).toEqual({ name: "Hlavní", number: "1" });
    expect(splitStreet("Na Příkopě 12/3a")).toEqual({ name: "Na Příkopě", number: "12/3a" });
    expect(splitStreet("5. května 12")).toEqual({ name: "5. května", number: "12" });
    expect(splitStreet("Dlouhá")).toEqual({ name: "Dlouhá", number: "" });
    expect(splitStreet("Nám. Republiky")).toEqual({ name: "Nám. Republiky", number: "" });
    expect(splitStreet(null)).toEqual({ name: "", number: "" });
  });
});
