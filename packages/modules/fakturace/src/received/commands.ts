import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { assertEntityAccess } from "@rebar/core/entities";
import { defineCommand } from "@rebar/core/module-server";
import { PermissionError, scopeOf } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { todayIso } from "@rebar/core/time";
import { company } from "@rebar/kontakty/schema";
import { approvalsApi, ordersApi } from "@rebar/zakazky/server";
import { receivedInvoice } from "../schema";
import { RECEIVED_STATES, canEditReceived, isOverdue } from "./calc";
import {
  createReceived,
  deleteReceived,
  loadReceived,
  loadReceivedLines,
  markReceivedPaid,
  saveReceived,
  submitReceived,
  unmarkReceivedPaid,
} from "./service";

const money = z.number().int().min(-9_000_000_000_000).max(9_000_000_000_000);
const id = z.uuid();

const lineInput = z.object({
  description: z.string().trim().min(1, "Popište řádek faktury.").max(300),
  sectionId: z.uuid().nullish(),
  itemId: z.uuid().nullish(),
  category: z.enum(["labour", "material", "machines", "subcontract", "other"]),
  netMinor: money,
  vatRateBp: z.number().int().min(0).max(10_000),
});

const header = {
  number: z.string().trim().min(1, "Vyplňte číslo dokladu dodavatele.").max(60),
  supplierId: z.uuid("Vyberte dodavatele."),
  jobId: z.uuid().nullish(),
  orderId: z.uuid().nullish(),
  variableSymbol: z.string().trim().max(20).nullish(),
  constantSymbol: z.string().trim().max(10).nullish(),
  issueDate: z.iso.date().nullish(),
  taxableDate: z.iso.date().nullish(),
  dueDate: z.iso.date().nullish(),
  receivedDate: z.iso.date().nullish(),
  vatMode: z.enum(["standard", "reverse_charge"]).default("standard"),
  netMinor: money,
  grossMinor: money,
  note: z.string().trim().max(2000).nullish(),
  lines: z.array(lineInput).max(200).optional(),
};

/** Přístup k faktuře: oprávnění fakturace + (je-li přiřazena) přístup k zakázce a ekonomika zakázky. */
async function access(ctx: Ctx, invoiceJobId: string | null, write: boolean) {
  if (!invoiceJobId) return;
  await assertEntityAccess(ctx, "job", invoiceJobId, "read");
  if (!scopeOf(ctx, write ? "zakazky.budget" : "zakazky.economics")) throw new PermissionError();
}

/** Přijaté faktury (všechny, nebo jedné zakázky) pro záložku a přehledy. */
export const receivedList = defineCommand({
  name: "fakturace.received.list",
  permission: "fakturace.read",
  input: z.object({ jobId: id.optional() }),
  handler: async (ctx, i) => {
    if (i.jobId) await access(ctx, i.jobId, false);
    const rows = await ctx.db
      .select({ r: receivedInvoice, supplier: company.name })
      .from(receivedInvoice)
      .leftJoin(company, eq(company.id, receivedInvoice.supplierId))
      .where(
        and(
          isNull(receivedInvoice.deletedAt),
          i.jobId ? eq(receivedInvoice.jobId, i.jobId) : undefined,
        ),
      )
      .orderBy(desc(receivedInvoice.createdAt))
      .limit(500);
    const today = todayIso();
    const items = rows.map(({ r, supplier }) => ({
      id: r.id,
      number: r.number,
      supplier: r.supplier?.name ?? supplier ?? null,
      state: r.state,
      issueDate: r.issueDate,
      dueDate: r.dueDate,
      netMinor: r.netMinor,
      grossMinor: r.grossMinor,
      paidDate: r.paidDate,
      overdue: isOverdue(r.state, r.dueDate, today),
      orderId: r.orderId,
    }));
    const counted = items.filter((r) => r.state === "approved" || r.state === "paid");
    return {
      invoices: items,
      costNetMinor: counted.reduce((a, r) => a + r.netMinor, 0),
      toApproveCount: items.filter((r) => r.state === "pending").length,
      unpaidGrossMinor: items
        .filter((r) => r.state === "approved")
        .reduce((a, r) => a + r.grossMinor, 0),
      states: RECEIVED_STATES,
    };
  },
});

export const receivedGet = defineCommand({
  name: "fakturace.received.get",
  permission: "fakturace.read",
  input: z.object({ id }),
  handler: async (ctx, i) => {
    const r = await loadReceived(ctx, i.id);
    await access(ctx, r.jobId, false);
    const lines = await loadReceivedLines(ctx, i.id);
    const state = await approvalsApi.getState(ctx, "received_invoice", i.id);
    const order = r.orderId ? await ordersApi.getOrderBrief(ctx, r.orderId) : null;
    // kolik je na objednávku fakturováno (schválené a uhrazené faktury včetně této, pokud už je schválená)
    let orderCompare: null | {
      orderId: string;
      number: string;
      orderedMinor: number;
      invoicedMinor: number;
      diffMinor: number;
      state: "over" | "under" | "match";
    } = null;
    if (order) {
      const linked = await ctx.db
        .select({
          id: receivedInvoice.id,
          net: receivedInvoice.netMinor,
          state: receivedInvoice.state,
        })
        .from(receivedInvoice)
        .where(and(eq(receivedInvoice.orderId, order.id), isNull(receivedInvoice.deletedAt)));
      const others = linked
        .filter((l) => l.id !== r.id && (l.state === "approved" || l.state === "paid"))
        .reduce((a, l) => a + l.net, 0);
      const invoiced = others + r.netMinor;
      orderCompare = {
        orderId: order.id,
        number: order.number,
        orderedMinor: order.totalMinor,
        invoicedMinor: invoiced,
        ...ordersApi.compareWithOrder(order.totalMinor, invoiced),
      };
    }
    return {
      id: r.id,
      number: r.number,
      jobId: r.jobId,
      supplierId: r.supplierId,
      supplierName: r.supplier?.name ?? null,
      orderId: r.orderId,
      variableSymbol: r.variableSymbol,
      constantSymbol: r.constantSymbol,
      issueDate: r.issueDate,
      taxableDate: r.taxableDate,
      dueDate: r.dueDate,
      receivedDate: r.receivedDate,
      vatMode: r.vatMode,
      netMinor: r.netMinor,
      vatMinor: r.vatMinor,
      grossMinor: r.grossMinor,
      paidMinor: r.paidMinor,
      paidDate: r.paidDate,
      state: r.state,
      locked: !!r.lockedAt,
      editable: canEditReceived(r.state) && !r.lockedAt,
      overdue: isOverdue(r.state, r.dueDate, todayIso()),
      note: r.note,
      lines: lines.map((l) => ({
        id: l.id,
        description: l.description,
        sectionId: l.sectionId,
        itemId: l.itemId,
        category: l.category,
        netMinor: l.netMinor,
        vatRateBp: l.vatRateBp,
        vatMinor: l.vatMinor,
        grossMinor: l.grossMinor,
      })),
      approval: {
        status: state.status,
        canDecide: state.canDecide,
        canReopen: state.canReopen,
        approvalId: state.approvalId,
        comment: state.comment,
      },
      orderCompare,
    };
  },
});

export const receivedCreate = defineCommand({
  name: "fakturace.received.create",
  permission: "fakturace.write",
  input: z.object(header),
  handler: async (ctx, i) => {
    await access(ctx, i.jobId ?? null, true);
    return createReceived(ctx, i);
  },
});

export const receivedSave = defineCommand({
  name: "fakturace.received.save",
  permission: "fakturace.write",
  input: z.object({ id, ...header }),
  handler: async (ctx, { id: invoiceId, ...rest }) => {
    const cur = await loadReceived(ctx, invoiceId);
    await access(ctx, cur.jobId, true);
    await access(ctx, rest.jobId ?? null, true);
    await saveReceived(ctx, invoiceId, rest);
    return { id: invoiceId };
  },
});

const action = <R>(name: string, run: (ctx: Ctx, invoiceId: string) => Promise<R>) =>
  defineCommand({
    name,
    permission: "fakturace.write",
    input: z.object({ id }),
    handler: async (ctx, i) => {
      const cur = await loadReceived(ctx, i.id);
      await access(ctx, cur.jobId, true);
      return run(ctx, i.id);
    },
  });

export const receivedSubmit = action("fakturace.received.submit", submitReceived);
export const receivedDelete = action("fakturace.received.delete", deleteReceived);
export const receivedUnpay = action("fakturace.received.unpay", unmarkReceivedPaid);

export const receivedPay = defineCommand({
  name: "fakturace.received.pay",
  permission: "fakturace.write",
  input: z.object({ id, paidDate: z.iso.date("Vyplňte datum úhrady.") }),
  handler: async (ctx, i) => {
    const cur = await loadReceived(ctx, i.id);
    await access(ctx, cur.jobId, true);
    await markReceivedPaid(ctx, i.id, i.paidDate);
  },
});

export const commands = [
  receivedList,
  receivedGet,
  receivedCreate,
  receivedSave,
  receivedSubmit,
  receivedDelete,
  receivedPay,
  receivedUnpay,
];
