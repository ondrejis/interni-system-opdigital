import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { recordAudit } from "@rebar/core/audit";
import {
  assertEntityAccess,
  defineEntity,
  queryRecords,
  resolveEntity,
  visibleIds,
} from "@rebar/core/entities";
import {
  defineCommand,
  defineModuleJob,
  defineModuleServer,
  mergeServers,
  type AttentionItem,
  type ModuleDeps,
} from "@rebar/core/module-server";
import { nextNumber } from "@rebar/core/numbering";
import { area as billing } from "./billing";
import { area as received } from "./received";
import { receivedEntity } from "./received/entity";
import { dispatchArea } from "./dispatch";
import { markOverdueInvoices, notifyInvoicePaid, notifyInvoicesDueSoon } from "./due";
import { addDaysIso, todayIso } from "@rebar/core/time";
import { can, inTx, NotFoundError, scopeOf, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { formatMinor } from "@rebar/core/shared";
import { job, workStatement } from "@rebar/zakazky/schema";
import { budgetApi } from "@rebar/zakazky/server";
import {
  assertInvoiceUnlocked,
  customerNow,
  defaultVatBp,
  isVatPayer,
  KIND_TITLE,
  lineInput,
  loadInvoice,
  loadLines,
  lockReason,
  replaceLines,
  SERIES,
  supplierNow,
  vatModeSchema,
  type InvoiceKind,
} from "./billing/core";
import { afterCredited, afterIssue } from "./billing/api";
import { recomputeSummary } from "./billing/integrations";
import { billedState, loadHistory, retentionState } from "./billing/sources";
import { EXPORT_ADAPTERS, type ExportRow } from "./exports";
import { prepareAccountingPackage, type PackageOptions } from "./export/package";
import {
  buildSingleIsdoc,
  prepareIsdocExport,
  prepareVatReport,
  type IsdocExportOptions,
  type VatReportOptions,
} from "./export/accounting";
import { invoicePdf, type InvoiceDoc } from "./pdf";
import { deleteBlockers } from "./delete-blockers";
import { dashboardMetrics } from "./metrics";
import { invoice, invoiceLine, payment } from "./schema";
import { fakturaceSetting, type FakturaceSettings } from "./settings";
import {
  documentTotals,
  paymentState,
  REVERSE_CHARGE_TEXT,
  type LineRole,
  type VatMode,
} from "./totals";

export { KINDS, type InvoiceKind } from "./billing/core";
export { markOverdueInvoices, notifyInvoicesDueSoon, notifyReceivedOverdue } from "./due";

/** Šablona PDF nabídky patří Zakázkám, upravuje se ale na stránce Nastavení fakturace. */
const offerTemplateSetting = budgetApi.offerTemplateSetting;

/* ---------- entita ---------- */

export const invoiceEntity = defineEntity({
  key: "invoice",
  listPath: "/fakturace",
  module: "fakturace",
  label: { one: "Faktura", many: "Faktury" },
  table: invoice,
  titleKey: "title",
  permissions: { read: "fakturace.read", write: "fakturace.write", export: "fakturace.export" },
  ownerColumns: [invoice.createdBy],
  beforeCreate: async (_ctx, values) => {
    const out = { ...values };
    out.state = "draft";
    if (!out.title) out.title = KIND_TITLE[(out.kind as InvoiceKind) ?? "partial"] ?? "Faktura";
    return out;
  },
  afterUpdate: async (_ctx, before, after) => {
    if (before.state === "draft") return;
    for (const f of [
      "companyId",
      "personId",
      "jobId",
      "kind",
      "issueDate",
      "taxableDate",
      "dueDate",
      "title",
    ]) {
      if (String(before[f] ?? "") !== String(after[f] ?? ""))
        throw new UserError(
          "Vystavený doklad už nejde měnit, upravit lze jen poznámku. Chybu opravte dobropisem.",
        );
    }
  },
  beforeDelete: async (_ctx, raw) => {
    if (raw.state !== "draft")
      throw new UserError("Vystavenou fakturu nejde smazat, jen stornovat dobropisem.");
  },
  attributes: [
    {
      key: "title",
      label: "Název",
      type: "text",
      field: "title",
      width: 260,
      defaultVisible: true,
    },
    {
      key: "number",
      label: "Číslo",
      type: "text",
      field: "number",
      readonly: true,
      width: 140,
      defaultVisible: true,
    },
    {
      key: "kind",
      label: "Druh",
      type: "select",
      field: "kind",
      required: true,
      choices: [
        { value: "proforma", label: "Zálohová", color: "purple" },
        { value: "partial", label: "Průběžná", color: "blue" },
        { value: "final", label: "Vyúčtování", color: "indigo" },
        { value: "credit_note", label: "Dobropis", color: "orange" },
        { value: "retention", label: "Uvolnění zádržného", color: "teal" },
      ],
      width: 160,
      defaultVisible: true,
    },
    {
      key: "vatMode",
      label: "Režim DPH",
      type: "select",
      field: "vatMode",
      readonly: true,
      choices: [
        { value: "standard", label: "Běžný", color: "gray" },
        { value: "reverse_charge", label: "Přenesená daň. povinnost", color: "purple" },
      ],
      width: 190,
      defaultVisible: true,
    },
    {
      key: "state",
      label: "Stav",
      type: "select",
      field: "state",
      readonly: true,
      choices: [
        { value: "draft", label: "Koncept", color: "gray" },
        { value: "issued", label: "Vystaveno", color: "blue" },
        { value: "partial", label: "Částečně uhrazeno", color: "orange" },
        { value: "paid", label: "Uhrazeno", color: "green" },
        { value: "credited", label: "Stornováno dobropisem", color: "gray" },
      ],
      width: 160,
      defaultVisible: true,
    },
    {
      key: "company",
      label: "Odběratel",
      type: "record",
      field: "companyId",
      record: { entityType: "company" },
      required: true,
      width: 220,
      defaultVisible: true,
    },
    {
      key: "person",
      label: "Kontaktní osoba",
      type: "record",
      field: "personId",
      record: { entityType: "person" },
      width: 180,
    },
    {
      key: "job",
      label: "Zakázka",
      type: "record",
      field: "jobId",
      record: { entityType: "job" },
      width: 200,
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
    {
      key: "net",
      label: "Základ",
      type: "currency",
      field: "netMinor",
      readonly: true,
      aggregate: ["sum"],
      width: 130,
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
      readonly: true,
      aggregate: ["sum"],
      width: 140,
      defaultVisible: true,
    },
    {
      key: "retention",
      label: "Zádržné",
      type: "currency",
      field: "retentionMinor",
      readonly: true,
      aggregate: ["sum"],
      width: 120,
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
      key: "overdue",
      label: "Po splatnosti",
      type: "checkbox",
      field: "overdue",
      readonly: true,
      width: 120,
    },
    {
      key: "variableSymbol",
      label: "Variabilní symbol",
      type: "text",
      field: "variableSymbol",
      readonly: true,
      width: 140,
    },
    {
      key: "sentOn",
      label: "Odesláno e-mailem",
      type: "date",
      field: "sentOn",
      readonly: true,
      width: 150,
    },
    {
      key: "reminderCount",
      label: "Upomínky",
      type: "number",
      field: "reminderCount",
      readonly: true,
      width: 110,
    },
    {
      key: "lastReminderOn",
      label: "Poslední upomínka",
      type: "date",
      field: "lastReminderOn",
      readonly: true,
      width: 150,
    },
    {
      key: "originalInvoice",
      label: "K dokladu",
      type: "record",
      field: "originalInvoiceId",
      record: { entityType: "invoice" },
      readonly: true,
      width: 160,
    },
    { key: "note", label: "Poznámka", type: "longtext", field: "note", width: 300 },
  ],
  search: (r) => ({
    title: String(r.number ?? r.title),
    subtitle: String(r.title ?? ""),
    extra: String(r.variableSymbol ?? ""),
  }),
  url: (id) => `/fakturace/${id}`,
});

/* ---------- pomocníky ---------- */

async function readInvoice(ctx: Ctx, id: string) {
  await assertEntityAccess(ctx, "invoice", id, "read");
}
async function writeInvoice(ctx: Ctx, id: string) {
  await assertEntityAccess(ctx, "invoice", id, "write");
}

/** Zádržné zakázky v setinách procenta (0 bez zakázky). */
async function jobRetentionBp(db: Ctx["db"], jobId: string | null): Promise<number> {
  if (!jobId) return 0;
  const [j] = await db.select({ bp: job.retentionBp }).from(job).where(eq(job.id, jobId));
  return j?.bp ?? 0;
}

/* ---------- úprava konceptu ---------- */

export const saveDraft = defineCommand({
  name: "fakturace.saveDraft",
  permission: "fakturace.write",
  input: z.object({
    id: z.uuid(),
    title: z.string().trim().max(200).optional(),
    companyId: z.uuid().optional(),
    personId: z.uuid().nullish(),
    issueDate: z.iso.date().nullish(),
    taxableDate: z.iso.date().nullish(),
    dueDate: z.iso.date().nullish(),
    note: z.string().trim().max(2000).nullish(),
    /** Režim DPH dokladu (přenesená daňová povinnost); bez hodnoty zůstává stávající. */
    vatMode: vatModeSchema.optional(),
    lines: z.array(lineInput).max(200),
  }),
  handler: async (ctx, i, deps) => {
    await writeInvoice(ctx, i.id);
    await inTx(ctx, async (c) => {
      // řádek faktury se zamkne dřív, než se přečte stav: souběžné vystavení (zamyká ho taky) by jinak mohlo
      // doklad zamknout mezi kontrolou a přepsáním řádků a uložení by změnilo už vystavenou fakturu
      await c.db.execute(sql`select id from invoice where id = ${i.id} for update`);
      const cur = await loadInvoice(c.db, i.id);
      assertInvoiceUnlocked(cur);
      if (i.companyId) await customerNow(c.db, i.companyId);
      const mode = (i.vatMode ?? cur.vatMode) as VatMode;
      if (mode === "reverse_charge") {
        const settings = await deps.settings.get(c.db, fakturaceSetting);
        if (!isVatPayer(await supplierNow(c, deps), settings))
          throw new UserError(
            "Přenesená daňová povinnost vyžaduje, aby byl dodavatel plátcem DPH. Doplňte DIČ v údajích o firmě.",
          );
      }
      await c.db
        .update(invoice)
        .set({
          ...(i.title ? { title: i.title } : {}),
          ...(i.companyId ? { companyId: i.companyId } : {}),
          personId: i.personId === undefined ? cur.personId : i.personId,
          issueDate: i.issueDate ?? null,
          taxableDate: i.taxableDate ?? null,
          dueDate: i.dueDate ?? null,
          note: i.note || null,
          updatedBy: c.actor.userId,
        })
        .where(eq(invoice.id, i.id));
      await replaceLines(c, cur, i.lines, {
        vatMode: mode,
        retentionBp: await jobRetentionBp(c.db, cur.jobId),
      });
      await recomputeSummary(c, cur.jobId);
    });
  },
});

/* ---------- vystavení ---------- */

export const issue = defineCommand({
  name: "fakturace.issue",
  permission: "fakturace.write",
  input: z.object({
    id: z.uuid(),
    issueDate: z.iso.date().optional(),
    taxableDate: z.iso.date().optional(),
    dueDate: z.iso.date().optional(),
  }),
  handler: async (ctx, i, deps) => {
    await writeInvoice(ctx, i.id);
    return inTx(ctx, async (c) => {
      const [locked] = await c.db.execute<{ id: string; job_id: string | null }>(
        sql`select id, job_id from invoice where id = ${i.id} and deleted_at is null for update`,
      );
      if (!locked) throw new NotFoundError("Faktura nenalezena.");
      if (locked.job_id)
        await c.db.execute(
          sql`select pg_advisory_xact_lock(hashtext(${"billing:" + locked.job_id}))`,
        );
      const cur = await loadInvoice(c.db, i.id);
      if (cur.state !== "draft") throw new UserError("Doklad už je vystavený.");
      const lines = await loadLines(c.db, i.id);
      if (!lines.length) throw new UserError("Doklad nemá žádné položky.");
      const credit = cur.kind === "credit_note";
      if (!credit && cur.grossMinor <= 0)
        throw new UserError(
          "Celková částka faktury musí být kladná. Zkontrolujte položky a odpočty.",
        );
      if (credit && cur.grossMinor >= 0) throw new UserError("Dobropis musí mít zápornou částku.");

      const settings = await deps.settings.get(c.db, fakturaceSetting);
      const supplier = await supplierNow(c, deps);
      if (supplier.name === "—")
        throw new UserError(
          "Doplňte v Nastavení údaje o firmě (název, adresa, IČO), jsou na každé faktuře.",
        );
      const customer = await customerNow(c.db, cur.companyId);
      if (cur.vatMode === "reverse_charge") {
        if (!isVatPayer(supplier, settings))
          throw new UserError(
            "Přenesená daňová povinnost vyžaduje, aby byl dodavatel plátcem DPH. Doplňte DIČ v údajích o firmě.",
          );
        if (!customer.dic)
          throw new UserError(
            "Přenesená daňová povinnost vyžaduje, aby měl odběratel DIČ (musí být plátce DPH). Doplňte DIČ v kontaktu.",
          );
      }

      if (credit && cur.originalInvoiceId) {
        // dobropisy k jedné faktuře dohromady nepřesáhnou její hodnotu (dva koncepty založené předem by ji stornovaly dvakrát)
        await c.db.execute(
          sql`select id from invoice where id = ${cur.originalInvoiceId} for update`,
        );
        const original = await loadInvoice(c.db, cur.originalInvoiceId);
        const [credited] = await c.db
          .select({ g: sql<number>`coalesce(sum(${invoice.grossMinor}), 0)::bigint` })
          .from(invoice)
          .where(
            and(
              eq(invoice.originalInvoiceId, cur.originalInvoiceId),
              eq(invoice.kind, "credit_note"),
              eq(invoice.state, "issued"),
              isNull(invoice.deletedAt),
            ),
          );
        const already = -Number(credited?.g ?? 0);
        if (already - cur.grossMinor > original.grossMinor)
          throw new UserError(
            `Dobropisy k faktuře ${original.number ?? ""} by přesáhly její hodnotu (už vystaveno ${formatMinor(already, cur.currency)} z ${formatMinor(original.grossMinor, cur.currency)}). Dobropis smažte nebo upravte částky.`,
          );
      }

      if (cur.jobId && (cur.kind === "retention" || cur.kind === "final")) {
        const h = await loadHistory(c.db, cur.jobId);
        if (cur.kind === "retention") {
          const out = retentionState(h).outstandingMinor;
          if (cur.netMinor > out)
            throw new UserError(
              `Uvolnit lze nejvýš ${formatMinor(out, cur.currency)} zádržného, doklad žádá ${formatMinor(cur.netMinor, cur.currency)}.`,
            );
        } else if (billedState(h).finalIssued)
          throw new UserError("Konečná faktura této zakázky už je vystavená.");
      }

      const issueDate = i.issueDate ?? cur.issueDate ?? todayIso();
      const taxableDate = i.taxableDate ?? cur.taxableDate ?? issueDate;
      const dueDate = credit
        ? issueDate
        : (i.dueDate ?? cur.dueDate ?? addDaysIso(issueDate, settings.dueDays));
      if (dueDate < issueDate) throw new UserError("Splatnost nemůže být před datem vystavení.");

      // doklad vrácený do konceptu si ponechává své číslo (v řadě nevzniká díra)
      const number =
        cur.number ??
        (await nextNumber(
          c.db,
          SERIES[cur.kind as InvoiceKind],
          new Date(`${issueDate}T12:00:00`),
        ));
      let vs = cur.variableSymbol ?? number.replace(/\D/g, "");
      if (credit && cur.originalInvoiceId)
        vs = (await loadInvoice(c.db, cur.originalInvoiceId)).variableSymbol ?? vs;

      await c.db
        .update(invoice)
        .set({
          number,
          state: "issued",
          issueDate,
          taxableDate,
          dueDate,
          variableSymbol: vs,
          supplier,
          customer,
          issuedAt: todayIso(),
          lockedAt: new Date(),
          overdue: !credit && dueDate < todayIso(),
          updatedBy: c.actor.userId,
        })
        .where(eq(invoice.id, i.id));
      await recordAudit(c, {
        action: "update",
        entityType: "invoice",
        entityId: i.id,
        summary: `Vystaveno: ${number} (${formatMinor(cur.grossMinor, cur.currency)})`,
        changes: [
          { field: "Číslo", old: null, new: number },
          { field: "Stav", old: "Koncept", new: "Vystaveno" },
        ],
      });

      if (!credit) await afterIssue(c, cur);

      if (credit && cur.originalInvoiceId) {
        const credits = await c.db
          .select({ g: sql<number>`coalesce(sum(${invoice.grossMinor}), 0)::bigint` })
          .from(invoice)
          .where(
            and(
              eq(invoice.originalInvoiceId, cur.originalInvoiceId),
              eq(invoice.kind, "credit_note"),
              eq(invoice.state, "issued"),
              isNull(invoice.deletedAt),
            ),
          );
        const original = await loadInvoice(c.db, cur.originalInvoiceId);
        if (-Number(credits[0]?.g ?? 0) >= original.grossMinor) {
          await c.db
            .update(invoice)
            .set({ state: "credited", overdue: false, updatedBy: c.actor.userId })
            .where(eq(invoice.id, original.id));
          await recordAudit(c, {
            action: "update",
            entityType: "invoice",
            entityId: original.id,
            summary: `Stornováno dobropisem ${number}`,
          });
          await afterCredited(c, original);
        }
      }
      await recomputeSummary(c, cur.jobId);
      return { number };
    });
  },
});

/* ---------- úhrady ---------- */

async function refreshPaid(c: Ctx, id: string) {
  const cur = await loadInvoice(c.db, id);
  const [sum] = await c.db
    .select({ s: sql<number>`coalesce(sum(${payment.amountMinor}), 0)::bigint` })
    .from(payment)
    .where(and(eq(payment.invoiceId, id), isNull(payment.deletedAt)));
  const paid = Number(sum?.s ?? 0);
  const state = cur.state === "credited" ? "credited" : paymentState(cur.grossMinor, paid);
  const overdue =
    (state === "issued" || state === "partial") && !!cur.dueDate && cur.dueDate < todayIso();
  await c.db
    .update(invoice)
    .set({ paidMinor: paid, state, overdue, updatedBy: c.actor.userId })
    .where(eq(invoice.id, id));
  return { paid, state };
}

export const addPayment = defineCommand({
  name: "fakturace.addPayment",
  permission: "fakturace.write",
  input: z.object({
    invoiceId: z.uuid(),
    date: z.iso.date("Vyplňte datum úhrady."),
    amountMinor: z.number().int().positive("Částka musí být kladná."),
    method: z.string().trim().max(40).nullish(),
    note: z.string().trim().max(300).nullish(),
  }),
  handler: async (ctx, i) => {
    await writeInvoice(ctx, i.invoiceId);
    return inTx(ctx, async (c) => {
      await c.db.execute(sql`select id from invoice where id = ${i.invoiceId} for update`);
      const cur = await loadInvoice(c.db, i.invoiceId);
      if (cur.kind === "credit_note") throw new UserError("Dobropis se neplatí.");
      if (cur.state === "draft")
        throw new UserError("Koncept ještě není vystavený, úhradu zapište až po vystavení.");
      if (cur.state === "credited") throw new UserError("Doklad je stornovaný dobropisem.");
      const remaining = cur.grossMinor - cur.paidMinor;
      if (i.amountMinor > remaining)
        throw new UserError(
          `Úhrada je vyšší než zbývající částka (${formatMinor(remaining, cur.currency)}).`,
        );
      const [p] = await c.db
        .insert(payment)
        .values({
          invoiceId: i.invoiceId,
          date: i.date,
          amountMinor: i.amountMinor,
          method: i.method || null,
          note: i.note || null,
          createdBy: c.actor.userId,
          updatedBy: c.actor.userId,
        })
        .returning({ id: payment.id });
      const r = await refreshPaid(c, i.invoiceId);
      await recordAudit(c, {
        action: "update",
        entityType: "invoice",
        entityId: i.invoiceId,
        summary: `Úhrada ${formatMinor(i.amountMinor, cur.currency)}${r.state === "paid" ? " – doklad uhrazen" : ""}`,
      });
      await recomputeSummary(c, cur.jobId);
      if (r.state === "paid" && cur.state !== "paid") {
        const [j] = cur.jobId
          ? await c.db.select({ managerId: job.managerId }).from(job).where(eq(job.id, cur.jobId))
          : [];
        await notifyInvoicePaid(
          c.db,
          { ...cur, managerId: j?.managerId ?? null },
          c.actor.userId ?? null,
        );
      }
      return { id: p!.id, state: r.state };
    });
  },
});

export const removePayment = defineCommand({
  name: "fakturace.removePayment",
  permission: "fakturace.write",
  input: z.object({ id: z.uuid() }),
  handler: async (ctx, i) => {
    await inTx(ctx, async (c) => {
      const [p] = await c.db
        .select()
        .from(payment)
        .where(and(eq(payment.id, i.id), isNull(payment.deletedAt)));
      if (!p) throw new NotFoundError("Úhrada nenalezena.");
      await writeInvoice(c, p.invoiceId);
      await c.db
        .update(payment)
        .set({ deletedAt: new Date(), updatedBy: c.actor.userId })
        .where(eq(payment.id, i.id));
      await refreshPaid(c, p.invoiceId);
      await recordAudit(c, {
        action: "update",
        entityType: "invoice",
        entityId: p.invoiceId,
        summary: `Úhrada ${formatMinor(p.amountMinor)} odebrána`,
      });
      await recomputeSummary(c, (await loadInvoice(c.db, p.invoiceId)).jobId);
    });
  },
});

/* ---------- dobropis ---------- */

export const createCreditNote = defineCommand({
  name: "fakturace.createCreditNote",
  permission: "fakturace.write",
  input: z.object({ invoiceId: z.uuid() }),
  handler: async (ctx, i) => {
    await writeInvoice(ctx, i.invoiceId);
    return inTx(ctx, async (c) => {
      const orig = await loadInvoice(c.db, i.invoiceId);
      if (orig.kind === "credit_note")
        throw new UserError("K dobropisu nejde vystavit další dobropis.");
      if (orig.state === "draft")
        throw new UserError("Koncept stačí smazat, dobropis se vystavuje k vystavené faktuře.");
      if (orig.state === "credited") throw new UserError("Doklad už je stornovaný dobropisem.");
      const lines = await loadLines(c.db, orig.id);
      const [row] = await c.db
        .insert(invoice)
        .values({
          kind: "credit_note",
          title: `Dobropis k ${orig.number}`,
          jobId: orig.jobId,
          companyId: orig.companyId,
          personId: orig.personId,
          currency: orig.currency,
          vatMode: orig.vatMode,
          originalInvoiceId: orig.id,
          createdBy: c.actor.userId,
          updatedBy: c.actor.userId,
        })
        .returning({ id: invoice.id });
      await replaceLines(
        c,
        { id: row!.id, kind: "credit_note", currency: orig.currency },
        lines.map((l) => ({
          description: l.description,
          quantity: l.quantity,
          unit: l.unit,
          unitPriceMinor: -l.unitPriceMinor,
          vatRateBp: l.vatRateBp,
          role: l.role as LineRole,
          budgetItemId: l.budgetItemId,
          refInvoiceId: l.refInvoiceId,
        })),
        { vatMode: orig.vatMode as VatMode, retentionBp: 0 },
      );
      await recordAudit(c, {
        action: "create",
        entityType: "invoice",
        entityId: row!.id,
        summary: `Dobropis k ${orig.number}`,
      });
      return { id: row!.id };
    });
  },
});

/* ---------- detail ---------- */

export const getInvoice = defineCommand({
  name: "fakturace.get",
  permission: "fakturace.read",
  input: z.object({ id: z.uuid() }),
  handler: async (ctx, i, deps) => {
    await readInvoice(ctx, i.id);
    const row = await loadInvoice(ctx.db, i.id);
    const lines = await loadLines(ctx.db, i.id);
    const payments = await ctx.db
      .select()
      .from(payment)
      .where(and(eq(payment.invoiceId, i.id), isNull(payment.deletedAt)))
      .orderBy(desc(payment.date));
    const settings = await deps.settings.get(ctx.db, fakturaceSetting);
    const supplier = row.supplier ?? (await supplierNow(ctx, deps));
    const customer = row.customer ?? (await customerNow(ctx.db, row.companyId));
    const mode = row.vatMode as VatMode;
    const payer = isVatPayer(supplier, settings);
    const [st] = row.statementId
      ? await ctx.db
          .select({
            number: workStatement.number,
            periodFrom: workStatement.periodFrom,
            periodTo: workStatement.periodTo,
          })
          .from(workStatement)
          .where(eq(workStatement.id, row.statementId))
      : [];
    return {
      id: row.id,
      number: row.number,
      title: row.title,
      kind: row.kind,
      state: row.state,
      jobId: row.jobId,
      companyId: row.companyId,
      personId: row.personId,
      issueDate: row.issueDate,
      taxableDate: row.taxableDate,
      dueDate: row.dueDate,
      note: row.note,
      currency: row.currency,
      netMinor: row.netMinor,
      vatMinor: row.vatMinor,
      grossMinor: row.grossMinor,
      paidMinor: row.paidMinor,
      overdue: row.overdue,
      vatMode: mode,
      retentionMinor: row.retentionMinor,
      retentionBp: await jobRetentionBp(ctx.db, row.jobId),
      statement: st && row.statementId ? { id: row.statementId, ...st } : null,
      customerHasDic: !!customer.dic,
      reverseChargeText: REVERSE_CHARGE_TEXT,
      lockedAt: row.lockedAt ? row.lockedAt.toISOString() : null,
      lockReason: lockReason(row),
      canReopen: row.state === "issued" && row.paidMinor === 0 && can(ctx, "zakazky.approve_all"),
      vatPayer: payer,
      defaultVatBp: await defaultVatBp(ctx.db, payer, todayIso()),
      dueDays: settings.dueDays,
      groups: documentTotals(lines, { vatMode: mode }).groups,
      lines: lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unit: l.unit,
        unitPriceMinor: l.unitPriceMinor,
        vatRateBp: l.vatRateBp,
        netMinor: l.netMinor,
        role: l.role as LineRole,
        budgetItemId: l.budgetItemId,
        refInvoiceId: l.refInvoiceId,
      })),
      payments: payments.map((p) => ({
        id: p.id,
        date: p.date,
        amountMinor: p.amountMinor,
        method: p.method,
        note: p.note,
      })),
    };
  },
});

/* ---------- PDF ---------- */

/** Podklad pro PDF. Vystavený doklad se tiskne z uložených údajů (nezmění se, ani když firma změní adresu); koncept z živých. */
export async function buildInvoiceDoc(ctx: Ctx, deps: ModuleDeps, id: string): Promise<InvoiceDoc> {
  await readInvoice(ctx, id);
  const row = await loadInvoice(ctx.db, id);
  const lines = await loadLines(ctx.db, id);
  const settings = await deps.settings.get(ctx.db, fakturaceSetting);
  const supplier = row.supplier ?? (await supplierNow(ctx, deps));
  const customer = row.customer ?? (await customerNow(ctx.db, row.companyId));
  const [j] = row.jobId
    ? await ctx.db.select({ number: job.number }).from(job).where(eq(job.id, row.jobId))
    : [];
  const [orig] = row.originalInvoiceId
    ? await ctx.db
        .select({ number: invoice.number })
        .from(invoice)
        .where(eq(invoice.id, row.originalInvoiceId))
    : [];
  const [st] = row.statementId
    ? await ctx.db
        .select({
          number: workStatement.number,
          periodFrom: workStatement.periodFrom,
          periodTo: workStatement.periodTo,
        })
        .from(workStatement)
        .where(eq(workStatement.id, row.statementId))
    : [];
  const mode = row.vatMode as VatMode;
  const totals = documentTotals(lines, { vatMode: mode });
  const beforeRetention = documentTotals(
    lines.filter((l) => l.role !== "retention"),
    { vatMode: mode },
  );
  return {
    number: row.number,
    kind: row.kind,
    state: row.state,
    issueDate: row.issueDate,
    taxableDate: row.taxableDate,
    dueDate: row.dueDate,
    supplier,
    customer,
    jobNumber: j?.number ?? null,
    originalNumber: orig?.number ?? null,
    statement: st ?? null,
    lines: lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unit: l.unit,
      unitPriceMinor: l.unitPriceMinor,
      vatRateBp: l.vatRateBp,
      netMinor: l.netMinor,
      vatMinor: l.vatMinor,
      grossMinor: l.grossMinor,
      role: l.role as LineRole,
    })),
    groups: totals.groups,
    netMinor: row.netMinor,
    vatMinor: row.vatMinor,
    grossMinor: row.grossMinor,
    paidMinor: row.paidMinor,
    currency: row.currency,
    variableSymbol: row.variableSymbol,
    note: row.note || settings.notesText || null,
    template: {
      intro: settings.introText,
      footer: settings.footerText,
      contact: settings.footerContact
        ? [supplier.email, supplier.phone, supplier.web].filter(Boolean).join(" · ")
        : "",
      terms: settings.termsText,
      showQr: settings.showQr,
    },
    vatPayer: isVatPayer(supplier, settings),
    vatMode: mode,
    reverseChargeCpa: settings.reverseChargeCpa || null,
    retention:
      row.retentionMinor > 0
        ? {
            bp: await jobRetentionBp(ctx.db, row.jobId),
            retentionNetMinor: row.retentionMinor,
            retentionGrossMinor: beforeRetention.grossMinor - totals.grossMinor,
            grossBeforeMinor: beforeRetention.grossMinor,
          }
        : null,
  };
}

export async function renderInvoicePdf(ctx: Ctx, deps: ModuleDeps, id: string) {
  const doc = await buildInvoiceDoc(ctx, deps, id);
  return {
    filename: `${(doc.number ?? "navrh").replace(/[^\w-]/g, "_")}.pdf`,
    buffer: await invoicePdf(doc),
  };
}

/* ---------- export ---------- */

export const exportInvoices = defineCommand({
  name: "fakturace.export",
  permission: "fakturace.export",
  input: z.object({ adapter: z.string().max(30), from: z.iso.date(), to: z.iso.date() }),
  handler: async (ctx, i) => {
    const adapter = EXPORT_ADAPTERS.find((a) => a.key === i.adapter);
    if (!adapter) throw new UserError("Neznámý formát exportu.");
    if (i.to < i.from) throw new UserError("Konec období je před začátkem.");
    const ids = await visibleIds(ctx, await resolveEntity(ctx.db, invoiceEntity), {
      filters: {
        op: "and",
        conditions: [
          { attr: "issueDate", op: "between", value: [i.from, i.to] },
          { attr: "state", op: "is_any_of", value: ["issued", "partial", "paid", "credited"] },
        ],
      },
    });
    if (!ids.length) throw new UserError("V tomto období nejsou žádné vystavené faktury.");
    const rows = await ctx.db
      .select({ i: invoice, jobNumber: job.number })
      .from(invoice)
      .leftJoin(job, eq(job.id, invoice.jobId))
      .where(inArray(invoice.id, ids))
      .orderBy(asc(invoice.issueDate), asc(invoice.number));
    const data: ExportRow[] = rows.map(({ i: r, jobNumber }) => ({
      number: r.number ?? "",
      kind: r.kind,
      state: r.state,
      issueDate: r.issueDate ?? "",
      taxableDate: r.taxableDate ?? "",
      dueDate: r.dueDate ?? "",
      customerName: r.customer?.name ?? "",
      customerIco: r.customer?.ico ?? "",
      customerDic: r.customer?.dic ?? "",
      variableSymbol: r.variableSymbol ?? "",
      currency: r.currency,
      netMinor: r.netMinor,
      vatMinor: r.vatMinor,
      grossMinor: r.grossMinor,
      paidMinor: r.paidMinor,
      jobNumber: jobNumber ?? "",
      vatMode: r.vatMode,
      retentionMinor: r.retentionMinor,
    }));
    await inTx(ctx, (c) =>
      recordAudit(c, {
        action: "export",
        entityType: "invoice",
        entityId: ids[0]!,
        summary: `Export faktur (${adapter.label}): ${data.length} dokladů, ${i.from} – ${i.to}`,
      }),
    );
    const file = await adapter.run(data);
    // textový obsah jde jako text, binární (XLSX) jako base64 (příkazy vrací JSON)
    return {
      filename: file.filename,
      mime: file.mime,
      content: typeof file.content === "string" ? file.content : file.content.toString("base64"),
      encoding: typeof file.content === "string" ? ("utf8" as const) : ("base64" as const),
      count: data.length,
    };
  },
});

export const exportAdapters = defineCommand({
  name: "fakturace.exportAdapters",
  permission: "fakturace.export",
  input: z.object({}),
  handler: async () =>
    EXPORT_ADAPTERS.map((a) => ({ key: a.key, label: a.label, description: a.description })),
});

/* ---------- nastavení a šablona ---------- */

export const getSettings = defineCommand({
  name: "fakturace.settings.get",
  permission: "settings.manage",
  input: z.object({}),
  handler: async (ctx, _i, deps) => ({
    ...((await deps.settings.getForAdmin(ctx, fakturaceSetting)).value as FakturaceSettings),
    offer: (await deps.settings.getForAdmin(ctx, offerTemplateSetting))
      .value as typeof offerTemplateSetting.default,
  }),
});

export const saveSettings = defineCommand({
  name: "fakturace.settings.save",
  permission: "settings.manage",
  input: (fakturaceSetting.schema as z.ZodType<FakturaceSettings>).and(
    z.object({ offer: offerTemplateSetting.schema }),
  ),
  handler: async (ctx, i, deps) => {
    const { offer, ...rest } = i;
    await deps.settings.set(ctx, fakturaceSetting, rest);
    await deps.settings.set(ctx, offerTemplateSetting, offer);
  },
});

/* ---------- úloha: po splatnosti ---------- */

/** Denně ráno: faktury, kterým včera uplynula splatnost, se označí a fakturanti dostanou upozornění. */
export const overdueJob = defineModuleJob({
  name: "fakturace.overdue",
  schema: z.object({}),
  cron: "30 5 * * *",
  retryLimit: 2,
  async handler(deps) {
    await markOverdueInvoices(deps.db);
  },
});

/** Pracovní dny ráno: vystavené neuhrazené faktury, kterým splatnost nastává do tří dnů. */
export const dueSoonJob = defineModuleJob({
  name: "fakturace.due_soon",
  schema: z.object({}),
  cron: "0 7 * * 1-5",
  retryLimit: 2,
  async handler(deps) {
    await notifyInvoicesDueSoon(deps.db);
  },
});

/* ---------- přehled ---------- */

const canRead = (ctx: Ctx) => scopeOf(ctx, "fakturace.read") !== null;

const base = defineModuleServer({
  entities: [invoiceEntity],
  deleteBlockers,
  commands: [
    saveDraft,
    issue,
    addPayment,
    removePayment,
    createCreditNote,
    getInvoice,
    exportInvoices,
    exportAdapters,
    getSettings,
    saveSettings,
  ],
  jobs: [overdueJob, dueSoonJob],
  attention: [
    async (ctx, deps) => {
      if (!canRead(ctx)) return [];
      const page = await queryRecords(
        ctx,
        deps.registry,
        await resolveEntity(ctx.db, invoiceEntity),
        {
          filters: { op: "and", conditions: [{ attr: "overdue", op: "is_true" }] },
          sort: [{ attr: "dueDate", dir: "asc" }],
          limit: 8,
        },
      );
      return page.rows.map((r): AttentionItem => ({
        id: `invoice-overdue-${r.id}`,
        module: "fakturace",
        severity: "danger",
        title: `Faktura ${String(r.number ?? r.title)} je po splatnosti`,
        detail: `Zbývá ${formatMinor(Number(r.gross) - Number(r.paid))} · splatnost ${String(r.dueDate ?? "")}`,
        href: `/fakturace/${r.id}`,
      }));
    },
  ],
  widgets: [
    async (ctx, deps) => {
      if (!canRead(ctx)) return [];
      const E = await resolveEntity(ctx.db, invoiceEntity);
      const [open, overdue] = await Promise.all([
        queryRecords(ctx, deps.registry, E, {
          filters: {
            op: "and",
            conditions: [
              { attr: "state", op: "is_any_of", value: ["issued", "partial"] },
              { attr: "kind", op: "is_any_of", value: ["proforma", "partial", "final"] },
            ],
          },
          limit: 1,
        }),
        queryRecords(ctx, deps.registry, E, {
          filters: { op: "and", conditions: [{ attr: "overdue", op: "is_true" }] },
          limit: 1,
        }),
      ]);
      const remaining = (open.totals.gross ?? 0) - (open.totals.paid ?? 0);
      return [
        {
          id: "invoices-unpaid",
          module: "fakturace",
          title: "Neuhrazené faktury",
          value: formatMinor(remaining),
          hint: `${open.total} dokladů`,
          href: "/fakturace",
          order: 10,
        },
        {
          id: "invoices-overdue",
          module: "fakturace",
          title: "Po splatnosti",
          value: String(overdue.total),
          hint: overdue.total
            ? formatMinor((overdue.totals.gross ?? 0) - (overdue.totals.paid ?? 0))
            : "vše včas",
          tone: overdue.total ? ("danger" as const) : ("success" as const),
          href: "/fakturace",
          order: 11,
        },
      ];
    },
  ],
  calendarLayers: [
    {
      key: "fakturace.due",
      label: "Splatnosti faktur",
      color: "red",
      items: async (ctx, range) => {
        if (!canRead(ctx)) return [];
        const ids = await visibleIds(ctx, await resolveEntity(ctx.db, invoiceEntity), {
          filters: {
            op: "and",
            conditions: [
              { attr: "state", op: "is_any_of", value: ["issued", "partial"] },
              { attr: "dueDate", op: "between", value: [range.from, range.to] },
            ],
          },
        });
        if (!ids.length) return [];
        const rows = await ctx.db
          .select({
            id: invoice.id,
            number: invoice.number,
            title: invoice.title,
            due: invoice.dueDate,
          })
          .from(invoice)
          .where(
            and(
              inArray(invoice.id, ids),
              gte(invoice.dueDate, range.from),
              lte(invoice.dueDate, range.to),
            ),
          );
        return rows.map((r) => ({
          id: `due-${r.id}`,
          layer: "fakturace.due",
          title: `Splatnost ${r.number ?? r.title}`,
          start: r.due!,
          allDay: true,
          href: `/fakturace/${r.id}`,
        }));
      },
    },
  ],
});

/** Základ modulu (vydané faktury) a oblasti ADR 015, každá ve své složce se svým vlastníkem. */
export const server = mergeServers(base, billing, received, dispatchArea(renderInvoicePdf), {
  dashboardMetrics,
});

export {
  createFromJob,
  createFromStatement,
  finalSettlement,
  jobSummary,
  releaseRetention,
  reopen,
} from "./billing/commands";
export { invoice, invoiceLine, payment };
export const entities = [invoiceEntity];
export { fakturaceSetting } from "./settings";
export { syncDispatches } from "./dispatch";
export { EXPORT_ADAPTERS } from "./exports";
export type { PackageOptions } from "./export/package";

/** Měsíční balík pro účetní (ZIP s PDF a souhrnem); route handler ho posílá jako stream. */
export function buildAccountingPackage(ctx: Ctx, deps: ModuleDeps, opts: PackageOptions) {
  return prepareAccountingPackage(
    ctx,
    deps,
    { invoice: invoiceEntity, received: receivedEntity },
    renderInvoicePdf,
    opts,
  );
}

/** ISDOC jednoho dokladu (vydaného i přijatého podle id); route handler ho posílá jako soubor. */
export { buildSingleIsdoc };
export type { IsdocExportOptions, VatReportOptions };

const exportEntities = () => ({ invoice: invoiceEntity, received: receivedEntity });

/** ZIP s ISDOC vydaných a/nebo přijatých faktur za období (stream). */
export function buildIsdocExport(ctx: Ctx, deps: ModuleDeps, opts: IsdocExportOptions) {
  return prepareIsdocExport(ctx, deps, exportEntities(), opts);
}

/** Podklady pro přiznání DPH za období (CSV nebo XLSX, stream). */
export function buildVatReport(ctx: Ctx, deps: ModuleDeps, opts: VatReportOptions) {
  return prepareVatReport(ctx, deps, exportEntities(), opts);
}
export * from "./totals";
export * as billingApi from "./billing/api";
export * as receivedApi from "./received/api";
