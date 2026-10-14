import { and, asc, inArray, isNull } from "drizzle-orm";
import type { ModuleDeps } from "@rebar/core/module-server";
import type { Ctx } from "@rebar/core/rbac";
import { formatDate } from "@rebar/core/shared";
import { customerNow, isVatPayer, supplierNow } from "../billing/core";
import { invoice, invoiceLine, receivedInvoice, receivedInvoiceLine } from "../schema";
import type { PartySnapshot } from "../schema";
import { fakturaceSetting } from "../settings";
import { documentTotals, effectiveRateBp, REVERSE_CHARGE_TEXT, type VatMode } from "../totals";
import { KIND_LABEL } from "./common";
import type { IsdocDocumentType, IsdocInput, IsdocLine, IsdocVatGroup } from "./isdoc";
import type { VatDoc } from "./vat-report";

/**
 * Doklady pro účetní exporty: načtení vydaných a přijatých faktur s řádky a převod na vstup ISDOC a podkladů DPH.
 * Převody (`issuedIsdoc`, `receivedIsdoc`, …) jsou čisté funkce, bez databáze, takže jdou testovat samostatně.
 */
export type InvoiceRow = typeof invoice.$inferSelect;
export type InvoiceLineRow = typeof invoiceLine.$inferSelect;
export type ReceivedRow = typeof receivedInvoice.$inferSelect;
export type ReceivedLineRow = typeof receivedInvoiceLine.$inferSelect;

export type IssuedBundle = {
  row: InvoiceRow;
  lines: InvoiceLineRow[];
  supplier: PartySnapshot;
  customer: PartySnapshot;
  /** Dodavatel (firma klienta) je plátce DPH. */
  payer: boolean;
  /** Původní doklad dobropisu. */
  original: { number: string | null; issueDate: string | null } | null;
  /** Poznámka pod položkami z nastavení fakturace (když doklad nemá vlastní). */
  defaultNote: string;
  reverseChargeCpa: string;
};

export type ReceivedBundle = {
  row: ReceivedRow;
  lines: ReceivedLineRow[];
  supplier: PartySnapshot;
  /** Odběratel = firma klienta. */
  customer: PartySnapshot;
};

/* ---------- sazby ---------- */

const STANDARD_RATES_BP = [0, 1000, 1200, 1500, 2100];

/**
 * Sazba odvozená ze základu a DPH dokladu bez řádků (záloha pro doklad, který řádky nemá). Blízká známé sazbě
 * se přichytí na ni (haléřové zaokrouhlení), jinak se vrátí zaokrouhlená na setiny procenta.
 */
export function inferRateBp(netMinor: number, vatMinor: number): number {
  if (netMinor === 0 || vatMinor === 0) return 0;
  const raw = (vatMinor * 10_000) / netMinor;
  const near = STANDARD_RATES_BP.find((r) => Math.abs(r - raw) <= 30);
  return near ?? Math.round(raw);
}

/** Přičte rozdíl (zaokrouhlení) k největší skupině podle základu. */
function pushDiff(groups: IsdocVatGroup[], diffMinor: number) {
  if (diffMinor === 0 || !groups.length) return;
  const target = groups.reduce((a, g) => (Math.abs(g.netMinor) > Math.abs(a.netMinor) ? g : a));
  target.vatMinor += diffMinor;
}

/** Rekapitulace DPH vydané faktury: základ po sazbách z řádků, DPH ze základu sazby (jak ji počítá doklad). */
export function issuedGroups(row: InvoiceRow, lines: readonly InvoiceLineRow[]): IsdocVatGroup[] {
  const mode = row.vatMode as VatMode;
  if (!lines.length) {
    return [
      {
        vatRateBp: mode === "reverse_charge" ? 0 : inferRateBp(row.netMinor, row.vatMinor),
        netMinor: row.netMinor,
        vatMinor: row.vatMinor,
      },
    ];
  }
  return documentTotals(
    lines.map((l) => ({
      quantity: l.quantity,
      unitPriceMinor: l.unitPriceMinor,
      vatRateBp: l.vatRateBp,
    })),
    { vatMode: mode },
  ).groups.map((g) => ({ vatRateBp: g.vatRateBp, netMinor: g.netMinor, vatMinor: g.vatMinor }));
}

/**
 * Rekapitulace DPH přijaté faktury: řádky po sazbách; DPH v hlavičce (celkem − základ, zadaná podle dokladu dodavatele)
 * je závazné, rozdíl proti součtu řádků se připíše největší skupině.
 */
export function receivedGroups(
  row: ReceivedRow,
  lines: readonly ReceivedLineRow[],
): IsdocVatGroup[] {
  const reverse = row.vatMode === "reverse_charge";
  const headerVat = reverse ? 0 : row.grossMinor - row.netMinor;
  if (!lines.length)
    return [
      {
        vatRateBp: reverse ? 0 : inferRateBp(row.netMinor, headerVat),
        netMinor: row.netMinor,
        vatMinor: headerVat,
      },
    ];
  const byRate = new Map<number, IsdocVatGroup>();
  for (const l of lines) {
    const rate = reverse ? 0 : l.vatRateBp;
    const g = byRate.get(rate) ?? { vatRateBp: rate, netMinor: 0, vatMinor: 0 };
    g.netMinor += l.netMinor;
    g.vatMinor += reverse ? 0 : l.vatMinor;
    byRate.set(rate, g);
  }
  const groups = [...byRate.values()].sort((a, b) => b.vatRateBp - a.vatRateBp);
  pushDiff(groups, headerVat - groups.reduce((a, g) => a + g.vatMinor, 0));
  return groups;
}

/* ---------- ISDOC ---------- */

const BLANK_PARTY: PartySnapshot = {
  name: "—",
  ico: null,
  dic: null,
  street: null,
  city: null,
  zip: null,
};

function issuedDocType(kind: string): IsdocDocumentType {
  return kind === "credit_note" ? 2 : kind === "proforma" ? 4 : 1;
}

/** Vstup generátoru ISDOC pro vydanou fakturu. */
export function issuedIsdoc(b: IssuedBundle): IsdocInput {
  const { row } = b;
  const mode = row.vatMode as VatMode;
  const reverse = mode === "reverse_charge";
  const documentType = issuedDocType(row.kind);
  const groups = issuedGroups(row, b.lines);
  const lines: IsdocLine[] = b.lines.length
    ? b.lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unit: l.unit,
        unitPriceMinor: l.unitPriceMinor,
        vatRateBp: effectiveRateBp(l.vatRateBp, mode),
        netMinor: l.netMinor,
        vatMinor: l.vatMinor,
      }))
    : [
        {
          description: row.title || `Faktura ${row.number ?? ""}`.trim(),
          quantity: 1,
          unit: "ks",
          unitPriceMinor: row.netMinor,
          vatRateBp: groups[0]!.vatRateBp,
          netMinor: row.netMinor,
          vatMinor: row.vatMinor,
        },
      ];
  const note = [
    row.note || b.defaultNote,
    documentType === 2 && b.original?.number
      ? `Opravný daňový doklad k faktuře ${b.original.number}${
          b.original.issueDate ? ` ze dne ${formatDate(b.original.issueDate)}` : ""
        }.`
      : "",
    documentType === 4 ? "Zálohová faktura, nejde o daňový doklad." : "",
    reverse
      ? `${REVERSE_CHARGE_TEXT}.${b.reverseChargeCpa ? ` Kód klasifikace produkce (CZ-CPA): ${b.reverseChargeCpa}.` : ""}`
      : "",
    b.payer ? "" : "Dodavatel není plátcem DPH.",
  ]
    .filter(Boolean)
    .join("\n");
  return {
    documentType,
    number: row.number ?? "",
    uuid: row.id,
    issueDate: row.issueDate ?? "",
    taxPointDate: documentType === 4 ? null : (row.taxableDate ?? row.issueDate),
    vatApplicable: b.payer,
    reverseCharge: reverse,
    note,
    currency: row.currency,
    supplier: b.supplier,
    customer: b.customer,
    lines,
    groups,
    payment: {
      dueDate: row.dueDate,
      variableSymbol: row.variableSymbol,
      bankAccount: b.supplier.bankAccount ?? null,
    },
  };
}

/** Dodavatel přijaté faktury je plátce, když má DIČ, nebo když na dokladu vyznačil DPH / přenesl daňovou povinnost. */
export function receivedFromPayer(row: ReceivedRow, supplier: PartySnapshot): boolean {
  return Boolean(supplier.dic?.trim()) || row.vatMinor !== 0 || row.vatMode === "reverse_charge";
}

/** Datum vystavení přijaté faktury: když chybí, nejbližší jiné datum dokladu (ISDOC ho vyžaduje). */
function receivedIssueDate(row: ReceivedRow): string {
  return (
    row.issueDate ??
    row.receivedDate ??
    row.taxableDate ??
    (row.createdAt ? row.createdAt.toISOString().slice(0, 10) : "")
  );
}

/** Vstup generátoru ISDOC pro přijatou fakturu (dodavatel = snapshot dodavatele, odběratel = firma klienta). */
export function receivedIsdoc(b: ReceivedBundle): IsdocInput {
  const { row } = b;
  const reverse = row.vatMode === "reverse_charge";
  const payer = receivedFromPayer(row, b.supplier);
  const groups = receivedGroups(row, b.lines);
  const lines: IsdocLine[] = b.lines.length
    ? b.lines.map((l) => ({
        description: l.description,
        quantity: 1,
        unit: "ks",
        unitPriceMinor: l.netMinor,
        vatRateBp: reverse ? 0 : l.vatRateBp,
        netMinor: l.netMinor,
        vatMinor: reverse ? 0 : l.vatMinor,
      }))
    : [
        {
          description: `Přijatá faktura ${row.number}`,
          quantity: 1,
          unit: "ks",
          unitPriceMinor: row.netMinor,
          vatRateBp: groups[0]!.vatRateBp,
          netMinor: row.netMinor,
          vatMinor: groups[0]!.vatMinor,
        },
      ];
  const note = [
    row.note ?? "",
    reverse ? `${REVERSE_CHARGE_TEXT}.` : "",
    payer ? "" : "Dodavatel není plátcem DPH.",
  ]
    .filter(Boolean)
    .join("\n");
  const issueDate = receivedIssueDate(row);
  return {
    documentType: row.netMinor < 0 ? 2 : 1,
    number: row.number,
    uuid: row.id,
    issueDate,
    taxPointDate: row.taxableDate ?? issueDate,
    vatApplicable: payer,
    reverseCharge: reverse,
    note,
    currency: row.currency,
    supplier: b.supplier,
    customer: b.customer,
    lines,
    groups,
    payment:
      row.dueDate || row.variableSymbol || b.supplier.bankAccount
        ? {
            dueDate: row.dueDate,
            variableSymbol: row.variableSymbol,
            constantSymbol: row.constantSymbol,
            bankAccount: b.supplier.bankAccount ?? null,
          }
        : null,
  };
}

/* ---------- podklady DPH ---------- */

/** Doklad vydané faktury pro podklady DPH. */
export function issuedVatDoc(b: IssuedBundle): VatDoc {
  const { row } = b;
  return {
    id: row.id,
    source: "issued",
    number: row.number ?? "",
    kindLabel: KIND_LABEL[row.kind] ?? row.kind,
    issueDate: row.issueDate ?? "",
    taxableDate: row.taxableDate ?? row.issueDate ?? "",
    partner: b.customer.name,
    ico: b.customer.ico ?? "",
    dic: b.customer.dic ?? "",
    variableSymbol: row.variableSymbol ?? "",
    reverseCharge: row.vatMode === "reverse_charge",
    outsideVat: !b.payer,
    currency: row.currency,
    groups: issuedGroups(row, b.lines),
  };
}

export function receivedVatDoc(b: ReceivedBundle): VatDoc {
  const { row } = b;
  return {
    id: row.id,
    source: "received",
    number: row.number,
    kindLabel: row.netMinor < 0 ? "dobropis" : "faktura",
    issueDate: receivedIssueDate(row),
    taxableDate: row.taxableDate ?? receivedIssueDate(row),
    partner: b.supplier.name,
    ico: b.supplier.ico ?? "",
    dic: b.supplier.dic ?? "",
    variableSymbol: row.variableSymbol ?? "",
    reverseCharge: row.vatMode === "reverse_charge",
    outsideVat: !receivedFromPayer(row, b.supplier),
    currency: row.currency,
    groups: receivedGroups(row, b.lines),
  };
}

/* ---------- načtení z databáze ---------- */

function groupBy<T>(items: readonly T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const a = m.get(k);
    if (a) a.push(it);
    else m.set(k, [it]);
  }
  return m;
}

/**
 * Vydané faktury s řádky po dávce (3 dotazy na dávku). Oprávnění se neověřuje, ids musí pocházet z `selectDocumentIds`
 * nebo z kontroly přístupu k záznamu. Vystavený doklad nese uloženého dodavatele a odběratele; koncept bez nich
 * (nemělo by se stát) se doplní živými údaji.
 */
export async function loadIssuedBundles(
  ctx: Ctx,
  deps: ModuleDeps,
  ids: readonly string[],
): Promise<IssuedBundle[]> {
  if (!ids.length) return [];
  const rows = await ctx.db
    .select()
    .from(invoice)
    .where(and(inArray(invoice.id, [...ids]), isNull(invoice.deletedAt)))
    .orderBy(asc(invoice.issueDate), asc(invoice.number));
  const lines = await ctx.db
    .select()
    .from(invoiceLine)
    .where(
      inArray(
        invoiceLine.invoiceId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(invoiceLine.invoiceId), asc(invoiceLine.position));
  const originalIds = [
    ...new Set(rows.map((r) => r.originalInvoiceId).filter(Boolean) as string[]),
  ];
  const originals = originalIds.length
    ? await ctx.db
        .select({ id: invoice.id, number: invoice.number, issueDate: invoice.issueDate })
        .from(invoice)
        .where(inArray(invoice.id, originalIds))
    : [];
  const settings = await deps.settings.get(ctx.db, fakturaceSetting);
  const current = await supplierNow(ctx, deps);
  const linesOf = groupBy(lines, (l) => l.invoiceId);
  const out: IssuedBundle[] = [];
  for (const row of rows) {
    const supplier = row.supplier ?? current;
    const orig = row.originalInvoiceId
      ? originals.find((o) => o.id === row.originalInvoiceId)
      : undefined;
    out.push({
      row,
      lines: linesOf.get(row.id) ?? [],
      supplier,
      customer: row.customer ?? (await customerNow(ctx.db, row.companyId)),
      payer: isVatPayer(supplier, settings),
      original: orig ? { number: orig.number, issueDate: orig.issueDate } : null,
      defaultNote: settings.notesText,
      reverseChargeCpa: settings.reverseChargeCpa,
    });
  }
  return out;
}

/** Přijaté faktury s řádky po dávce; odběratel je firma klienta. */
export async function loadReceivedBundles(
  ctx: Ctx,
  deps: ModuleDeps,
  ids: readonly string[],
): Promise<ReceivedBundle[]> {
  if (!ids.length) return [];
  const rows = await ctx.db
    .select()
    .from(receivedInvoice)
    .where(and(inArray(receivedInvoice.id, [...ids]), isNull(receivedInvoice.deletedAt)))
    .orderBy(asc(receivedInvoice.issueDate), asc(receivedInvoice.number));
  const lines = await ctx.db
    .select()
    .from(receivedInvoiceLine)
    .where(
      inArray(
        receivedInvoiceLine.invoiceId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(receivedInvoiceLine.invoiceId), asc(receivedInvoiceLine.position));
  const customer = await supplierNow(ctx, deps);
  const linesOf = groupBy(lines, (l) => l.invoiceId);
  return rows.map((row) => ({
    row,
    lines: linesOf.get(row.id) ?? [],
    supplier: row.supplier ?? BLANK_PARTY,
    customer,
  }));
}
