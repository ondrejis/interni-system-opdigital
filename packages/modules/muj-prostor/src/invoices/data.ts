import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { createCredentialStore } from "@rebar/core/integrations";
import type { EntityRegistry } from "@rebar/core/entities";
import { resolveEntity, updateRecord } from "@rebar/core/entities";
import { recordAudit } from "@rebar/core/audit";
import type { ServiceRegistry } from "@rebar/core/module-server";
import { NotFoundError, UserError, can, inTx, type Ctx } from "@rebar/core/rbac";
import type { Cipher } from "@rebar/core/security";
import { todayIso } from "@rebar/core/time";
import { company } from "@rebar/kontakty/schema";
import { companyNames } from "../hosting/data";
import { recurringInvoice, recurringService } from "../schema";
import {
  FakturoidError,
  fakturoidConfigSchema,
  loadStoredConfig,
  resolveFakturoid,
  type FakturoidClient,
} from "./fakturoid";
import {
  DEFAULT_INVOICE_LEAD_DAYS,
  invoiceCustomId,
  invoiceLineName,
  invoicePeriod,
  isDueForPreparation,
  minorToMajor,
  normalizeIco,
  subjectCustomId,
} from "./logic";
import type {
  ApproveResult,
  BlockedService,
  FakturoidStatus,
  FakturoidTestResult,
  InvoiceRow,
  InvoicesOverview,
  PrepareResult,
} from "./types";

/** Závislosti, které potřebují příkazy i úloha (úloha nemá `ModuleDeps`, jen jejich část). */
export type InvoiceDeps = {
  registry: EntityRegistry;
  cipher: Cipher;
  services?: Pick<ServiceRegistry, "optional">;
};

type InvoiceRaw = typeof recurringInvoice.$inferSelect;
type ServiceRaw = typeof recurringService.$inferSelect;

const PERMISSION = "muj-prostor.recurring_invoices";

/** Strop počtu řádků v přehledu (návrhů je řádově desítky ročně). */
const ROW_LIMIT = 1000;

/* ===== čtení ===== */

function toRow(inv: InvoiceRaw, svc: ServiceRaw, names: Record<string, string>): InvoiceRow {
  const sent = inv.status === "sent_to_fakturoid";
  return {
    id: inv.id,
    serviceId: svc.id,
    serviceName: svc.name,
    serviceKind: svc.kind,
    period: svc.period,
    companyId: svc.companyId,
    companyName: names[svc.companyId] ?? null,
    periodFrom: inv.periodFrom,
    periodTo: inv.periodTo,
    amountMinor: Number(inv.amountMinor),
    status: inv.status,
    fakturoidNumber: inv.fakturoidNumber,
    fakturoidUrl: inv.fakturoidUrl,
    hasPayment: !!inv.paymentId,
    error: inv.error,
    approvedAt: inv.approvedAt ? inv.approvedAt.toISOString() : null,
    canEdit: inv.status === "draft",
    canApprove: inv.status === "draft" || inv.status === "approved",
    canCancel: inv.status === "draft" || inv.status === "approved",
    canReopen: inv.status === "canceled",
    canRetryPayment: sent && !inv.paymentId,
  };
}

/** Stav nastavení Fakturoidu bez tajemství. */
export async function fakturoidStatus(
  ctx: Ctx,
  deps: Pick<InvoiceDeps, "cipher">,
): Promise<FakturoidStatus> {
  const [stored, resolved] = await Promise.all([
    loadStoredConfig(ctx.db, deps.cipher),
    resolveFakturoid(ctx.db, deps.cipher),
  ]);
  return {
    configured: !!resolved,
    mode: resolved?.mode ?? null,
    account: stored?.config.account ?? null,
    clientIdHint: stored ? `…${stored.config.clientId.slice(-4)}` : null,
    contactEmail: stored?.config.contactEmail ?? null,
    status: stored?.status ?? null,
  };
}

/** Služby, kterým nejde připravit návrh (zapnuté „připravovat fakturu“, ale chybí cena). */
function blockedOf(services: ServiceRaw[], names: Record<string, string>): BlockedService[] {
  return services
    .filter((s) => s.status === "active" && s.autoPrepareInvoice && s.nextRenewal)
    .filter((s) => !s.priceMinor || Number(s.priceMinor) <= 0)
    .map((s) => ({
      serviceId: s.id,
      name: s.name,
      companyName: names[s.companyId] ?? null,
      reason: "no_price" as const,
    }));
}

/** Přehled návrhů a hotových faktur (volitelně jednoho klienta), souhrn a stav Fakturoidu. */
export async function loadInvoicesOverview(
  ctx: Ctx,
  deps: Pick<InvoiceDeps, "registry" | "cipher">,
  opts: { companyId?: string; today?: string } = {},
): Promise<InvoicesOverview> {
  const today = opts.today ?? todayIso();
  const joined = await ctx.db
    .select({ inv: recurringInvoice, svc: recurringService })
    .from(recurringInvoice)
    .innerJoin(recurringService, eq(recurringService.id, recurringInvoice.recurringServiceId))
    .where(
      and(
        isNull(recurringInvoice.deletedAt),
        opts.companyId ? eq(recurringService.companyId, opts.companyId) : undefined,
      ),
    )
    .orderBy(desc(recurringInvoice.periodFrom), desc(recurringInvoice.createdAt))
    .limit(ROW_LIMIT);
  const services = await ctx.db
    .select()
    .from(recurringService)
    .where(
      and(
        isNull(recurringService.deletedAt),
        eq(recurringService.autoPrepareInvoice, true),
        opts.companyId ? eq(recurringService.companyId, opts.companyId) : undefined,
      ),
    );
  const names = await companyNames(ctx, deps, [
    ...joined.map((j) => j.svc.companyId),
    ...services.map((s) => s.companyId),
  ]);
  const rows = joined.map((j) => toRow(j.inv, j.svc, names));
  const drafts = rows.filter((r) => r.status === "draft");
  return {
    today,
    rows,
    summary: {
      draftCount: drafts.length,
      draftTotalMinor: drafts.reduce((s, r) => s + r.amountMinor, 0),
      pendingCount: rows.filter((r) => r.status === "approved").length,
      sentCount: rows.filter((r) => r.status === "sent_to_fakturoid").length,
      withoutPaymentCount: rows.filter((r) => r.canRetryPayment).length,
    },
    blocked: blockedOf(services, names),
    fakturoid: await fakturoidStatus(ctx, deps),
  };
}

/** Počet návrhů, které čekají na rozhodnutí nebo opravu (odznak u položky menu). Bez oprávnění 0. */
export async function countOpenInvoices(ctx: Ctx): Promise<number> {
  if (!can(ctx, PERMISSION)) return 0;
  const [r] = await ctx.db
    .select({ n: sql<number>`count(*)` })
    .from(recurringInvoice)
    .where(
      and(
        isNull(recurringInvoice.deletedAt),
        sql`(${recurringInvoice.status} in ('draft', 'approved')
          or (${recurringInvoice.status} = 'sent_to_fakturoid' and ${recurringInvoice.paymentId} is null))`,
      ),
    );
  return Number(r?.n ?? 0);
}

/* ===== příprava návrhů ===== */

/**
 * Připraví návrhy faktur (FAK-01): pro každou aktivní službu se zapnutým „připravovat fakturu“, jejíž obnova je za
 * `invoice_lead_days` dnů nebo dřív, založí návrh za období od data obnovy. Idempotentní: pro službu a začátek období
 * je návrh jen jeden (unikátní index), opakované spuštění nic nezdvojí ani nepřepíše. Zrušený návrh se nevytváří znovu.
 * Nic se neposílá (žádné e-maily ani notifikace), návrh je vidět jen v UI a v odznaku.
 */
export async function prepareInvoiceDrafts(
  ctx: Ctx,
  deps: Pick<InvoiceDeps, "registry" | "cipher">,
  today = todayIso(),
): Promise<PrepareResult> {
  const services = await ctx.db
    .select()
    .from(recurringService)
    .where(
      and(
        isNull(recurringService.deletedAt),
        eq(recurringService.status, "active"),
        eq(recurringService.autoPrepareInvoice, true),
        isNotNull(recurringService.nextRenewal),
      ),
    );
  const names = await companyNames(
    ctx,
    deps,
    services.map((s) => s.companyId),
  );
  const blocked: BlockedService[] = [];
  let created = 0;
  let existing = 0;
  for (const s of services) {
    const lead = s.invoiceLeadDays ?? DEFAULT_INVOICE_LEAD_DAYS;
    if (!isDueForPreparation(s.nextRenewal, lead, today)) continue;
    const price = Number(s.priceMinor ?? 0);
    if (price <= 0) {
      blocked.push({
        serviceId: s.id,
        name: s.name,
        companyName: names[s.companyId] ?? null,
        reason: "no_price",
      });
      continue;
    }
    const p = invoicePeriod(s.nextRenewal!, s.period, s.since);
    const made = await inTx(ctx, async (c) => {
      const [row] = await c.db
        .insert(recurringInvoice)
        .values({
          recurringServiceId: s.id,
          periodFrom: p.from,
          periodTo: p.to,
          amountMinor: price,
          status: "draft",
          createdBy: c.actor.userId,
          updatedBy: c.actor.userId,
        })
        .onConflictDoNothing()
        .returning({ id: recurringInvoice.id });
      if (!row) return false;
      await recordAudit(c, {
        action: "create",
        entityType: "recurring_invoice",
        entityId: row.id,
        entityTitle: s.name,
        summary: `Připraven návrh faktury za ${p.from} až ${p.to}`,
      });
      return true;
    });
    if (made) created++;
    else existing++;
  }
  return { created, existing, blocked };
}

/* ===== Fakturoid: odběratel a faktura ===== */

type CompanyRaw = typeof company.$inferSelect;

/** Odběratel pro klienta: uložené id → jiná služba téhož klienta → hledání podle `custom_id` a IČO → založení. */
async function ensureSubject(
  c: Ctx,
  client: FakturoidClient,
  svc: ServiceRaw,
  co: CompanyRaw,
): Promise<string> {
  if (svc.fakturoidSubjectId) return svc.fakturoidSubjectId;
  const [sibling] = await c.db
    .select({ id: recurringService.fakturoidSubjectId })
    .from(recurringService)
    .where(
      and(
        eq(recurringService.companyId, svc.companyId),
        isNotNull(recurringService.fakturoidSubjectId),
        isNull(recurringService.deletedAt),
      ),
    )
    .limit(1);
  let id = sibling?.id ?? null;
  if (!id) {
    const ico = normalizeIco(co.ico);
    const found =
      (await client.findSubjectByCustomId(subjectCustomId(co.id))) ??
      (ico ? await client.findSubjectByRegistrationNo(ico) : null);
    id =
      found?.id ??
      (
        await client.createSubject({
          name: co.officialName?.trim() || co.name,
          registrationNo: ico,
          vatNo: co.dic,
          street: co.street,
          city: co.city,
          zip: co.zip,
          country: co.country,
          email: co.email,
          customId: subjectCustomId(co.id),
        })
      ).id;
  }
  await c.db
    .update(recurringService)
    .set({ fakturoidSubjectId: id, updatedBy: c.actor.userId })
    .where(eq(recurringService.id, svc.id));
  return id;
}

/** Založí platbu ve financích (celá vlastníkovi, mimo vyrovnání). Chyba platbu nezruší, jen se vrátí jako text. */
async function createPayment(
  c: Ctx,
  deps: Pick<InvoiceDeps, "services">,
  p: {
    companyId: string;
    description: string;
    amountMinor: number;
    number: string;
    url: string;
    issuedOn: string;
    dueOn: string | null;
  },
): Promise<{ id: string | null; error: string | null }> {
  const finance = deps.services?.optional("finance");
  if (!finance)
    return {
      id: null,
      error: "Faktura je vytvořena, ale modul Finance není zapnutý, platba nevznikla.",
    };
  try {
    // vnořená transakce (savepoint): selhání platby nesmí vzít s sebou už vytvořenou fakturu
    const r = await c.db.transaction((tx) =>
      finance.createStandalonePayment(
        { ...c, db: tx },
        {
          companyId: p.companyId,
          description: p.description,
          amountMinor: p.amountMinor,
          invoiceNumber: p.number,
          invoiceUrl: p.url,
          issuedOn: p.issuedOn,
          ...(p.dueOn ? { dueOn: p.dueOn } : {}),
        },
      ),
    );
    return { id: r.id, error: null };
  } catch (e) {
    const why = e instanceof Error ? e.message : "neznámá chyba";
    return { id: null, error: `Faktura je vytvořena, ale platbu se nepodařilo založit (${why}).` };
  }
}

const lock = async (c: Ctx, id: string) => {
  const [inv] = await c.db
    .select()
    .from(recurringInvoice)
    .where(and(eq(recurringInvoice.id, id), isNull(recurringInvoice.deletedAt)))
    .for("update");
  if (!inv) throw new NotFoundError();
  const [svc] = await c.db
    .select()
    .from(recurringService)
    .where(eq(recurringService.id, inv.recurringServiceId))
    .for("update");
  if (!svc) throw new NotFoundError();
  return { inv, svc };
};

const lineNameOf = (inv: InvoiceRaw, svc: ServiceRaw) =>
  invoiceLineName({ name: svc.name, web: svc.web, from: inv.periodFrom, to: inv.periodTo });

/**
 * **Schválit a vytvořit ve Fakturoidu** (FAK-02, FAK-03). Pod zámkem řádku návrhu: najde nebo založí odběratele
 * (podle IČO), najde fakturu podle `custom_id` (= klíč návrhu) nebo ji vytvoří, uloží číslo a odkaz, posune další obnovu
 * služby o období a založí platbu ve financích (celá vlastníkovi, mimo vyrovnání). Druhé kliknutí nebo souběžné
 * volání počká na zámek a uvidí hotovou fakturu, takže se nic nezdvojí; ztracená odpověď Fakturoidu se při dalším
 * pokusu vyřeší převzetím už vytvořené faktury. Chyba Fakturoidu nechá návrh ve stavu „schváleno“ s důvodem v `error`
 * a hlásí se uživateli; pokus jde zopakovat.
 */
export async function approveInvoice(
  ctx: Ctx,
  deps: InvoiceDeps,
  input: { id: string; expectedAmountMinor: number },
): Promise<ApproveResult> {
  const out = await inTx(ctx, async (c): Promise<{ error: string } | { result: ApproveResult }> => {
    const { inv, svc } = await lock(c, input.id);
    if (inv.status === "canceled")
      throw new UserError("Zrušený návrh nejde schválit. Nejdřív ho obnovte.");
    if (inv.status === "sent_to_fakturoid") {
      // už hotovo: jen případně dodat platbu
      const fixed = await finishPayment(c, deps, inv, svc);
      return {
        result: {
          id: inv.id,
          fakturoidNumber: inv.fakturoidNumber ?? "",
          fakturoidUrl: inv.fakturoidUrl ?? "",
          nextRenewal: null,
          paymentCreated: fixed.paymentCreated,
          warning: fixed.warning,
        },
      };
    }
    if (Number(inv.amountMinor) !== input.expectedAmountMinor)
      throw new UserError("Částka návrhu se mezitím změnila. Obnovte stránku a zkontrolujte ji.");
    const resolved = await resolveFakturoid(c.db, deps.cipher);
    if (!resolved)
      throw new UserError("Fakturoid není nastavený. Vyplňte přístup v Nastavení → Integrace.");
    const [co] = await c.db.select().from(company).where(eq(company.id, svc.companyId));
    if (!co || co.deletedAt) throw new UserError("Klient služby neexistuje nebo je v koši.");

    if (inv.status === "draft")
      await c.db
        .update(recurringInvoice)
        .set({
          status: "approved",
          approvedBy: c.actor.userId,
          approvedAt: new Date(),
          error: null,
        })
        .where(eq(recurringInvoice.id, inv.id));
    const lineName = lineNameOf(inv, svc);
    let fk;
    try {
      fk =
        (await resolved.client.findInvoiceByCustomId(invoiceCustomId(inv.id))) ??
        (await resolved.client.createInvoice({
          subjectId: await ensureSubject(c, resolved.client, svc, co),
          customId: invoiceCustomId(inv.id),
          lines: [
            {
              name: lineName,
              quantity: 1,
              unitName: "ks",
              unitPrice: minorToMajor(Number(inv.amountMinor)),
              vatRate: 0,
            },
          ],
          issuedOn: todayIso(),
          currency: "CZK",
          privateNote: `OPSYS: návrh ${inv.id}`,
        }));
    } catch (e) {
      if (!(e instanceof FakturoidError)) throw e;
      await c.db
        .update(recurringInvoice)
        .set({ error: e.message })
        .where(eq(recurringInvoice.id, inv.id));
      await recordAudit(c, {
        action: "update",
        entityType: "recurring_invoice",
        entityId: inv.id,
        entityTitle: svc.name,
        summary: `Vytvoření faktury ve Fakturoidu selhalo: ${e.message}`,
      });
      return { error: e.message };
    }

    const issuedOn = fk.issuedOn || todayIso();
    await c.db
      .update(recurringInvoice)
      .set({
        status: "sent_to_fakturoid",
        fakturoidId: fk.id,
        fakturoidNumber: fk.number,
        fakturoidUrl: fk.htmlUrl,
        error: null,
      })
      .where(eq(recurringInvoice.id, inv.id));

    // posun další obnovy o období (HOST-03); jen když ji mezitím nikdo neposunul ručně
    let nextRenewal: string | null = null;
    if (svc.nextRenewal === inv.periodFrom) {
      nextRenewal = invoicePeriod(inv.periodFrom, svc.period, svc.since).next;
      await c.db
        .update(recurringService)
        .set({ nextRenewal, updatedBy: c.actor.userId })
        .where(eq(recurringService.id, svc.id));
      await recordAudit(c, {
        action: "update",
        entityType: "recurring_service",
        entityId: svc.id,
        entityTitle: svc.name,
        summary: `Další obnova posunuta po vyfakturování (${fk.number})`,
        changes: [{ field: "nextRenewal", old: svc.nextRenewal, new: nextRenewal }],
      });
    }

    const pay = await createPayment(c, deps, {
      companyId: svc.companyId,
      description: lineName,
      amountMinor: Number(inv.amountMinor),
      number: fk.number,
      url: fk.htmlUrl,
      issuedOn,
      dueOn: fk.dueOn,
    });
    await c.db
      .update(recurringInvoice)
      .set({ paymentId: pay.id, error: pay.error })
      .where(eq(recurringInvoice.id, inv.id));
    await recordAudit(c, {
      action: "update",
      entityType: "recurring_invoice",
      entityId: inv.id,
      entityTitle: svc.name,
      summary: `Faktura ${fk.number} vytvořena ve Fakturoidu`,
      changes: [
        { field: "status", old: inv.status, new: "sent_to_fakturoid" },
        { field: "fakturoidNumber", old: null, new: fk.number },
      ],
    });
    return {
      result: {
        id: inv.id,
        fakturoidNumber: fk.number,
        fakturoidUrl: fk.htmlUrl,
        nextRenewal,
        paymentCreated: !!pay.id,
        warning: pay.error,
      },
    };
  });
  if ("error" in out) throw new UserError(out.error);
  return out.result;
}

/** U hotové faktury bez platby zkusí platbu založit (dohnání po chybě finance). */
async function finishPayment(
  c: Ctx,
  deps: Pick<InvoiceDeps, "services" | "cipher">,
  inv: InvoiceRaw,
  svc: ServiceRaw,
): Promise<{ paymentCreated: boolean; warning: string | null }> {
  if (inv.paymentId) return { paymentCreated: true, warning: null };
  let issuedOn = (inv.approvedAt ?? new Date()).toISOString().slice(0, 10);
  let dueOn: string | null = null;
  try {
    const resolved = await resolveFakturoid(c.db, deps.cipher);
    const fk =
      resolved && inv.fakturoidId ? await resolved.client.getInvoice(inv.fakturoidId) : null;
    if (fk) {
      issuedOn = fk.issuedOn || issuedOn;
      dueOn = fk.dueOn;
    }
  } catch {
    /* termíny se vezmou ze schválení */
  }
  const pay = await createPayment(c, deps, {
    companyId: svc.companyId,
    description: lineNameOf(inv, svc),
    amountMinor: Number(inv.amountMinor),
    number: inv.fakturoidNumber ?? "",
    url: inv.fakturoidUrl ?? "",
    issuedOn,
    dueOn,
  });
  await c.db
    .update(recurringInvoice)
    .set({ paymentId: pay.id, error: pay.error })
    .where(eq(recurringInvoice.id, inv.id));
  return { paymentCreated: !!pay.id, warning: pay.error };
}

/** Znovu založí chybějící platbu u hotové faktury (`muj-prostor.invoices.retryPayment`). */
export async function retryInvoicePayment(
  ctx: Ctx,
  deps: Pick<InvoiceDeps, "services" | "cipher">,
  id: string,
): Promise<{ paymentCreated: boolean; warning: string | null }> {
  return inTx(ctx, async (c) => {
    const { inv, svc } = await lock(c, id);
    if (inv.status !== "sent_to_fakturoid")
      throw new UserError("Platbu jde doplnit jen u faktury vytvořené ve Fakturoidu.");
    return finishPayment(c, deps, inv, svc);
  });
}

/** Úloha: dohnání plateb u hotových faktur, kde platba z nějakého důvodu nevznikla (finance dřív nebyly k dispozici). */
export async function reconcileInvoicePayments(
  ctx: Ctx,
  deps: Pick<InvoiceDeps, "services" | "cipher">,
): Promise<number> {
  if (!deps.services?.optional("finance")) return 0;
  const rows = await ctx.db
    .select({ id: recurringInvoice.id })
    .from(recurringInvoice)
    .where(
      and(
        isNull(recurringInvoice.deletedAt),
        eq(recurringInvoice.status, "sent_to_fakturoid"),
        isNull(recurringInvoice.paymentId),
      ),
    )
    .limit(50);
  let fixed = 0;
  for (const r of rows) {
    const res = await retryInvoicePayment(ctx, deps, r.id);
    if (res.paymentCreated) fixed++;
  }
  return fixed;
}

/* ===== úprava, zrušení, obnovení ===== */

/** Upraví částku konceptu přes engine entity (změna je v historii před → po). */
export async function updateInvoiceAmount(
  ctx: Ctx,
  deps: Pick<InvoiceDeps, "registry">,
  input: { id: string; amountMinor: number },
): Promise<{ id: string; amountMinor: number }> {
  const def = deps.registry.get("recurring_invoice");
  if (!def) throw new UserError("Opakované faktury nejsou zapnuté.");
  const entity = await resolveEntity(ctx.db, def);
  return inTx(ctx, async (c) => {
    const { inv } = await lock(c, input.id);
    if (inv.status !== "draft") throw new UserError("Upravit jde jen koncept faktury.");
    await updateRecord(c, deps.registry, entity, inv.id, { amount: input.amountMinor });
    return { id: inv.id, amountMinor: input.amountMinor };
  });
}

/**
 * Zruší návrh (koncept, nebo schválený, který se nepodařilo vytvořit). Je-li ve Fakturoidu už faktura s klíčem
 * návrhu (ztracená odpověď), zrušení se odmítne: návrh je třeba dokončit schválením, ať se faktura převezme.
 */
export async function cancelInvoice(
  ctx: Ctx,
  deps: Pick<InvoiceDeps, "cipher">,
  id: string,
): Promise<{ id: string }> {
  return inTx(ctx, async (c) => {
    const { inv, svc } = await lock(c, id);
    if (inv.status === "sent_to_fakturoid")
      throw new UserError("Faktura už je vytvořená ve Fakturoidu. Stornujte ji tam.");
    if (inv.status === "canceled") return { id };
    if (inv.status === "approved") {
      const resolved = await resolveFakturoid(c.db, deps.cipher);
      if (resolved) {
        let hit;
        try {
          hit = await resolved.client.findInvoiceByCustomId(invoiceCustomId(inv.id));
        } catch (e) {
          throw new UserError(
            `Nepodařilo se ověřit, zda faktura ve Fakturoidu nevznikla (${e instanceof Error ? e.message : "chyba"}). Zkuste to znovu.`,
          );
        }
        if (hit)
          throw new UserError(
            `Ve Fakturoidu už faktura ${hit.number} existuje. Dokončete schválení, faktura se převezme.`,
          );
      }
    }
    await c.db
      .update(recurringInvoice)
      .set({ status: "canceled", error: null })
      .where(eq(recurringInvoice.id, id));
    await recordAudit(c, {
      action: "update",
      entityType: "recurring_invoice",
      entityId: id,
      entityTitle: svc.name,
      summary: "Návrh faktury zrušen",
      changes: [{ field: "status", old: inv.status, new: "canceled" }],
    });
    return { id };
  });
}

/** Vrátí zrušený návrh do konceptu. */
export async function reopenInvoice(ctx: Ctx, id: string): Promise<{ id: string }> {
  return inTx(ctx, async (c) => {
    const { inv, svc } = await lock(c, id);
    if (inv.status !== "canceled") throw new UserError("Obnovit jde jen zrušený návrh.");
    await c.db
      .update(recurringInvoice)
      .set({ status: "draft", approvedAt: null, approvedBy: null, error: null })
      .where(eq(recurringInvoice.id, id));
    await recordAudit(c, {
      action: "update",
      entityType: "recurring_invoice",
      entityId: id,
      entityTitle: svc.name,
      summary: "Návrh faktury obnoven do konceptu",
      changes: [{ field: "status", old: "canceled", new: "draft" }],
    });
    return { id };
  });
}

/* ===== nastavení Fakturoidu ===== */

/** Zapomene uložená id odběratelů (patří k jinému účtu Fakturoidu). */
async function forgetSubjects(c: Ctx): Promise<void> {
  await c.db
    .update(recurringService)
    .set({ fakturoidSubjectId: null })
    .where(isNotNull(recurringService.fakturoidSubjectId));
}

/** Uloží přístup k Fakturoidu šifrovaně (`integration_credential`); prázdný Client Secret ponechá uložený. */
export async function saveFakturoid(
  ctx: Ctx,
  deps: Pick<InvoiceDeps, "cipher" | "registry">,
  input: {
    account: string;
    clientId: string;
    clientSecret?: string | undefined;
    contactEmail: string;
  },
): Promise<FakturoidStatus> {
  const previous = await loadStoredConfig(ctx.db, deps.cipher);
  const secret = input.clientSecret?.trim() || previous?.config.clientSecret;
  if (!secret) throw new UserError("Vyplňte Client Secret.");
  const parsed = fakturoidConfigSchema.safeParse({
    account: input.account,
    clientId: input.clientId,
    clientSecret: secret,
    contactEmail: input.contactEmail,
  });
  if (!parsed.success) throw new UserError(parsed.error.issues[0]?.message ?? "Neplatné údaje.");
  await createCredentialStore(deps.cipher).save(ctx, {
    provider: "fakturoid",
    data: parsed.data,
    status: "ok",
  });
  if (previous && previous.config.account !== parsed.data.account) await forgetSubjects(ctx);
  return fakturoidStatus(ctx, deps);
}

/** Odpojí Fakturoid (smaže uložený přístup). */
export async function disconnectFakturoid(
  ctx: Ctx,
  deps: Pick<InvoiceDeps, "cipher" | "registry">,
): Promise<FakturoidStatus> {
  await createCredentialStore(deps.cipher).remove(ctx, "fakturoid");
  await forgetSubjects(ctx);
  return fakturoidStatus(ctx, deps);
}

/** Test spojení: přihlášení a načtení účtu. Výsledek (i chyba) se vrací jako data, aby ho panel ukázal přímo. */
export async function testFakturoid(
  ctx: Ctx,
  deps: Pick<InvoiceDeps, "cipher">,
): Promise<FakturoidTestResult> {
  const resolved = await resolveFakturoid(ctx.db, deps.cipher);
  if (!resolved) return { ok: false, message: "Fakturoid není nastavený." };
  const store = createCredentialStore(deps.cipher);
  try {
    const acc = await resolved.client.testConnection();
    if (resolved.mode === "real") await store.setStatus(ctx.db, "fakturoid", null, "ok");
    return { ok: true, accountName: acc.name, mode: resolved.mode };
  } catch (e) {
    if (!(e instanceof FakturoidError)) throw e;
    if (resolved.mode === "real")
      await store.setStatus(ctx.db, "fakturoid", null, e.code === "auth" ? "reauth" : "error");
    return { ok: false, message: e.message };
  }
}
