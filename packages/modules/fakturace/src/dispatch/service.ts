import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { recordAudit } from "@rebar/core/audit";
import { schema, type Executor } from "@rebar/core/db";
import { assertEntityAccess } from "@rebar/core/entities";
import { enqueueDocumentMail, logDocumentMail, type DocumentMail } from "@rebar/core/mail";
import type { ModuleDeps } from "@rebar/core/module-server";
import { notify } from "@rebar/core/notifications";
import { inTx, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { companySetting, smtpSetting } from "@rebar/core/settings";
import { todayIso } from "@rebar/core/time";
import { company, person } from "@rebar/kontakty/schema";
import { job } from "@rebar/zakazky/schema";
import { loadInvoice } from "../billing/core";
import { INVOICE_MAIL_FAILED } from "../notifications";
import { invoice, invoiceDispatch } from "../schema";
import { emailList, fakturaceSetting } from "../settings";
import { dispatchBlocker, mailVariables, renderMailText, type MailInvoice } from "./templates";

export type DispatchKind = "invoice" | "reminder";
export type RenderPdf = (
  ctx: Ctx,
  deps: ModuleDeps,
  id: string,
) => Promise<{ filename: string; buffer: Buffer }>;

export const SETTINGS_EMAIL_URL = "/nastaveni/email";

const emailSchema = z.email("Zadejte platnou e-mailovou adresu.");

/** Je v Nastavení zapnuté odesílání e-mailů (SMTP)? */
export async function smtpConfigured(ctx: Ctx, deps: ModuleDeps): Promise<boolean> {
  const smtp = await deps.settings.get(ctx.db, smtpSetting);
  return smtp.enabled && !!smtp.host;
}

async function assertSmtp(ctx: Ctx, deps: ModuleDeps) {
  if (!(await smtpConfigured(ctx, deps)))
    throw new UserError(
      "Odesílání e-mailů není nastavené. Správce ho zapne v Nastavení → E-maily (SMTP server).",
    );
}

type InvoiceRow = Awaited<ReturnType<typeof loadInvoice>>;

/** Příjemce dokladu: e-mail kontaktní osoby, jinak e-mail odběratele z dokladu nebo z firmy. */
async function recipientFor(
  db: Executor,
  inv: InvoiceRow,
): Promise<{ email: string; source: string } | null> {
  if (inv.personId) {
    const [p] = await db.select().from(person).where(eq(person.id, inv.personId));
    if (p?.email) return { email: p.email, source: `kontaktní osoba ${p.name}` };
  }
  const snap = inv.customer?.email;
  if (snap) return { email: snap, source: "e-mail odběratele na dokladu" };
  const [c] = await db.select().from(company).where(eq(company.id, inv.companyId));
  return c?.email ? { email: c.email, source: `e-mail firmy ${c.name}` } : null;
}

async function mailInvoice(ctx: Ctx, inv: InvoiceRow): Promise<MailInvoice> {
  const [j] = inv.jobId
    ? await ctx.db.select({ number: job.number }).from(job).where(eq(job.id, inv.jobId))
    : [];
  let customerName = inv.customer?.name;
  if (!customerName) {
    const [c] = await ctx.db.select().from(company).where(eq(company.id, inv.companyId));
    customerName = c?.name ?? "";
  }
  return {
    number: inv.number,
    kind: inv.kind,
    currency: inv.currency,
    grossMinor: inv.grossMinor,
    paidMinor: inv.paidMinor,
    dueDate: inv.dueDate,
    variableSymbol: inv.variableSymbol,
    customerName,
    jobNumber: j?.number ?? null,
    bankAccount: inv.supplier?.bankAccount ?? null,
  };
}

export type DispatchRecord = {
  id: string;
  kind: DispatchKind;
  to: string;
  cc: string[];
  subject: string;
  status: "queued" | "sent" | "failed";
  error: string | null;
  sentBy: string | null;
  createdAt: string;
  sentAt: string | null;
};

/** Údaje pro dialog „Odeslat e-mailem“ / „Poslat upomínku“: příjemce, kopie, předmět a text ze šablony. */
export async function prepareDispatch(
  ctx: Ctx,
  deps: ModuleDeps,
  i: { invoiceId: string; kind: DispatchKind; retryOf?: string | undefined },
) {
  await assertEntityAccess(ctx, "invoice", i.invoiceId, "write");
  const inv = await loadInvoice(ctx.db, i.invoiceId);
  const settings = await deps.settings.get(ctx.db, fakturaceSetting);
  const today = todayIso();
  const blocker = dispatchBlocker(i.kind, inv, today);
  const smtp = await smtpConfigured(ctx, deps);
  const supplier = (await deps.settings.get(ctx.db, companySetting)).name.trim() || "—";
  const text = renderMailText(
    i.kind === "reminder"
      ? { subject: settings.mailReminderSubject, body: settings.mailReminderBody }
      : { subject: settings.mailInvoiceSubject, body: settings.mailInvoiceBody },
    mailVariables(await mailInvoice(ctx, inv), supplier, today),
  );
  let to = await recipientFor(ctx.db, inv);
  if (i.retryOf) {
    const [prev] = await ctx.db
      .select()
      .from(invoiceDispatch)
      .where(and(eq(invoiceDispatch.id, i.retryOf), eq(invoiceDispatch.invoiceId, inv.id)));
    if (prev) to = { email: prev.toEmail, source: "předchozí odeslání" };
  }
  const [me] = await ctx.db
    .select({ email: schema.user.email })
    .from(schema.user)
    .where(eq(schema.user.id, ctx.actor.userId ?? ""));
  const history = await ctx.db
    .select({
      kind: invoiceDispatch.kind,
      status: invoiceDispatch.status,
      at: invoiceDispatch.createdAt,
    })
    .from(invoiceDispatch)
    .where(eq(invoiceDispatch.invoiceId, inv.id))
    .orderBy(desc(invoiceDispatch.createdAt));
  const lastReminder = history.find((h) => h.kind === "reminder" && h.status !== "failed");
  return {
    number: inv.number,
    kind: i.kind,
    to: to?.email ?? "",
    toSource: to?.source ?? null,
    cc: emailList(settings.mailCc),
    myEmail: me?.email ?? null,
    subject: text.subject,
    body: text.body,
    attachmentName: `${(inv.number ?? "doklad").replace(/[^\w-]/g, "_")}.pdf`,
    smtpConfigured: smtp,
    settingsUrl: SETTINGS_EMAIL_URL,
    blocker,
    lastReminderAt: lastReminder ? lastReminder.at.toISOString() : null,
    sentCount: history.filter((h) => h.kind === "invoice" && h.status !== "failed").length,
  };
}

export const sendInput = z.object({
  invoiceId: z.uuid(),
  kind: z.enum(["invoice", "reminder"]),
  to: emailSchema,
  cc: z.array(emailSchema).max(5, "Kopií může být nejvýš 5.").default([]),
  subject: z.string().trim().min(1, "Vyplňte předmět.").max(200),
  body: z.string().trim().min(1, "Vyplňte text e-mailu.").max(5000),
});

/** Odešle doklad (nebo upomínku) e-mailem přes frontu a zapíše evidenci. Vrací záznam evidence ve stavu „ve frontě“. */
export async function sendDispatch(
  ctx: Ctx,
  deps: ModuleDeps,
  renderPdf: RenderPdf,
  raw: z.input<typeof sendInput>,
): Promise<{ dispatchId: string }> {
  const i = sendInput.parse(raw);
  await assertEntityAccess(ctx, "invoice", i.invoiceId, "write");
  const inv0 = await loadInvoice(ctx.db, i.invoiceId);
  const blocker = dispatchBlocker(i.kind, inv0, todayIso());
  if (blocker) throw new UserError(blocker);
  await assertSmtp(ctx, deps);
  const to = i.to.trim().toLowerCase();
  const cc = [...new Set(i.cc.map((c) => c.trim().toLowerCase()))].filter((c) => c !== to);

  const pdf = await renderPdf(ctx, deps, inv0.id);
  const company = await deps.settings.get(ctx.db, companySetting);
  const mail: DocumentMail = {
    to,
    cc,
    replyTo: company.email ?? undefined,
    subject: i.subject,
    body: i.body,
    attachments: [{ name: pdf.filename, mime: "application/pdf", data: pdf.buffer }],
    entity: { type: "invoice", id: inv0.id },
  };

  const { dispatchId, logId } = await inTx(ctx, async (c) => {
    // stav se ověří znovu v transakci (mezitím mohla přijít úhrada)
    const inv = await loadInvoice(c.db, i.invoiceId);
    const why = dispatchBlocker(i.kind, inv, todayIso());
    if (why) throw new UserError(why);
    const logId = await logDocumentMail(c.db, mail);
    const [d] = await c.db
      .insert(invoiceDispatch)
      .values({
        invoiceId: inv.id,
        kind: i.kind,
        toEmail: to,
        cc,
        subject: i.subject,
        emailLogId: logId,
        sentBy: c.actor.userId,
      })
      .returning({ id: invoiceDispatch.id });
    const [{ n } = { n: 0 }] = await c.db
      .select({ n: sql<number>`count(*)::int` })
      .from(invoiceDispatch)
      .where(and(eq(invoiceDispatch.invoiceId, inv.id), eq(invoiceDispatch.kind, i.kind)));
    await recordAudit(c, {
      action: "update",
      entityType: "invoice",
      entityId: inv.id,
      summary:
        i.kind === "reminder"
          ? `Upomínka č. ${n} zařazena k odeslání na ${to}`
          : `E-mail s dokladem zařazen k odeslání na ${to}`,
    });
    return { dispatchId: d!.id, logId };
  });

  try {
    await enqueueDocumentMail(
      { db: ctx.db, queue: deps.queue, cipher: deps.cipher, storage: deps.storage },
      logId,
      mail,
    );
  } catch {
    await ctx.db
      .update(invoiceDispatch)
      .set({ status: "failed", error: "Zařazení do fronty se nepodařilo." })
      .where(eq(invoiceDispatch.id, dispatchId));
    throw new UserError("E-mail se nepodařilo zařadit k odeslání. Zkuste to za chvíli znovu.");
  }
  return { dispatchId };
}

export type BulkResult = {
  invoiceId: string;
  number: string | null;
  ok: boolean;
  to: string | null;
  error: string | null;
};

/** Hromadné odeslání se šablonovým textem; chyba jednoho dokladu nezastaví ostatní, výsledek je po jednotlivých. */
export async function sendBulk(
  ctx: Ctx,
  deps: ModuleDeps,
  renderPdf: RenderPdf,
  i: { invoiceIds: readonly string[]; kind: DispatchKind },
): Promise<BulkResult[]> {
  await assertSmtp(ctx, deps);
  const settings = await deps.settings.get(ctx.db, fakturaceSetting);
  const cc = emailList(settings.mailCc);
  const results: BulkResult[] = [];
  for (const id of [...new Set(i.invoiceIds)]) {
    let number: string | null = null;
    let to: string | null = null;
    try {
      const p = await prepareDispatch(ctx, deps, { invoiceId: id, kind: i.kind });
      number = p.number;
      to = p.to || null;
      if (p.blocker) throw new UserError(p.blocker);
      if (!p.to) throw new UserError("Odběratel ani kontaktní osoba nemají vyplněný e-mail.");
      await sendDispatch(ctx, deps, renderPdf, {
        invoiceId: id,
        kind: i.kind,
        to: p.to,
        cc,
        subject: p.subject,
        body: p.body,
      });
      results.push({ invoiceId: id, number, ok: true, to, error: null });
    } catch (err) {
      results.push({
        invoiceId: id,
        number,
        ok: false,
        to,
        error:
          err instanceof Error && "issues" in err
            ? "Neplatný e-mail nebo text zprávy."
            : (err as Error).message,
      });
    }
  }
  return results;
}

/** Náhled hromadného odeslání: komu které doklady odejdou a které se přeskočí (a proč). */
export async function bulkPreview(
  ctx: Ctx,
  deps: ModuleDeps,
  i: { invoiceIds: readonly string[]; kind: DispatchKind },
) {
  const items: { invoiceId: string; number: string | null; to: string; blocker: string | null }[] =
    [];
  for (const id of [...new Set(i.invoiceIds)]) {
    try {
      const p = await prepareDispatch(ctx, deps, { invoiceId: id, kind: i.kind });
      items.push({
        invoiceId: id,
        number: p.number,
        to: p.to,
        blocker:
          p.blocker ?? (p.to ? null : "Odběratel ani kontaktní osoba nemají vyplněný e-mail."),
      });
    } catch (err) {
      items.push({ invoiceId: id, number: null, to: "", blocker: (err as Error).message });
    }
  }
  return {
    smtpConfigured: await smtpConfigured(ctx, deps),
    settingsUrl: SETTINGS_EMAIL_URL,
    items,
  };
}

/**
 * Srovná evidenci odeslání se stavem e-mailů ve frontě (`email_log`): přenese stav a důvod selhání, přepočte
 * u faktury datum odeslání a počet upomínek a autorovi selhání pošle upozornění. Idempotentní; volá ji úloha
 * každou minutu i čtení evidence (aby byl stav na dokladu aktuální hned).
 */
export async function syncDispatches(db: Executor, invoiceId?: string): Promise<number> {
  const only = invoiceId ? sql`and d.invoice_id = ${invoiceId}` : sql``;
  const changed = await db.execute<{
    id: string;
    invoice_id: string;
    kind: string;
    status: string;
    sent_by: string | null;
    error: string | null;
    to_email: string;
  }>(sql`
    update invoice_dispatch d
       set status = l.status, error = l.error, sent_at = l.sent_at
      from email_log l
     where d.email_log_id = l.id
       and d.status = 'queued'
       and (l.status <> 'queued' or d.error is distinct from l.error)
       ${only}
    returning d.id, d.invoice_id, d.kind, d.status, d.sent_by, d.error, d.to_email
  `);
  const final = changed.filter((r) => r.status !== "queued");
  if (!final.length) return 0;
  const ids = [...new Set(final.map((r) => r.invoice_id))];
  await db.execute(sql`
    update invoice i set
      sent_on = (select (max(d.sent_at) at time zone 'Europe/Prague')::date from invoice_dispatch d
                  where d.invoice_id = i.id and d.kind = 'invoice' and d.status = 'sent'),
      reminder_count = (select count(*)::int from invoice_dispatch d
                         where d.invoice_id = i.id and d.kind = 'reminder' and d.status = 'sent'),
      last_reminder_on = (select (max(d.sent_at) at time zone 'Europe/Prague')::date from invoice_dispatch d
                           where d.invoice_id = i.id and d.kind = 'reminder' and d.status = 'sent')
    where i.id in (${sql.join(
      ids.map((x) => sql`${x}::uuid`),
      sql`, `,
    )})
  `);
  const failed = final.filter((r) => r.status === "failed" && r.sent_by);
  if (failed.length) {
    const nums = await db
      .select({ id: invoice.id, number: invoice.number, title: invoice.title })
      .from(invoice)
      .where(
        sql`${invoice.id} in (${sql.join(
          failed.map((r) => sql`${r.invoice_id}::uuid`),
          sql`, `,
        )})`,
      );
    const label = new Map(nums.map((n) => [n.id, n.number ?? n.title]));
    for (const r of failed)
      await notify(db, INVOICE_MAIL_FAILED, {
        params: {
          subject:
            `E-mail s ${r.kind === "reminder" ? "upomínkou k faktuře" : "fakturou"} ${label.get(r.invoice_id) ?? ""}`.replace(
              "  ",
              " ",
            ),
          to: r.to_email,
          error: r.error ?? "chyba odesílání",
        },
        to: { sender: [r.sent_by] },
        record: { id: r.invoice_id },
        dedupe: r.id,
      });
  }
  return final.length;
}

/** Evidence odeslání dokladu (nejnovější první) s aktuálním stavem. */
export async function listDispatches(ctx: Ctx, invoiceId: string): Promise<DispatchRecord[]> {
  await assertEntityAccess(ctx, "invoice", invoiceId, "read");
  await syncDispatches(ctx.db, invoiceId);
  const rows = await ctx.db
    .select({ d: invoiceDispatch, by: schema.user.name })
    .from(invoiceDispatch)
    .leftJoin(schema.user, eq(schema.user.id, invoiceDispatch.sentBy))
    .where(eq(invoiceDispatch.invoiceId, invoiceId))
    .orderBy(desc(invoiceDispatch.createdAt), asc(invoiceDispatch.id));
  return rows.map(({ d, by }) => ({
    id: d.id,
    kind: d.kind as DispatchKind,
    to: d.toEmail,
    cc: d.cc,
    subject: d.subject,
    status: d.status as DispatchRecord["status"],
    error: d.error,
    sentBy: by ?? null,
    createdAt: d.createdAt.toISOString(),
    sentAt: d.sentAt ? d.sentAt.toISOString() : null,
  }));
}
