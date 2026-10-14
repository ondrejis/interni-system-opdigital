import { czAccountToIban } from "../iban";
import type { PartySnapshot } from "../schema";

/**
 * ISDOC 6.0.2 – český standard elektronické faktury (https://isdoc.cz). Čistý generátor XML bez závislostí:
 * z hotových údajů dokladu složí řetězec, nesahá do databáze. Pořadí prvků odpovídá XSD `isdoc-invoice-6.0.2.xsd`
 * (sekvence `xs:sequence`, takže pořadí je závazné). Oficiální XSD v repozitáři není, proto se struktura hlídá testem
 * (`isdoc.test.ts`), ne validátorem; viz poznámky v dokumentaci exportů.
 *
 * Rozhodnutí:
 * - Částky jsou v měně dokladu s tečkou a dvěma desetinnými místy (u cizí měny je měna dokladu uvedena jako místní
 *   `LocalCurrencyCode` s kurzem 1, protože kurz k přepočtu systém neeviduje).
 * - Přenesená daňová povinnost: doklad je `VATApplicable=true`, řádky a rekapitulace mají sazbu 0 a rekapitulace nese
 *   `LocalReverseChargeFlag=true`; text § 92a je navíc v poznámce.
 * - Dodavatel a odběratel jsou uložené údaje z dokladu (vystavený doklad se nemění ani při změně adresy firmy).
 */
export const ISDOC_NAMESPACE = "http://isdoc.cz/namespace/2013";
export const ISDOC_VERSION = "6.0.2";
export const ISDOC_ISSUING_SYSTEM = "Firemní systém – Fakturace";

/** 1 = faktura (daňový doklad), 2 = opravný daňový doklad (dobropis), 4 = zálohová faktura (nedaňový zálohový list). */
export type IsdocDocumentType = 1 | 2 | 4;

export type IsdocLine = {
  description: string;
  quantity: string | number;
  unit: string;
  unitPriceMinor: number;
  /** Sazba DPH v setinách procenta (21 % = 2100); u přenesené daňové povinnosti 0. */
  vatRateBp: number;
  netMinor: number;
  vatMinor: number;
};

/** Rekapitulace DPH jedné sazby: závazná je ze základu skupiny (ne součet DPH po řádcích). */
export type IsdocVatGroup = { vatRateBp: number; netMinor: number; vatMinor: number };

export type IsdocPayment = {
  dueDate: string | null;
  variableSymbol: string | null;
  constantSymbol?: string | null;
  /** České číslo účtu `19-2000145399/0800` (předčíslí je nepovinné). */
  bankAccount: string | null;
};

export type IsdocInput = {
  documentType: IsdocDocumentType;
  /** Číslo dokladu (u přijaté faktury číslo dodavatele). */
  number: string;
  /** Stálý identifikátor dokladu (UUID); stejný doklad dává při každém exportu stejné UUID. */
  uuid: string;
  issueDate: string;
  /** Datum zdanitelného plnění; neuvádí se u neplátce a u zálohové faktury. */
  taxPointDate?: string | null;
  /** Doklad plátce DPH (`true`), nebo neplátce (`false`). */
  vatApplicable: boolean;
  /** Přenesená daňová povinnost: sazba 0 a příznak v rekapitulaci. */
  reverseCharge?: boolean;
  note?: string | null;
  currency: string;
  supplier: PartySnapshot;
  customer: PartySnapshot;
  lines: readonly IsdocLine[];
  groups: readonly IsdocVatGroup[];
  payment?: IsdocPayment | null;
  issuingSystem?: string;
};

/** Znak povolený v XML 1.0: tabulátor, nový řádek, návrat vozíku a znaky od mezery (mimo surrogáty, U+FFFE a U+FFFF). */
function validXmlChar(cp: number): boolean {
  return (
    cp === 0x9 ||
    cp === 0xa ||
    cp === 0xd ||
    (cp >= 0x20 && cp <= 0xd7ff) ||
    (cp >= 0xe000 && cp <= 0xfffd) ||
    (cp >= 0x10000 && cp <= 0x10ffff)
  );
}

/** Zahodí znaky, které XML 1.0 nepřipouští (řídicí znaky, nepárové surrogáty). */
function stripInvalidXml(s: string): string {
  let out = "";
  for (const ch of s) if (validXmlChar(ch.codePointAt(0)!)) out += ch;
  return out;
}

/**
 * Text do obsahu prvku nebo atributu: zahodí nepovolené znaky a escapuje `& < > " '`. Zalomení řádku jde jako znaková
 * reference `&#10;`, aby ho odsazení výstupu nezměnilo (parser ho vrátí zpět jako nový řádek).
 */
export function xmlText(value: unknown): string {
  return stripInvalidXml(String(value ?? ""))
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/\r\n|\r|\n/g, "&#10;");
}

/** Částka z haléřů na koruny: tečka, dvě desetinná místa, bez plovoucí čárky (`-5` → `-0.05`). */
export function isdocAmount(minor: number): string {
  const v = Math.round(minor);
  const abs = Math.abs(v);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${v < 0 ? "-" : ""}${whole}.${frac}`;
}

/** Sazba v setinách procenta na procenta (`2100` → `21`, `1250` → `12.5`). */
export function isdocPercent(bp: number): string {
  return String(Math.round(bp) / 100);
}

/** Množství s nejvýš třemi desetinnými místy bez zbytečných nul. */
function isdocQuantity(q: string | number): string {
  const n = Number(q);
  if (!Number.isFinite(n)) return "0";
  return String(Math.round(n * 1000) / 1000);
}

/** Ulice a číslo domu: číslo je poslední slovo začínající číslicí (`Na Příkopě 12/3a`), jinak je celé v názvu ulice. */
export function splitStreet(street: string | null | undefined): { name: string; number: string } {
  const s = (street ?? "").trim();
  const m = /^(.*\S)\s+(\d[\p{L}\p{N}/.-]*)$/u.exec(s);
  return m ? { name: m[1]!, number: m[2]! } : { name: s, number: "" };
}

/**
 * Sladí DPH řádků se rekapitulací: v každé sazbě se rozdíl (haléřové zaokrouhlení) připíše řádku s největším základem,
 * takže součet DPH řádků sedí na `TaxAmount` rekapitulace. Vrací nové řádky se základem, DPH a celkem.
 */
export function reconcileLineVat(
  lines: readonly IsdocLine[],
  groups: readonly IsdocVatGroup[],
): (IsdocLine & { grossMinor: number })[] {
  const out = lines.map((l) => ({ ...l, grossMinor: l.netMinor + l.vatMinor }));
  for (const g of groups) {
    const inGroup = out.filter((l) => l.vatRateBp === g.vatRateBp);
    if (!inGroup.length) continue;
    const diff = g.vatMinor - inGroup.reduce((a, l) => a + l.vatMinor, 0);
    if (diff === 0) continue;
    const target = inGroup.reduce((a, l) => (Math.abs(l.netMinor) > Math.abs(a.netMinor) ? l : a));
    target.vatMinor += diff;
    target.grossMinor += diff;
  }
  return out;
}

/* ---------- stavba XML ---------- */

const indent = (xml: string) =>
  xml
    .split("\n")
    .map((l) => `  ${l}`)
    .join("\n");

/** Prvek s textem; `null`/`undefined` = prvek se vynechá. */
function leaf(name: string, value: unknown, attrs = ""): string {
  return value === null || value === undefined
    ? ""
    : `<${name}${attrs}>${xmlText(value)}</${name}>`;
}

/** Prvek s potomky; prázdní potomci se vynechají, bez potomků se vynechá i prvek. */
function node(name: string, ...children: string[]): string {
  const body = children.filter(Boolean);
  return body.length ? `<${name}>\n${indent(body.join("\n"))}\n</${name}>` : "";
}

function party(p: PartySnapshot): string {
  const street = splitStreet(p.street);
  const dic = p.dic?.trim();
  const contact = node(
    "Contact",
    leaf("Telephone", p.phone?.trim() || null),
    leaf("ElectronicMail", p.email?.trim() || null),
  );
  return node(
    "Party",
    node("PartyIdentification", leaf("ID", p.ico?.trim() ?? "")),
    node("PartyName", leaf("Name", p.name)),
    node(
      "PostalAddress",
      leaf("StreetName", street.name),
      leaf("BuildingNumber", street.number),
      leaf("CityName", p.city?.trim() ?? ""),
      leaf("PostalZone", p.zip?.trim() ?? ""),
      node("Country", leaf("IdentificationCode", "CZ"), leaf("Name", "Česká republika")),
    ),
    dic ? node("PartyTaxScheme", leaf("CompanyID", dic), leaf("TaxScheme", "VAT")) : "",
    contact,
  );
}

function payment(p: IsdocPayment, payableMinor: number): string {
  const account = /^\s*(?:(\d{1,6})-)?(\d{2,10})\/(\d{4})\s*$/.exec(p.bankAccount ?? "");
  const iban = czAccountToIban(p.bankAccount);
  const details = node(
    "Details",
    leaf("PaymentDueDate", p.dueDate),
    leaf("ID", account ? `${account[1] ? `${account[1]}-` : ""}${account[2]}` : ""),
    leaf("BankCode", account?.[3] ?? ""),
    // název banky a BIC systém neeviduje; prvky jsou v XSD povinné, proto zůstávají prázdné
    leaf("Name", ""),
    leaf("IBAN", iban ?? ""),
    leaf("BIC", ""),
    leaf("VariableSymbol", p.variableSymbol?.trim() || null),
    leaf("ConstantSymbol", p.constantSymbol?.trim() || null),
  );
  return node(
    "PaymentMeans",
    node(
      "Payment",
      leaf("PaidAmount", isdocAmount(payableMinor)),
      leaf("PaymentMeansCode", 42),
      details,
    ),
  );
}

/** Složí dokument ISDOC 6.0.2 jako řetězec XML (UTF-8). */
export function buildIsdoc(d: IsdocInput): string {
  const groups = d.groups.length ? d.groups : [{ vatRateBp: 0, netMinor: 0, vatMinor: 0 }];
  // doklad bez řádků dostane jeden souhrnný řádek za sazbu (InvoiceLines je v XSD povinné)
  const sourceLines: readonly IsdocLine[] = d.lines.length
    ? d.lines
    : groups.map((g) => ({
        description: "Fakturované plnění",
        quantity: 1,
        unit: "ks",
        unitPriceMinor: g.netMinor,
        vatRateBp: g.vatRateBp,
        netMinor: g.netMinor,
        vatMinor: g.vatMinor,
      }));
  const lines = reconcileLineVat(sourceLines, groups);
  const net = groups.reduce((a, g) => a + g.netMinor, 0);
  const vat = groups.reduce((a, g) => a + g.vatMinor, 0);
  const gross = net + vat;
  const reverse = d.reverseCharge === true;

  const invoiceLines = node(
    "InvoiceLines",
    ...lines.map((l, i) => {
      const unitGross = l.unitPriceMinor + Math.round((l.unitPriceMinor * l.vatRateBp) / 10_000);
      return node(
        "InvoiceLine",
        leaf("ID", i + 1),
        leaf("InvoicedQuantity", isdocQuantity(l.quantity), ` unitCode="${xmlText(l.unit)}"`),
        leaf("LineExtensionAmount", isdocAmount(l.netMinor)),
        leaf("LineExtensionAmountTaxInclusive", isdocAmount(l.grossMinor)),
        leaf("LineExtensionTaxAmount", isdocAmount(l.vatMinor)),
        leaf("UnitPrice", isdocAmount(l.unitPriceMinor)),
        leaf("UnitPriceTaxInclusive", isdocAmount(unitGross)),
        node(
          "ClassifiedTaxCategory",
          leaf("Percent", isdocPercent(l.vatRateBp)),
          // 0 = DPH se počítá ze základu („zdola“), jak to dělají faktury v systému
          leaf("VATCalculationMethod", 0),
        ),
        node("Item", leaf("Description", l.description)),
      );
    }),
  );

  const taxTotal = node(
    "TaxTotal",
    ...groups.map((g) =>
      node(
        "TaxSubTotal",
        leaf("TaxableAmount", isdocAmount(g.netMinor)),
        leaf("TaxAmount", isdocAmount(g.vatMinor)),
        leaf("TaxInclusiveAmount", isdocAmount(g.netMinor + g.vatMinor)),
        leaf("AlreadyClaimedTaxableAmount", isdocAmount(0)),
        leaf("AlreadyClaimedTaxAmount", isdocAmount(0)),
        leaf("AlreadyClaimedTaxInclusiveAmount", isdocAmount(0)),
        leaf("DifferenceTaxableAmount", isdocAmount(g.netMinor)),
        leaf("DifferenceTaxAmount", isdocAmount(g.vatMinor)),
        leaf("DifferenceTaxInclusiveAmount", isdocAmount(g.netMinor + g.vatMinor)),
        node(
          "TaxCategory",
          leaf("Percent", isdocPercent(g.vatRateBp)),
          leaf("TaxScheme", "VAT"),
          leaf("VATApplicable", d.vatApplicable),
          leaf("LocalReverseChargeFlag", reverse),
        ),
      ),
    ),
    leaf("TaxAmount", isdocAmount(vat)),
  );

  const monetary = node(
    "LegalMonetaryTotal",
    leaf("TaxExclusiveAmount", isdocAmount(net)),
    leaf("TaxInclusiveAmount", isdocAmount(gross)),
    leaf("AlreadyClaimedTaxExclusiveAmount", isdocAmount(0)),
    leaf("AlreadyClaimedTaxInclusiveAmount", isdocAmount(0)),
    leaf("DifferenceTaxExclusiveAmount", isdocAmount(net)),
    leaf("DifferenceTaxInclusiveAmount", isdocAmount(gross)),
    leaf("PayableRoundingAmount", isdocAmount(0)),
    leaf("PaidDepositsAmount", isdocAmount(0)),
    leaf("PayableAmount", isdocAmount(gross)),
  );

  const body = [
    leaf("DocumentType", d.documentType),
    leaf("ID", d.number),
    leaf("UUID", d.uuid),
    leaf("IssuingSystem", d.issuingSystem ?? ISDOC_ISSUING_SYSTEM),
    leaf("IssueDate", d.issueDate),
    leaf("TaxPointDate", d.vatApplicable ? d.taxPointDate || null : null),
    leaf("VATApplicable", d.vatApplicable),
    leaf("Note", d.note?.trim() || null),
    leaf("LocalCurrencyCode", d.currency),
    leaf("CurrRate", 1),
    leaf("RefCurrRate", 1),
    node("AccountingSupplierParty", party(d.supplier)),
    node("AccountingCustomerParty", party(d.customer)),
    invoiceLines,
    taxTotal,
    monetary,
    d.payment ? payment(d.payment, gross) : "",
  ].filter(Boolean);

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<Invoice xmlns="${ISDOC_NAMESPACE}" version="${ISDOC_VERSION}">\n${indent(body.join("\n"))}\n</Invoice>\n`
  );
}
