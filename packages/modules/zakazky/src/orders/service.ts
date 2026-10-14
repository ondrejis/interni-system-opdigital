import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { recordAudit } from "@rebar/core/audit";
import { nextNumber } from "@rebar/core/numbering";
import { inTx, NotFoundError, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { formatMinor } from "@rebar/core/shared";
import { company } from "@rebar/kontakty/schema";
import { job, jobOrder, jobOrderLine } from "../schema";
import { approvalsApi } from "./approvals-link";
import { canEditOrder, canTransition, orderTotals, type OrderStatus } from "./calc";

export type OrderLineInput = {
  description: string;
  quantity: string;
  unit: string;
  unitPriceMinor: number;
  vatRateBp: number;
  itemId?: string | null | undefined;
};

export type OrderInput = {
  title: string;
  supplierId?: string | null | undefined;
  supplierName?: string | null | undefined;
  sectionId?: string | null | undefined;
  orderDate?: string | null | undefined;
  deliveryDate?: string | null | undefined;
  note?: string | null | undefined;
  lines: OrderLineInput[];
};

export async function loadOrderRow(ctx: Ctx, id: string) {
  const [row] = await ctx.db
    .select()
    .from(jobOrder)
    .where(and(eq(jobOrder.id, id), isNull(jobOrder.deletedAt)));
  if (!row) throw new NotFoundError("Objednávka nenalezena.");
  return row;
}

export async function loadOrderLines(ctx: Ctx, id: string) {
  return ctx.db
    .select()
    .from(jobOrderLine)
    .where(eq(jobOrderLine.orderId, id))
    .orderBy(asc(jobOrderLine.position));
}

async function checkSupplier(ctx: Ctx, supplierId: string | null | undefined) {
  if (!supplierId) return;
  const [c] = await ctx.db
    .select({ id: company.id })
    .from(company)
    .where(and(eq(company.id, supplierId), isNull(company.deletedAt)));
  if (!c) throw new UserError("Dodavatel nenalezen.");
}

async function replaceLines(c: Ctx, orderId: string, lines: readonly OrderLineInput[]) {
  await c.db.delete(jobOrderLine).where(eq(jobOrderLine.orderId, orderId));
  if (lines.length)
    await c.db.insert(jobOrderLine).values(
      lines.map((l, i) => ({
        orderId,
        position: i,
        itemId: l.itemId ?? null,
        title: l.description,
        unit: l.unit,
        quantity: l.quantity,
        unitPriceMinor: l.unitPriceMinor,
        vatRateBp: l.vatRateBp,
      })),
    );
  const t = orderTotals(lines);
  await c.db
    .update(jobOrder)
    .set({ totalMinor: t.netMinor, updatedBy: c.actor.userId })
    .where(eq(jobOrder.id, orderId));
  return t;
}

/** Založí objednávku (koncept) s číslem z řady `zakazky.objednavka` ve stejné transakci. */
export async function createOrder(
  ctx: Ctx,
  jobId: string,
  i: OrderInput,
): Promise<{ id: string; number: string }> {
  return inTx(ctx, async (c) => {
    const [j] = await c.db
      .select({ number: job.number })
      .from(job)
      .where(and(eq(job.id, jobId), isNull(job.deletedAt)));
    if (!j) throw new NotFoundError("Zakázka nenalezena.");
    await checkSupplier(c, i.supplierId);
    const number = await nextNumber(c.db, "zakazky.objednavka", new Date(), {
      isTaken: async (n) =>
        (
          await c.db
            .select({ id: jobOrder.id })
            .from(jobOrder)
            .where(eq(jobOrder.number, n))
            .limit(1)
        ).length > 0,
    });
    const [row] = await c.db
      .insert(jobOrder)
      .values({
        jobId,
        number,
        title: i.title,
        supplierId: i.supplierId ?? null,
        supplierName: i.supplierName || null,
        sectionId: i.sectionId ?? null,
        orderDate: i.orderDate ?? null,
        deliveryDate: i.deliveryDate ?? null,
        note: i.note || null,
        createdBy: c.actor.userId,
        updatedBy: c.actor.userId,
      })
      .returning({ id: jobOrder.id });
    const t = await replaceLines(c, row!.id, i.lines);
    await recordAudit(c, {
      action: "create",
      entityType: "job_order",
      entityId: row!.id,
      summary: `${number} ${i.title} (${formatMinor(t.netMinor)})`,
    });
    await recordAudit(c, {
      action: "update",
      entityType: "job",
      entityId: jobId,
      summary: `Objednávka ${number}: ${i.title}`,
    });
    return { id: row!.id, number };
  });
}

/** Uloží koncept objednávky (hlavičku i řádky). Schválená, zamčená nebo odeslaná objednávka se nemění. */
export async function saveOrder(ctx: Ctx, id: string, i: OrderInput): Promise<void> {
  await inTx(ctx, async (c) => {
    const cur = await loadOrderRow(c, id);
    approvalsApi.assertUnlocked(cur, `Objednávka ${cur.number}`);
    if (!canEditOrder(cur.status))
      throw new UserError("Objednávku jde upravit jen v konceptu. Vraťte ji do konceptu.");
    await checkSupplier(c, i.supplierId);
    await c.db
      .update(jobOrder)
      .set({
        title: i.title,
        supplierId: i.supplierId ?? null,
        supplierName: i.supplierName || null,
        sectionId: i.sectionId ?? null,
        orderDate: i.orderDate ?? null,
        deliveryDate: i.deliveryDate ?? null,
        note: i.note || null,
        updatedBy: c.actor.userId,
      })
      .where(eq(jobOrder.id, id));
    await replaceLines(c, id, i.lines);
    await recordAudit(c, {
      action: "update",
      entityType: "job_order",
      entityId: id,
      summary: `${cur.number} upraveno`,
    });
  });
}

/** Odešle koncept ke schválení; pod limitem se schválí hned (handler zapíše stav a zámek). */
export async function submitOrder(ctx: Ctx, id: string): Promise<{ status: string }> {
  return inTx(ctx, async (c) => {
    const cur = await loadOrderRow(c, id);
    if (cur.status !== "draft") throw new UserError("Ke schválení jde odeslat jen koncept.");
    const lines = await loadOrderLines(c, id);
    if (!lines.length) throw new UserError("Objednávka nemá žádné řádky.");
    if (cur.totalMinor <= 0) throw new UserError("Objednávka musí mít kladnou celkovou částku.");
    if (!cur.supplierId && !cur.supplierName?.trim())
      throw new UserError("Vyplňte dodavatele objednávky.");
    await c.db
      .update(jobOrder)
      .set({ status: "pending", updatedBy: c.actor.userId })
      .where(eq(jobOrder.id, id));
    await approvalsApi.requestApproval(c, {
      docType: "order",
      docId: id,
      jobId: cur.jobId,
      amountMinor: cur.totalMinor,
    });
    return { status: (await loadOrderRow(c, id)).status };
  });
}

/** Příjem zboží: schválená objednávka je přijatá (závazek zůstává do vyfakturování). */
export async function receiveOrder(ctx: Ctx, id: string): Promise<void> {
  await inTx(ctx, async (c) => {
    const cur = await loadOrderRow(c, id);
    if (!canTransition(cur.status, "received"))
      throw new UserError("Přijmout jde jen schválenou objednávku.");
    await c.db
      .update(jobOrder)
      .set({ status: "received", updatedBy: c.actor.userId })
      .where(eq(jobOrder.id, id));
    await recordAudit(c, {
      action: "update",
      entityType: "job_order",
      entityId: id,
      summary: `${cur.number} přijato`,
    });
  });
}

export async function cancelOrder(ctx: Ctx, id: string): Promise<void> {
  await inTx(ctx, async (c) => {
    const cur = await loadOrderRow(c, id);
    if (cur.status === "pending")
      throw new UserError(
        "Objednávka čeká na schválení. Nejdřív ji vraťte do konceptu, nebo počkejte na rozhodnutí.",
      );
    if (!canTransition(cur.status, "cancelled"))
      throw new UserError("Tuto objednávku už nejde zrušit.");
    await c.db
      .update(jobOrder)
      .set({ status: "cancelled", updatedBy: c.actor.userId })
      .where(eq(jobOrder.id, id));
    await recordAudit(c, {
      action: "update",
      entityType: "job_order",
      entityId: id,
      summary: `${cur.number} zrušeno`,
    });
  });
}

export async function deleteOrder(ctx: Ctx, id: string): Promise<{ jobId: string }> {
  return inTx(ctx, async (c) => {
    const cur = await loadOrderRow(c, id);
    if (cur.status !== "draft")
      throw new UserError("Smazat jde jen koncept objednávky, ostatní se ruší.");
    await c.db
      .update(jobOrder)
      .set({ deletedAt: new Date(), updatedBy: c.actor.userId })
      .where(eq(jobOrder.id, id));
    await recordAudit(c, {
      action: "delete",
      entityType: "job_order",
      entityId: id,
      summary: `${cur.number} smazáno`,
    });
    return { jobId: cur.jobId };
  });
}

export type { OrderStatus };

/** Rozhodnutí o objednávce ze schvalování (včetně automatického pod limitem) a vrácení do konceptu. */
export function registerOrderApproval() {
  approvalsApi.registerHandler("order", {
    onDecision: async (ctx, d) => {
      const cur = await loadOrderRow(ctx, d.docId);
      await ctx.db
        .update(jobOrder)
        .set(
          d.approved
            ? { status: "approved", lockedAt: new Date(), updatedBy: ctx.actor.userId }
            : { status: "draft", lockedAt: null, updatedBy: ctx.actor.userId },
        )
        .where(eq(jobOrder.id, d.docId));
      await recordAudit(ctx, {
        action: "update",
        entityType: "job_order",
        entityId: d.docId,
        summary: d.approved
          ? `${cur.number} schváleno${d.automatic ? " automaticky" : ""}`
          : `${cur.number} zamítnuto${d.comment ? `: ${d.comment}` : ""}`,
      });
      // schválená objednávka se hned počítá jako závazek v plánu vs skutečnost
    },
    onReopen: async (ctx, d) => {
      await ctx.db
        .update(jobOrder)
        .set({ status: "draft", lockedAt: null, updatedBy: ctx.actor.userId })
        .where(eq(jobOrder.id, d.docId));
    },
    describe: async (ctx, ids) => {
      const out: Record<string, { label: string }> = {};
      if (!ids.length) return out;
      // jedním dotazem, ne po jednom (fronta schvalování popisuje všechny čekající doklady najednou)
      const rows = await ctx.db
        .select({ id: jobOrder.id, number: jobOrder.number, title: jobOrder.title })
        .from(jobOrder)
        .where(inArray(jobOrder.id, [...ids]));
      for (const r of rows) out[r.id] = { label: `${r.number} ${r.title}` };
      return out;
    },
  });
}
