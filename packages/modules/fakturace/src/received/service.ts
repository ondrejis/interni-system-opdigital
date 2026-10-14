import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { recordAudit } from "@rebar/core/audit";
import { defaultVatRateBp } from "@rebar/core/config-data";
import { inTx, NotFoundError, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { formatMinor } from "@rebar/core/shared";
import { approvalsApi, costsApi, ordersApi } from "@rebar/zakazky/server";
import { receivedInvoice, receivedInvoiceLine } from "../schema";
import { canEditReceived, checkReceived, headerVat, lineTotals } from "./calc";
import { assertNoDuplicate, supplierSnapshot } from "./entity";

export type ReceivedLineInput = {
  description: string;
  sectionId?: string | null | undefined;
  itemId?: string | null | undefined;
  category: string;
  netMinor: number;
  vatRateBp: number;
};

export type ReceivedInput = {
  number: string;
  supplierId: string;
  jobId?: string | null | undefined;
  orderId?: string | null | undefined;
  variableSymbol?: string | null | undefined;
  constantSymbol?: string | null | undefined;
  issueDate?: string | null | undefined;
  taxableDate?: string | null | undefined;
  dueDate?: string | null | undefined;
  receivedDate?: string | null | undefined;
  vatMode: "standard" | "reverse_charge";
  netMinor: number;
  grossMinor: number;
  note?: string | null | undefined;
  lines?: ReceivedLineInput[] | undefined;
};

/** Přijatá faktura; `lock` zamkne řádek do konce transakce (změny stavu se pak nepřekrývají se souběžným schválením). */
export async function loadReceived(ctx: Ctx, id: string, opts: { lock?: boolean } = {}) {
  const q = ctx.db
    .select()
    .from(receivedInvoice)
    .where(and(eq(receivedInvoice.id, id), isNull(receivedInvoice.deletedAt)));
  const [row] = await (opts.lock ? q.for("update") : q);
  if (!row) throw new NotFoundError("Přijatá faktura nenalezena.");
  return row;
}

export async function loadReceivedLines(ctx: Ctx, id: string) {
  return ctx.db
    .select()
    .from(receivedInvoiceLine)
    .where(eq(receivedInvoiceLine.invoiceId, id))
    .orderBy(asc(receivedInvoiceLine.position));
}

const isUniqueViolation = (e: unknown) => {
  const x = e as { code?: string; cause?: { code?: string }; message?: string };
  return x?.code === "23505" || x?.cause?.code === "23505";
};
const DUP = "Faktura od tohoto dodavatele s tímto číslem už v systému je.";

/** Zakázka a její rozpočet: oddíl a položka řádku musí patřit do aktuálního rozpočtu zakázky faktury. */
async function checkTargets(
  ctx: Ctx,
  jobId: string | null | undefined,
  orderId: string | null | undefined,
  lines: readonly ReceivedLineInput[],
) {
  const paired = lines.filter((l) => l.sectionId);
  if (paired.length && !jobId)
    throw new UserError("Řádky jde párovat na rozpočet jen u faktury přiřazené k zakázce.");
  if (jobId && paired.length) {
    const bud = await costsApi.loadBudget(ctx, jobId);
    for (const l of paired) {
      if (!bud.sections.some((s) => s.id === l.sectionId))
        throw new UserError("Oddíl není v aktuálním rozpočtu zakázky faktury.");
      if (l.itemId && !bud.items.some((i) => i.id === l.itemId && i.sectionId === l.sectionId))
        throw new UserError("Položka nepatří do vybraného oddílu.");
    }
  }
  if (orderId) {
    const o = await ordersApi.getOrderBrief(ctx, orderId);
    if (!o) throw new UserError("Objednávka nenalezena.");
    if (jobId && o.jobId !== jobId) throw new UserError("Objednávka patří k jiné zakázce.");
  }
}

async function writeLines(
  c: Ctx,
  invoiceId: string,
  vatMode: string,
  lines: readonly ReceivedLineInput[],
) {
  await c.db.delete(receivedInvoiceLine).where(eq(receivedInvoiceLine.invoiceId, invoiceId));
  if (!lines.length) return;
  await c.db.insert(receivedInvoiceLine).values(
    lines.map((l, i) => {
      const t = lineTotals(l, vatMode);
      return {
        invoiceId,
        position: i,
        description: l.description,
        sectionId: l.sectionId ?? null,
        itemId: l.sectionId ? (l.itemId ?? null) : null,
        category: l.category,
        netMinor: t.netMinor,
        vatRateBp: l.vatRateBp,
        vatMinor: t.vatMinor,
        grossMinor: t.grossMinor,
      };
    }),
  );
}

function headerValues(c: Ctx, i: ReceivedInput) {
  const gross = i.vatMode === "reverse_charge" ? i.netMinor : i.grossMinor;
  return {
    number: i.number.trim(),
    supplierId: i.supplierId,
    jobId: i.jobId ?? null,
    orderId: i.orderId ?? null,
    variableSymbol: i.variableSymbol || null,
    constantSymbol: i.constantSymbol || null,
    issueDate: i.issueDate ?? null,
    taxableDate: i.taxableDate ?? null,
    dueDate: i.dueDate ?? null,
    receivedDate: i.receivedDate ?? null,
    vatMode: i.vatMode,
    netMinor: i.netMinor,
    vatMinor: headerVat(i.netMinor, gross, i.vatMode),
    grossMinor: gross,
    note: i.note || null,
    updatedBy: c.actor.userId,
  };
}

/** Založí přijatou fakturu (koncept). Bez řádků vznikne jeden řádek na celý základ, který se pak rozpadne na oddíly. */
export async function createReceived(ctx: Ctx, i: ReceivedInput): Promise<{ id: string }> {
  try {
    return await inTx(ctx, async (c) => {
      await assertNoDuplicate(c, i.supplierId, i.number);
      const lines = i.lines ?? [
        {
          description: `Faktura ${i.number.trim()}`,
          category: "material",
          netMinor: i.netMinor,
          vatRateBp:
            i.vatMode === "reverse_charge"
              ? 0
              : await defaultVatRateBp(c.db, new Date().toISOString().slice(0, 10)),
        },
      ];
      await checkTargets(c, i.jobId, i.orderId, lines);
      const [row] = await c.db
        .insert(receivedInvoice)
        .values({
          ...headerValues(c, i),
          supplier: await supplierSnapshot(c, i.supplierId),
          createdBy: c.actor.userId,
        })
        .returning({ id: receivedInvoice.id });
      await writeLines(c, row!.id, i.vatMode, lines);
      await recordAudit(c, {
        action: "create",
        entityType: "received_invoice",
        entityId: row!.id,
        summary: `Přijatá faktura ${i.number.trim()} (${formatMinor(i.netMinor)} bez DPH)`,
      });
      return { id: row!.id };
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new UserError(DUP);
    throw e;
  }
}

/** Uloží koncept nebo zamítnutou fakturu (hlavičku i řádky). Schválená a uhrazená je zamčená. */
export async function saveReceived(ctx: Ctx, id: string, i: ReceivedInput): Promise<void> {
  try {
    await inTx(ctx, async (c) => {
      const cur = await loadReceived(c, id, { lock: true });
      approvalsApi.assertUnlocked(cur, `Faktura ${cur.number}`);
      if (!canEditReceived(cur.state))
        throw new UserError("Fakturu jde upravit jen v konceptu. Vraťte ji do konceptu.");
      await assertNoDuplicate(c, i.supplierId, i.number, id);
      const lines =
        i.lines ??
        (await loadReceivedLines(c, id)).map((l) => ({
          description: l.description,
          sectionId: l.sectionId,
          itemId: l.itemId,
          category: l.category,
          netMinor: l.netMinor,
          vatRateBp: l.vatRateBp,
        }));
      await checkTargets(c, i.jobId, i.orderId, lines);
      const snapshot =
        cur.supplierId === i.supplierId && cur.supplier
          ? cur.supplier
          : await supplierSnapshot(c, i.supplierId);
      await c.db
        .update(receivedInvoice)
        .set({
          ...headerValues(c, i),
          supplier: snapshot,
          // zamítnutá faktura po úpravě je znovu koncept
          state: "draft",
        })
        .where(eq(receivedInvoice.id, id));
      await writeLines(c, id, i.vatMode, lines);
      await recordAudit(c, {
        action: "update",
        entityType: "received_invoice",
        entityId: id,
        summary: `Přijatá faktura ${i.number.trim()} upravena`,
      });
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new UserError(DUP);
    throw e;
  }
}

/** Odešle fakturu ke schválení; po kontrole součtů. Pod limitem se schválí hned (handler zapíše stav a zámek). */
export async function submitReceived(ctx: Ctx, id: string): Promise<{ state: string }> {
  return inTx(ctx, async (c) => {
    const cur = await loadReceived(c, id, { lock: true });
    if (!canEditReceived(cur.state))
      throw new UserError("Ke schválení jde odeslat jen koncept nebo zamítnutou fakturu.");
    if (!cur.supplierId) throw new UserError("Vyplňte dodavatele faktury.");
    const lines = await loadReceivedLines(c, id);
    const bad = checkReceived(cur, lines, (n) => formatMinor(n));
    if (bad) throw new UserError(bad);
    await c.db
      .update(receivedInvoice)
      .set({ state: "pending", updatedBy: c.actor.userId })
      .where(eq(receivedInvoice.id, id));
    await approvalsApi.requestApproval(c, {
      docType: "received_invoice",
      docId: id,
      jobId: cur.jobId,
      amountMinor: cur.netMinor,
    });
    return { state: (await loadReceived(c, id)).state };
  });
}

/** Schválenou fakturu označí jako uhrazenou (celou částku). Zůstává zamčená. */
export async function markReceivedPaid(ctx: Ctx, id: string, paidDate: string): Promise<void> {
  await inTx(ctx, async (c) => {
    const cur = await loadReceived(c, id, { lock: true });
    if (cur.state !== "approved")
      throw new UserError("Jako uhrazenou jde označit jen schválenou fakturu.");
    await c.db
      .update(receivedInvoice)
      .set({
        state: "paid",
        paidMinor: cur.grossMinor,
        paidDate,
        updatedBy: c.actor.userId,
      })
      .where(eq(receivedInvoice.id, id));
    await recordAudit(c, {
      action: "update",
      entityType: "received_invoice",
      entityId: id,
      summary: `Faktura ${cur.number} uhrazena (${formatMinor(cur.grossMinor)})`,
    });
    if (cur.jobId) await costsApi.recomputeJobSummary(c, cur.jobId);
  });
}

export async function unmarkReceivedPaid(ctx: Ctx, id: string): Promise<void> {
  await inTx(ctx, async (c) => {
    const cur = await loadReceived(c, id, { lock: true });
    if (cur.state !== "paid") throw new UserError("Faktura není označená jako uhrazená.");
    await c.db
      .update(receivedInvoice)
      .set({ state: "approved", paidMinor: 0, paidDate: null, updatedBy: c.actor.userId })
      .where(eq(receivedInvoice.id, id));
    await recordAudit(c, {
      action: "update",
      entityType: "received_invoice",
      entityId: id,
      summary: `Faktura ${cur.number}: úhrada zrušena`,
    });
    if (cur.jobId) await costsApi.recomputeJobSummary(c, cur.jobId);
  });
}

export async function deleteReceived(ctx: Ctx, id: string): Promise<{ jobId: string | null }> {
  return inTx(ctx, async (c) => {
    const cur = await loadReceived(c, id, { lock: true });
    if (!canEditReceived(cur.state))
      throw new UserError("Smazat jde jen koncept nebo zamítnutou fakturu.");
    await c.db
      .update(receivedInvoice)
      .set({ deletedAt: new Date(), updatedBy: c.actor.userId })
      .where(eq(receivedInvoice.id, id));
    await recordAudit(c, {
      action: "delete",
      entityType: "received_invoice",
      entityId: id,
      summary: `Přijatá faktura ${cur.number} smazána`,
    });
    return { jobId: cur.jobId };
  });
}

/** Rozhodnutí o faktuře ze schvalování (včetně automatického pod limitem) a vrácení do konceptu. */
export function registerReceivedApproval() {
  approvalsApi.registerHandler("received_invoice", {
    onDecision: async (ctx, d) => {
      const cur = await loadReceived(ctx, d.docId);
      await ctx.db
        .update(receivedInvoice)
        .set(
          d.approved
            ? { state: "approved", lockedAt: new Date(), updatedBy: ctx.actor.userId }
            : { state: "rejected", lockedAt: null, updatedBy: ctx.actor.userId },
        )
        .where(eq(receivedInvoice.id, d.docId));
      await recordAudit(ctx, {
        action: "update",
        entityType: "received_invoice",
        entityId: d.docId,
        summary: d.approved
          ? `Faktura ${cur.number} schválena${d.automatic ? " automaticky" : ""}`
          : `Faktura ${cur.number} zamítnuta${d.comment ? `: ${d.comment}` : ""}`,
      });
      // schválená faktura vstupuje do skutečných nákladů zakázky
      if (cur.jobId) await costsApi.recomputeJobSummary(ctx, cur.jobId);
    },
    onReopen: async (ctx, d) => {
      const cur = await loadReceived(ctx, d.docId);
      if (cur.state === "paid")
        throw new UserError(
          "Faktura je uhrazená. Nejdřív zrušte úhradu, potom ji vraťte do konceptu.",
        );
      await ctx.db
        .update(receivedInvoice)
        .set({ state: "draft", lockedAt: null, updatedBy: ctx.actor.userId })
        .where(eq(receivedInvoice.id, d.docId));
      if (cur.jobId) await costsApi.recomputeJobSummary(ctx, cur.jobId);
    },
    describe: async (ctx, ids) => {
      const out: Record<string, { label: string }> = {};
      if (!ids.length) return out;
      // jedním dotazem, ne po jednom (fronta schvalování popisuje všechny čekající doklady najednou)
      const rows = await ctx.db
        .select({
          id: receivedInvoice.id,
          number: receivedInvoice.number,
          supplier: receivedInvoice.supplier,
        })
        .from(receivedInvoice)
        .where(inArray(receivedInvoice.id, [...ids]));
      for (const r of rows)
        out[r.id] = {
          label: `Faktura ${r.number}${r.supplier?.name ? ` (${r.supplier.name})` : ""}`,
        };
      return out;
    },
  });
}
