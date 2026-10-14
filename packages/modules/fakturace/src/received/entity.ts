import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { defineEntity } from "@rebar/core/entities";
import { UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { approvalsApi } from "@rebar/zakazky/server";
import { company } from "@rebar/kontakty/schema";
import { receivedInvoice, receivedInvoiceLine, type PartySnapshot } from "../schema";
import { RECEIVED_STATES, VAT_MODES, canEditReceived, dedupKey, headerVat } from "./calc";

/** Odmítne duplicitu: stejný dodavatel a stejné číslo dokladu (bez mezer a velikosti písmen). */
export async function assertNoDuplicate(
  ctx: Ctx,
  supplierId: string | null | undefined,
  number: string,
  exceptId?: string,
): Promise<void> {
  if (!supplierId) return;
  const rows = await ctx.db
    .select({ id: receivedInvoice.id, number: receivedInvoice.number })
    .from(receivedInvoice)
    .where(
      and(
        eq(receivedInvoice.supplierId, supplierId),
        isNull(receivedInvoice.deletedAt),
        exceptId ? ne(receivedInvoice.id, exceptId) : sql`true`,
      ),
    );
  const key = dedupKey(number);
  if (rows.some((r) => dedupKey(r.number) === key))
    throw new UserError(
      `Faktura číslo ${number.trim()} od tohoto dodavatele už v systému je. Zkontrolujte, jestli ji nezakládáte podruhé.`,
    );
}

/** Údaje dodavatele uložené na dokladu (adresa a IČO v době přijetí). */
export async function supplierSnapshot(
  ctx: Ctx,
  supplierId: string | null | undefined,
): Promise<PartySnapshot | null> {
  if (!supplierId) return null;
  const [c] = await ctx.db.select().from(company).where(eq(company.id, supplierId));
  if (!c) throw new UserError("Dodavatel nenalezen.");
  return {
    name: c.name,
    ico: c.ico,
    dic: c.dic,
    street: c.street,
    city: c.city,
    zip: c.zip,
    email: c.email,
    phone: c.phone,
    web: c.web,
  };
}

/** Přijatá faktura od dodavatele. Zakládá se i v seznamu; řádky, schválení a úhrada jsou na detailu. */
export const receivedEntity = defineEntity({
  key: "received_invoice",
  listPath: "/fakturace/prijate",
  module: "fakturace",
  label: { one: "Přijatá faktura", many: "Přijaté faktury" },
  table: receivedInvoice,
  titleKey: "number",
  statusKey: "state",
  permissions: { read: "fakturace.read", write: "fakturace.write", export: "fakturace.export" },
  ownerColumns: [receivedInvoice.createdBy],
  beforeCreate: async (ctx, values) => {
    const out = { ...values };
    out.state = "draft";
    const num = String(out.number ?? "").trim();
    out.number = num;
    await assertNoDuplicate(ctx, out.supplier as string | undefined, num);
    const net = Number(out.net ?? 0);
    const mode = String(out.vatMode ?? "standard");
    const gross = mode === "reverse_charge" ? net : Number(out.gross ?? net);
    out.gross = gross;
    out.vat = headerVat(net, gross, mode);
    return out;
  },
  beforeUpdate: async (ctx, before, changes) => {
    approvalsApi.assertUnlocked(
      before as { lockedAt?: Date | null },
      `Faktura ${String(before.number)}`,
    );
    if (!canEditReceived(String(before.state)))
      throw new UserError("Fakturu jde upravit jen v konceptu. Vraťte ji do konceptu.");
    const next = { ...before, ...changes } as typeof before;
    if ("number" in changes || "supplierId" in changes) {
      const num = String(next.number ?? "").trim();
      await assertNoDuplicate(ctx, next.supplierId as string | null, num, String(before.id));
    }
    const extra: Record<string, unknown> = {};
    if ("supplierId" in changes)
      extra.supplier = await supplierSnapshot(ctx, changes.supplierId as string | null);
    if ("netMinor" in changes || "grossMinor" in changes || "vatMode" in changes) {
      const mode = String(next.vatMode ?? "standard");
      const net = Number(next.netMinor ?? 0);
      const gross = mode === "reverse_charge" ? net : Number(next.grossMinor ?? net);
      extra.grossMinor = gross;
      extra.vatMinor = headerVat(net, gross, mode);
    }
    if ("jobId" in changes && changes.jobId !== before.jobId) {
      // řádky se párují na oddíly rozpočtu jedné zakázky; po přesunu na jinou zakázku se párování zruší
      await ctx.db
        .update(receivedInvoiceLine)
        .set({ sectionId: null, itemId: null })
        .where(eq(receivedInvoiceLine.invoiceId, String(before.id)));
      extra.orderId = null;
    }
    return extra;
  },
  beforeDelete: async (_ctx, raw) => {
    if (!canEditReceived(String(raw.state)))
      throw new UserError("Smazat jde jen koncept nebo zamítnutou fakturu.");
  },
  attributes: [
    {
      key: "number",
      label: "Číslo dokladu",
      type: "text",
      field: "number",
      required: true,
      width: 160,
      defaultVisible: true,
    },
    {
      key: "supplier",
      label: "Dodavatel",
      type: "record",
      field: "supplierId",
      record: { entityType: "company" },
      required: true,
      width: 220,
      defaultVisible: true,
    },
    {
      key: "job",
      label: "Zakázka",
      type: "record",
      field: "jobId",
      record: { entityType: "job" },
      width: 220,
      defaultVisible: true,
    },
    {
      key: "state",
      label: "Stav",
      type: "select",
      field: "state",
      readonly: true,
      choices: RECEIVED_STATES.map((s) => ({ value: s.key, label: s.label, color: s.color })),
      width: 130,
      defaultVisible: true,
    },
    {
      key: "issueDate",
      label: "Vystaveno",
      type: "date",
      field: "issueDate",
      width: 120,
      defaultVisible: true,
    },
    { key: "taxableDate", label: "DUZP", type: "date", field: "taxableDate", width: 110 },
    {
      key: "dueDate",
      label: "Splatnost",
      type: "date",
      field: "dueDate",
      width: 120,
      defaultVisible: true,
    },
    { key: "receivedDate", label: "Přijato", type: "date", field: "receivedDate", width: 110 },
    {
      key: "net",
      label: "Základ",
      type: "currency",
      field: "netMinor",
      aggregate: ["sum"],
      width: 130,
      defaultVisible: true,
    },
    {
      key: "vat",
      label: "DPH",
      type: "currency",
      field: "vatMinor",
      readonly: true,
      aggregate: ["sum"],
      width: 110,
    },
    {
      key: "gross",
      label: "Celkem",
      type: "currency",
      field: "grossMinor",
      aggregate: ["sum"],
      width: 140,
      defaultVisible: true,
    },
    {
      key: "paid",
      label: "Uhrazeno",
      type: "currency",
      field: "paidMinor",
      readonly: true,
      aggregate: ["sum"],
      width: 130,
    },
    {
      key: "paidDate",
      label: "Datum úhrady",
      type: "date",
      field: "paidDate",
      readonly: true,
      width: 120,
    },
    {
      key: "vatMode",
      label: "Režim DPH",
      type: "select",
      field: "vatMode",
      choices: VAT_MODES.map((m) => ({ value: m.key, label: m.label })),
      default: "standard",
      width: 200,
    },
    {
      key: "variableSymbol",
      label: "Variabilní symbol",
      type: "text",
      field: "variableSymbol",
      width: 140,
    },
    {
      key: "order",
      label: "Objednávka",
      type: "record",
      field: "orderId",
      record: { entityType: "job_order" },
      width: 160,
    },
    { key: "note", label: "Poznámka", type: "longtext", field: "note", width: 300 },
  ],
  search: (r) => ({
    title: String(r.number),
    ...(r.variableSymbol ? { subtitle: `VS ${String(r.variableSymbol)}` } : {}),
    extra: String(r.variableSymbol ?? ""),
  }),
  url: (id) => `/fakturace/prijate/${id}`,
});
