import { expect } from "vitest";

/**
 * Pomocníci testů ISDOC: jednoduchý parser XML (dobře utvářenost, entity, atributy) a kontrola struktury dokladu.
 * Oficiální XSD ISDOC 6.0.2 v repozitáři není a bez sítě ho nejde stáhnout, proto je pořadí prvků a povinnost
 * přepsaná z dokumentace formátu (sekvence `xs:sequence`), ne vygenerovaná z XSD. Test tedy hlídá, že výstup drží
 * tuto předlohu; plnou shodu s XSD je potřeba ověřit validátorem (viz dokumentace exportů).
 */
export type XNode = {
  name: string;
  attrs: Record<string, string>;
  children: XNode[];
  /** Text prvku bez potomků (přesně, včetně mezer); u prvků s potomky prázdný. */
  text: string;
};

const ENTITY = /&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g;
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/;

function decode(raw: string): string {
  if (/&(?!(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);)/.test(raw))
    throw new Error(`Neescapované „&“ v textu: ${raw.slice(0, 40)}`);
  return raw.replace(ENTITY, (_m, e: string) => {
    if (e.startsWith("#x")) return String.fromCodePoint(parseInt(e.slice(2), 16));
    if (e.startsWith("#")) return String.fromCodePoint(parseInt(e.slice(1), 10));
    return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[e]!;
  });
}

/** Rozparsuje dokument s jedním kořenem; při chybě utvářenosti vyhodí výjimku. */
export function parseXml(xml: string): XNode {
  if (FORBIDDEN_CHARS.test(xml)) throw new Error("XML obsahuje nepovolený znak.");
  if (!xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'))
    throw new Error("Chybí XML deklarace.");
  const token = /<\/([\w:-]+)>|<([\w:-]+)((?:\s+[\w:-]+="[^"<]*")*)\s*(\/?)>|([^<]+)/gy;
  token.lastIndex = xml.indexOf("?>") + 2;
  const stack: XNode[] = [];
  let root: XNode | null = null;
  while (token.lastIndex < xml.length) {
    const start = token.lastIndex;
    const m = token.exec(xml);
    if (!m) throw new Error(`Neplatné XML na pozici ${start}: ${xml.slice(start, start + 40)}`);
    if (m[1] !== undefined) {
      const n = stack.pop();
      if (!n || n.name !== m[1]) throw new Error(`Nesouhlasí koncová značka ${m[1]}`);
    } else if (m[2] !== undefined) {
      const attrs: Record<string, string> = {};
      for (const a of (m[3] ?? "").matchAll(/\s+([\w:-]+)="([^"]*)"/g))
        attrs[a[1]!] = decode(a[2]!);
      const node: XNode = { name: m[2], attrs, children: [], text: "" };
      const parent = stack[stack.length - 1];
      if (parent) parent.children.push(node);
      else if (root) throw new Error("Víc kořenových prvků.");
      else root = node;
      if (!m[4]) stack.push(node);
    } else {
      const text = m[5]!;
      const parent = stack[stack.length - 1];
      if (!parent) {
        if (text.trim()) throw new Error("Text mimo kořenový prvek.");
      } else if (text.trim() || !parent.children.length) parent.text += decode(text);
    }
  }
  if (stack.length) throw new Error(`Nezavřený prvek ${stack[stack.length - 1]!.name}`);
  if (!root) throw new Error("Prázdný dokument.");
  // prvek s potomky nemá mít vlastní text (mixed content)
  const check = (n: XNode) => {
    if (n.children.length && n.text.trim()) throw new Error(`Smíšený obsah v ${n.name}`);
    n.children.forEach(check);
  };
  check(root);
  return root;
}

export const child = (n: XNode, name: string): XNode | undefined =>
  n.children.find((c) => c.name === name);
export const childAll = (n: XNode, name: string): XNode[] =>
  n.children.filter((c) => c.name === name);
export const textOf = (n: XNode, name: string): string | undefined => child(n, name)?.text;
/** Částka prvku v haléřích (`"-12.10"` → `-1210`). */
export const minorOf = (n: XNode, name: string): number => {
  const t = textOf(n, name);
  if (t === undefined) throw new Error(`Chybí prvek ${name}`);
  return Math.round(Number(t) * 100);
};

type Spec = { order: readonly string[]; required: readonly string[] };

/** Pořadí (`xs:sequence`) a povinnost prvků, které generátor používá. */
const SPEC: Record<string, Spec> = {
  Invoice: {
    order: [
      "DocumentType",
      "ID",
      "UUID",
      "IssuingSystem",
      "IssueDate",
      "TaxPointDate",
      "VATApplicable",
      "Note",
      "LocalCurrencyCode",
      "CurrRate",
      "RefCurrRate",
      "AccountingSupplierParty",
      "AccountingCustomerParty",
      "InvoiceLines",
      "TaxTotal",
      "LegalMonetaryTotal",
      "PaymentMeans",
    ],
    required: [
      "DocumentType",
      "ID",
      "UUID",
      "IssueDate",
      "VATApplicable",
      "LocalCurrencyCode",
      "CurrRate",
      "RefCurrRate",
      "AccountingSupplierParty",
      "AccountingCustomerParty",
      "InvoiceLines",
      "TaxTotal",
      "LegalMonetaryTotal",
    ],
  },
  AccountingSupplierParty: { order: ["Party"], required: ["Party"] },
  AccountingCustomerParty: { order: ["Party"], required: ["Party"] },
  Party: {
    order: ["PartyIdentification", "PartyName", "PostalAddress", "PartyTaxScheme", "Contact"],
    required: ["PartyIdentification", "PartyName", "PostalAddress"],
  },
  PartyIdentification: { order: ["ID"], required: ["ID"] },
  PartyName: { order: ["Name"], required: ["Name"] },
  PostalAddress: {
    order: ["StreetName", "BuildingNumber", "CityName", "PostalZone", "Country"],
    required: ["StreetName", "BuildingNumber", "CityName", "PostalZone", "Country"],
  },
  Country: { order: ["IdentificationCode", "Name"], required: ["IdentificationCode", "Name"] },
  PartyTaxScheme: { order: ["CompanyID", "TaxScheme"], required: ["CompanyID", "TaxScheme"] },
  Contact: { order: ["Telephone", "ElectronicMail"], required: [] },
  InvoiceLines: { order: ["InvoiceLine"], required: ["InvoiceLine"] },
  InvoiceLine: {
    order: [
      "ID",
      "InvoicedQuantity",
      "LineExtensionAmount",
      "LineExtensionAmountTaxInclusive",
      "LineExtensionTaxAmount",
      "UnitPrice",
      "UnitPriceTaxInclusive",
      "ClassifiedTaxCategory",
      "Item",
    ],
    required: [
      "ID",
      "InvoicedQuantity",
      "LineExtensionAmount",
      "LineExtensionAmountTaxInclusive",
      "LineExtensionTaxAmount",
      "UnitPrice",
      "UnitPriceTaxInclusive",
      "ClassifiedTaxCategory",
    ],
  },
  ClassifiedTaxCategory: {
    order: ["Percent", "VATCalculationMethod"],
    required: ["Percent", "VATCalculationMethod"],
  },
  Item: { order: ["Description"], required: ["Description"] },
  TaxTotal: { order: ["TaxSubTotal", "TaxAmount"], required: ["TaxSubTotal", "TaxAmount"] },
  TaxSubTotal: {
    order: [
      "TaxableAmount",
      "TaxAmount",
      "TaxInclusiveAmount",
      "AlreadyClaimedTaxableAmount",
      "AlreadyClaimedTaxAmount",
      "AlreadyClaimedTaxInclusiveAmount",
      "DifferenceTaxableAmount",
      "DifferenceTaxAmount",
      "DifferenceTaxInclusiveAmount",
      "TaxCategory",
    ],
    required: [
      "TaxableAmount",
      "TaxAmount",
      "TaxInclusiveAmount",
      "AlreadyClaimedTaxableAmount",
      "AlreadyClaimedTaxAmount",
      "AlreadyClaimedTaxInclusiveAmount",
      "DifferenceTaxableAmount",
      "DifferenceTaxAmount",
      "DifferenceTaxInclusiveAmount",
      "TaxCategory",
    ],
  },
  TaxCategory: {
    order: ["Percent", "TaxScheme", "VATApplicable", "LocalReverseChargeFlag"],
    required: ["Percent", "TaxScheme", "VATApplicable", "LocalReverseChargeFlag"],
  },
  LegalMonetaryTotal: {
    order: [
      "TaxExclusiveAmount",
      "TaxInclusiveAmount",
      "AlreadyClaimedTaxExclusiveAmount",
      "AlreadyClaimedTaxInclusiveAmount",
      "DifferenceTaxExclusiveAmount",
      "DifferenceTaxInclusiveAmount",
      "PayableRoundingAmount",
      "PaidDepositsAmount",
      "PayableAmount",
    ],
    required: [
      "TaxExclusiveAmount",
      "TaxInclusiveAmount",
      "AlreadyClaimedTaxExclusiveAmount",
      "AlreadyClaimedTaxInclusiveAmount",
      "DifferenceTaxExclusiveAmount",
      "DifferenceTaxInclusiveAmount",
      "PayableRoundingAmount",
      "PaidDepositsAmount",
      "PayableAmount",
    ],
  },
  PaymentMeans: { order: ["Payment"], required: ["Payment"] },
  Payment: {
    order: ["PaidAmount", "PaymentMeansCode", "Details"],
    required: ["PaidAmount", "PaymentMeansCode"],
  },
  Details: {
    order: [
      "PaymentDueDate",
      "ID",
      "BankCode",
      "Name",
      "IBAN",
      "BIC",
      "VariableSymbol",
      "ConstantSymbol",
      "SpecificSymbol",
    ],
    required: ["ID", "BankCode", "Name", "IBAN", "BIC"],
  },
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const AMOUNT = /^-?\d+\.\d{2}$/;
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Typy hodnot podle XSD (datum, částka, pravdivostní hodnota, UUID…). */
const VALUE: Record<string, RegExp> = {
  DocumentType: /^[1-7]$/,
  UUID,
  IssueDate: DATE,
  TaxPointDate: DATE,
  PaymentDueDate: DATE,
  VATApplicable: /^(true|false)$/,
  LocalReverseChargeFlag: /^(true|false)$/,
  LocalCurrencyCode: /^[A-Z]{3}$/,
  CurrRate: /^\d+(\.\d+)?$/,
  RefCurrRate: /^\d+(\.\d+)?$/,
  TaxScheme: /^(VAT|TIN)$/,
  Percent: /^\d+(\.\d+)?$/,
  VATCalculationMethod: /^[01]$/,
  PaymentMeansCode: /^\d+$/,
  IdentificationCode: /^[A-Z]{2}$/,
  LineExtensionAmount: AMOUNT,
  LineExtensionAmountTaxInclusive: AMOUNT,
  LineExtensionTaxAmount: AMOUNT,
  UnitPrice: AMOUNT,
  UnitPriceTaxInclusive: AMOUNT,
  TaxableAmount: AMOUNT,
  TaxAmount: AMOUNT,
  TaxInclusiveAmount: AMOUNT,
  AlreadyClaimedTaxableAmount: AMOUNT,
  AlreadyClaimedTaxAmount: AMOUNT,
  AlreadyClaimedTaxInclusiveAmount: AMOUNT,
  DifferenceTaxableAmount: AMOUNT,
  DifferenceTaxAmount: AMOUNT,
  DifferenceTaxInclusiveAmount: AMOUNT,
  TaxExclusiveAmount: AMOUNT,
  AlreadyClaimedTaxExclusiveAmount: AMOUNT,
  DifferenceTaxExclusiveAmount: AMOUNT,
  PayableRoundingAmount: AMOUNT,
  PaidDepositsAmount: AMOUNT,
  PayableAmount: AMOUNT,
  PaidAmount: AMOUNT,
};

function checkNode(n: XNode, path: string) {
  const spec = SPEC[n.name];
  if (spec) {
    const names = n.children.map((c) => c.name);
    let last = -1;
    for (const c of names) {
      const idx = spec.order.indexOf(c);
      expect(idx, `${path}/${n.name}: neznámý nebo nepovolený prvek ${c}`).toBeGreaterThan(-1);
      expect(idx, `${path}/${n.name}: prvek ${c} je ve špatném pořadí`).toBeGreaterThanOrEqual(
        last,
      );
      last = idx;
    }
    for (const r of spec.required) expect(names, `${path}/${n.name}: chybí ${r}`).toContain(r);
  }
  const value = VALUE[n.name];
  if (value && !n.children.length)
    expect(n.text, `${path}/${n.name}: hodnota neodpovídá typu`).toMatch(value);
  n.children.forEach((c) => checkNode(c, `${path}/${n.name}`));
}

/** Zkontroluje kořen, jmenný prostor, verzi, pořadí a povinnost prvků a typy hodnot. */
export function checkIsdocStructure(root: XNode): void {
  expect(root.name).toBe("Invoice");
  expect(root.attrs).toEqual({ xmlns: "http://isdoc.cz/namespace/2013", version: "6.0.2" });
  checkNode(root, "");
  const q = child(root, "InvoiceLines")!;
  q.children.forEach((l) =>
    expect(child(l, "InvoicedQuantity")!.attrs.unitCode, "unitCode").toBeTruthy(),
  );
}

/** Součty dokladu: řádky = základ, DPH po sazbách = DPH řádků = TaxAmount, vč. = základ + DPH, k úhradě = vč. */
export function checkIsdocTotals(root: XNode): void {
  const lines = childAll(child(root, "InvoiceLines")!, "InvoiceLine");
  const sum = (f: (l: XNode) => number) => lines.reduce((a, l) => a + f(l), 0);
  const net = sum((l) => minorOf(l, "LineExtensionAmount"));
  const lineVat = sum((l) => minorOf(l, "LineExtensionTaxAmount"));
  const lineGross = sum((l) => minorOf(l, "LineExtensionAmountTaxInclusive"));
  const tax = child(root, "TaxTotal")!;
  const subs = childAll(tax, "TaxSubTotal");
  const m = child(root, "LegalMonetaryTotal")!;
  expect(minorOf(m, "TaxExclusiveAmount"), "TaxExclusiveAmount = součet řádků").toBe(net);
  expect(
    subs.reduce((a, s) => a + minorOf(s, "TaxableAmount"), 0),
    "součet základů podle sazeb",
  ).toBe(net);
  expect(minorOf(tax, "TaxAmount"), "TaxAmount = součet DPH podle sazeb").toBe(
    subs.reduce((a, s) => a + minorOf(s, "TaxAmount"), 0),
  );
  expect(minorOf(tax, "TaxAmount"), "TaxAmount = součet DPH řádků").toBe(lineVat);
  expect(minorOf(m, "TaxInclusiveAmount")).toBe(
    minorOf(m, "TaxExclusiveAmount") + minorOf(tax, "TaxAmount"),
  );
  expect(lineGross).toBe(net + lineVat);
  expect(minorOf(m, "PayableAmount")).toBe(minorOf(m, "TaxInclusiveAmount"));
  for (const s of subs) {
    expect(minorOf(s, "TaxInclusiveAmount")).toBe(
      minorOf(s, "TaxableAmount") + minorOf(s, "TaxAmount"),
    );
    // DPH po sazbě odpovídá sazbě ze základu (půl nahoru, haléře)
    const pct = Number(textOf(child(s, "TaxCategory")!, "Percent"));
    const base = minorOf(s, "TaxableAmount");
    if (textOf(child(s, "TaxCategory")!, "VATApplicable") === "true" && pct > 0) {
      const expected = Math.sign(base) * Math.round((Math.abs(base) * pct) / 100);
      expect(minorOf(s, "TaxAmount"), `DPH ${pct} %`).toBe(expected);
    }
  }
}
