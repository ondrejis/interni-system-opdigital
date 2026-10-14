import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { defineCommand } from "@rebar/core/module-server";
import { NotFoundError } from "@rebar/core/rbac";
import { company } from "@rebar/kontakty/schema";
import { loadCosts } from "../costs/api";
import { readMoney, writeCosts } from "../costs/access";
import { jobOrder } from "../schema";
import { approvalsApi } from "./approvals-link";
import { ORDER_STATUSES, canEditOrder, orderTotals } from "./calc";
import {
  cancelOrder,
  createOrder,
  deleteOrder,
  loadOrderLines,
  loadOrderRow,
  receiveOrder,
  saveOrder,
  submitOrder,
} from "./service";

const jobId = z.uuid();
const money = z.number().int().min(-9_000_000_000_000).max(9_000_000_000_000);

const lineInput = z.object({
  description: z.string().trim().min(1, "Popište řádek objednávky.").max(300),
  quantity: z
    .string()
    .regex(/^-?\d{1,11}([.,]\d{1,3})?$/, "Množství zadejte jako číslo (nejvýš 3 desetinná místa).")
    .transform((v) => v.replace(",", ".")),
  unit: z.string().trim().min(1).max(12),
  unitPriceMinor: money,
  vatRateBp: z.number().int().min(0).max(10_000),
  itemId: z.uuid().nullish(),
});

const orderFields = {
  title: z.string().trim().min(2, "Napište, co se objednává.").max(200),
  supplierId: z.uuid().nullish(),
  supplierName: z.string().trim().max(200).nullish(),
  sectionId: z.uuid().nullish(),
  orderDate: z.iso.date().nullish(),
  deliveryDate: z.iso.date().nullish(),
  note: z.string().trim().max(2000).nullish(),
  lines: z.array(lineInput).max(200),
};

/** Objednávky zakázky s otevřeným závazkem (kolik z objednaného ještě nepokrývají náklady). */
export const ordersList = defineCommand({
  name: "zakazky.orders.list",
  permission: "zakazky.economics",
  input: z.object({ jobId }),
  handler: async (ctx, i, deps) => {
    await readMoney(ctx, i.jobId);
    const rows = await ctx.db
      .select({ o: jobOrder, supplier: company.name })
      .from(jobOrder)
      .leftJoin(company, eq(company.id, jobOrder.supplierId))
      .where(and(eq(jobOrder.jobId, i.jobId), isNull(jobOrder.deletedAt)))
      .orderBy(asc(jobOrder.number));
    const { rows: costs } = await loadCosts(ctx, i.jobId, deps);
    const linked = new Map<string, number>();
    for (const c of costs)
      if (c.orderId) linked.set(c.orderId, (linked.get(c.orderId) ?? 0) + c.amountMinor);
    const items = rows.map(({ o, supplier }) => {
      const costMinor = linked.get(o.id) ?? 0;
      const commits = o.status === "approved" || o.status === "received";
      return {
        id: o.id,
        number: o.number,
        title: o.title,
        supplier: o.supplierName ?? supplier ?? null,
        status: o.status,
        totalMinor: o.totalMinor,
        orderDate: o.orderDate,
        deliveryDate: o.deliveryDate,
        sectionId: o.sectionId,
        costMinor,
        openMinor: commits ? Math.max(0, o.totalMinor - costMinor) : 0,
        locked: !!o.lockedAt,
      };
    });
    return {
      orders: items,
      openMinor: items.reduce((a, o) => a + o.openMinor, 0),
      statuses: ORDER_STATUSES,
    };
  },
});

export const ordersGet = defineCommand({
  name: "zakazky.orders.get",
  permission: "zakazky.economics",
  input: z.object({ id: z.uuid() }),
  handler: async (ctx, i, deps) => {
    const o = await loadOrderRow(ctx, i.id);
    await readMoney(ctx, o.jobId);
    const lines = await loadOrderLines(ctx, i.id);
    const { rows } = await loadCosts(ctx, o.jobId, deps);
    const [sup] = o.supplierId
      ? await ctx.db
          .select({ name: company.name })
          .from(company)
          .where(eq(company.id, o.supplierId))
      : [];
    const state = await approvalsApi.getState(ctx, "order", i.id);
    const totals = orderTotals(lines);
    const costs = rows
      .filter((r) => r.orderId === i.id)
      .map((r) => ({
        key: r.key,
        label: r.label,
        source: r.source,
        date: r.date,
        amountMinor: r.amountMinor,
        href: r.href,
      }));
    return {
      id: o.id,
      jobId: o.jobId,
      number: o.number,
      title: o.title,
      supplierId: o.supplierId,
      supplierName: o.supplierName ?? sup?.name ?? null,
      sectionId: o.sectionId,
      orderDate: o.orderDate,
      deliveryDate: o.deliveryDate,
      note: o.note,
      status: o.status,
      locked: !!o.lockedAt,
      editable: canEditOrder(o.status) && !o.lockedAt,
      ...totals,
      lines: lines.map((l) => ({
        id: l.id,
        description: l.title,
        quantity: l.quantity,
        unit: l.unit,
        unitPriceMinor: l.unitPriceMinor,
        vatRateBp: l.vatRateBp,
        itemId: l.itemId,
      })),
      costs,
      costMinor: costs.reduce((a, c) => a + c.amountMinor, 0),
      approval: {
        status: state.status,
        canDecide: state.canDecide,
        canReopen: state.canReopen,
        approvalId: state.approvalId,
        comment: state.comment,
      },
    };
  },
});

/** Nová objednávka (bez `id`) nebo úprava konceptu. */
export const ordersSave = defineCommand({
  name: "zakazky.orders.save",
  permission: "zakazky.budget",
  input: z.object({ jobId, id: z.uuid().optional(), ...orderFields }),
  handler: async (ctx, { jobId: jid, id, ...rest }) => {
    await writeCosts(ctx, jid);
    if (id) {
      const cur = await loadOrderRow(ctx, id);
      if (cur.jobId !== jid) throw new NotFoundError("Objednávka nenalezena.");
      await saveOrder(ctx, id, rest);
      return { id, number: cur.number };
    }
    return createOrder(ctx, jid, rest);
  },
});

const orderAction = <R>(
  name: string,
  run: (ctx: Parameters<typeof saveOrder>[0], id: string) => Promise<R>,
) =>
  defineCommand({
    name,
    permission: "zakazky.budget",
    input: z.object({ id: z.uuid() }),
    handler: async (ctx, i) => {
      const o = await loadOrderRow(ctx, i.id);
      await writeCosts(ctx, o.jobId);
      return run(ctx, i.id);
    },
  });

export const ordersSubmit = orderAction("zakazky.orders.submit", submitOrder);
export const ordersReceive = orderAction("zakazky.orders.receive", receiveOrder);
export const ordersCancel = orderAction("zakazky.orders.cancel", cancelOrder);
export const ordersDelete = orderAction("zakazky.orders.delete", deleteOrder);

export const commands = [
  ordersList,
  ordersGet,
  ordersSave,
  ordersSubmit,
  ordersReceive,
  ordersCancel,
  ordersDelete,
];
