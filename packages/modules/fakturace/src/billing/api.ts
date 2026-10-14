/**
 * Veřejné rozhraní oblasti „billing“ modulu Fakturace (serverový kód, funkce s `ctx`); ostatní se odkazují přes
 * `billingApi` z `@rebar/fakturace/server`.
 *
 *  - `jobInvoicing(ctx, jobId)`: vyfakturováno, uhrazeno, zádržné a zálohy zakázky (bez DPH),
 *  - `finalSettlement(ctx, jobId)`: podklady konečné faktury (smluvní cena − dílčí faktury − zálohy − zádržné),
 *  - `releaseRetention(ctx, jobId, { amountMinor? }, deps)`: koncept dokladu o uvolnění zádržného,
 *  - `createFromStatement(ctx, statementId, deps)`: koncept dílčí faktury ze schváleného soupisu prací,
 *  - `createDraftFromJob(ctx, input, deps)`: záloha, dílčí a konečná faktura z rozpočtu zakázky,
 *  - `retentionOutstanding(ctx, jobId)`: kolik zádržného zbývá uvolnit (kontrola uzavření zakázky).
 * Funkce, které zakládají doklad, potřebují `deps` (údaje o dodavateli z nastavení firmy).
 */
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { recordAudit } from "@rebar/core/audit";
import type { ModuleDeps } from "@rebar/core/module-server";
import { inTx, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { formatMinor } from "@rebar/core/shared";
import { todayIso } from "@rebar/core/time";
import { invoice } from "../schema";
import { fakturaceSetting } from "../settings";
import { lineNetMinor, retentionPct, type VatMode } from "../totals";
import {
  defaultVatBp,
  isVatPayer,
  KIND_TITLE,
  replaceLines,
  supplierNow,
  type InvoiceKind,
  type LineIn,
} from "./core";
import { markStatementInvoiced, recomputeSummary, statementDraft } from "./integrations";
import {
  amountLines,
  buildFinalLines,
  reductionLines,
  releaseLines,
  settlementOf,
  statementInvoiceLines,
  type DraftLine,
} from "./lines";
import {
  approvedChangesTotal,
  billedState,
  loadContract,
  loadHistory,
  loadJob,
  retentionState,
  type JobHistory,
} from "./sources";

export { recomputeSummary } from "./integrations";

/** Fáze zakázky, ve kterých se ještě nefakturuje. */
const NO_BILLING_PHASES = ["inquiry", "offer", "lost"];
/** Fáze, od kterých jde uvolnit zádržné. */
const RELEASE_PHASES = ["handover", "warranty", "closed"];

/* ---------- souhrn zakázky ---------- */

export type JobInvoicing = {
  invoicedMinor: number;
  paidMinor: number;
  retentionHeldMinor: number;
  retentionReleasedMinor: number;
  advancesPaidMinor: number;
};

/** Čistý přepočet souhrnu z historie faktur (částky bez DPH; úhrady přepočtené poměrem na základ). */
export function invoicingOf(h: JobHistory): JobInvoicing {
  let invoiced = 0;
  let paid = 0;
  let advances = 0;
  for (const d of h.docs) {
    invoiced += d.netMinor;
    if (d.grossMinor !== 0 && d.paidMinor !== 0) {
      // poměr se nezaokrouhluje předem: na milionové faktuře by chyba šesti desetinných míst dělala desítky haléřů
      const paidNet = Math.round((d.netMinor * d.paidMinor) / d.grossMinor);
      paid += paidNet;
      if (d.kind === "proforma" && d.state !== "credited") advances += paidNet;
    }
  }
  const r = retentionState(h);
  return {
    invoicedMinor: invoiced,
    paidMinor: paid,
    retentionHeldMinor: r.outstandingMinor,
    retentionReleasedMinor: r.releasedMinor,
    advancesPaidMinor: advances,
  };
}

export async function jobInvoicing(ctx: Ctx, jobId: string): Promise<JobInvoicing> {
  return invoicingOf(await loadHistory(ctx.db, jobId));
}

/** Kolik zádržného zakázky zbývá uvolnit (bez DPH). */
export async function retentionOutstanding(ctx: Ctx, jobId: string): Promise<number> {
  return retentionState(await loadHistory(ctx.db, jobId)).outstandingMinor;
}

/* ---------- konečné vyúčtování ---------- */

export type FinalSettlement = {
  jobId: string;
  currency: string;
  vatMode: VatMode;
  retentionBp: number;
  /** Smluvní cena bez DPH: rozpočet (včetně propsaných změn) a schválené změny mimo rozpočet. */
  contractMinor: number;
  originalContractMinor: number;
  extraChangesMinor: number;
  /** Plnění už vyfakturované dílčími fakturami. */
  billedBeforeMinor: number;
  advancesMinor: number;
  retentionMinor: number;
  /** K fakturaci bez DPH (po odpočtech a zádržném). */
  netMinor: number;
  grossMinor: number;
  advances: { invoiceId: string; number: string; netMinor: number }[];
  unpaidAdvances: { invoiceId: string; number: string; remainingMinor: number }[];
  finalIssued: boolean;
  warnings: string[];
  lines: DraftLine[];
};

async function buildFinal(c: Ctx, jobId: string, deps: ModuleDeps | null) {
  const j = await loadJob(c.db, jobId);
  const contract = await loadContract(c.db, j);
  const h = await loadHistory(c.db, jobId);
  const bs = billedState(h);
  let payer = true;
  let defaultRate = 2100;
  if (deps) {
    const settings = await deps.settings.get(c.db, fakturaceSetting);
    payer = isVatPayer(await supplierNow(c, deps), settings);
    defaultRate = await defaultVatBp(c.db, payer, todayIso());
  }
  const vatMode = j.vatMode as VatMode;
  const lines = buildFinalLines({
    items: contract.budget.items,
    billedByItem: bs.billedByItem,
    previous: bs.previous,
    advances: bs.advances,
    extraChanges: contract.extraChanges,
    retentionBp: j.retentionBp,
    vatMode,
    defaultRateBp: defaultRate,
    payer,
    currency: j.currency,
    fallback: {
      description: `Dílo dle smlouvy ${j.number} – ${j.title}`,
      netMinor: contract.baseMinor,
    },
  });
  return { j, contract, bs, lines, vatMode, payer, defaultRate };
}

/** Podklady pro konečnou fakturu zakázky; stejné řádky vzniknou v konceptu (`createDraftFromJob` s druhem `final`). */
export async function finalSettlement(
  ctx: Ctx,
  jobId: string,
  deps: ModuleDeps | null = null,
): Promise<FinalSettlement> {
  const { j, contract, bs, lines, vatMode } = await buildFinal(ctx, jobId, deps);
  const s = settlementOf(lines, vatMode);
  const warnings: string[] = [];
  for (const u of bs.unpaidAdvances)
    warnings.push(
      `Záloha ${u.number} ještě není uhrazená (zbývá ${formatMinor(u.remainingMinor, j.currency)}), neodečítá se.`,
    );
  if (bs.finalIssued) warnings.push("Konečná faktura už je vystavená.");
  // Faktura se skládá z rozpočtu, cena v hlavičce zakázky je původní smluvní cena + schválené změny. Rozcházejí se
  // u zakázek převedených ze starého odhadu nebo s rozpočtem upraveným mimo změny; tiše se to nesmí vyfakturovat.
  if (contract.budget.items.length) {
    const headerMinor = j.valueMinor + (await approvedChangesTotal(ctx.db, jobId));
    if (headerMinor !== contract.contractMinor)
      warnings.push(
        `Cena z rozpočtu (${formatMinor(contract.contractMinor, j.currency)}) se liší od ceny zakázky v hlavičce (${formatMinor(headerMinor, j.currency)}). Před vystavením konečné faktury zkontrolujte rozpočet a cenu zakázky.`,
      );
  }
  return {
    jobId,
    currency: j.currency,
    vatMode,
    retentionBp: j.retentionBp,
    contractMinor: contract.contractMinor,
    originalContractMinor: contract.baseMinor,
    extraChangesMinor: contract.extraChanges.reduce((a, e) => a + e.amountMinor, 0),
    billedBeforeMinor: contract.contractMinor - s.remainingWorkMinor,
    advancesMinor: s.advancesMinor,
    retentionMinor: s.retentionMinor,
    netMinor: s.netMinor,
    grossMinor: s.grossMinor,
    advances: bs.advances.map((a) => ({
      invoiceId: a.invoiceId,
      number: a.number,
      netMinor: a.groups.reduce((x, g) => x + g.netMinor, 0),
    })),
    unpaidAdvances: bs.unpaidAdvances,
    finalIssued: bs.finalIssued,
    warnings,
    lines,
  };
}

/* ---------- zakládání konceptů ---------- */

type DraftArgs = {
  kind: InvoiceKind;
  title: string;
  lines: readonly DraftLine[];
  statementId?: string | null;
  note?: string | null;
};

/** Vloží koncept faktury zakázky a naplní ho řádky (v transakci volajícího). */
async function insertDraft(
  c: Ctx,
  j: Awaited<ReturnType<typeof loadJob>>,
  a: DraftArgs,
): Promise<string> {
  const [row] = await c.db
    .insert(invoice)
    .values({
      kind: a.kind,
      title: a.title,
      jobId: j.id,
      companyId: j.companyId,
      personId: j.personId,
      currency: j.currency,
      vatMode: j.vatMode,
      statementId: a.statementId ?? null,
      note: a.note ?? null,
      createdBy: c.actor.userId,
      updatedBy: c.actor.userId,
    })
    .returning({ id: invoice.id });
  const lines: LineIn[] = a.lines.map((l) => ({ ...l }));
  await replaceLines(c, { id: row!.id, kind: a.kind, currency: j.currency }, lines, {
    vatMode: j.vatMode as VatMode,
    retentionBp: j.retentionBp,
  });
  await recordAudit(c, {
    action: "create",
    entityType: "invoice",
    entityId: row!.id,
    summary: a.title,
  });
  await recomputeSummary(c, j.id);
  return row!.id;
}

async function billingContext(c: Ctx, deps: ModuleDeps, j: { vatMode: string }) {
  const settings = await deps.settings.get(c.db, fakturaceSetting);
  const supplier = await supplierNow(c, deps);
  const payer = isVatPayer(supplier, settings);
  if (j.vatMode === "reverse_charge" && !payer)
    throw new UserError(
      "Přenesená daňová povinnost vyžaduje, aby byl dodavatel plátcem DPH. Doplňte DIČ v údajích o firmě.",
    );
  return { payer, defaultRate: await defaultVatBp(c.db, payer, todayIso()) };
}

export type CreateDraftInput = {
  jobId: string;
  kind: "proforma" | "partial" | "final";
  /** Záloha a ruční dílčí faktura: procento ze smluvní ceny, nebo pevná částka bez DPH. */
  percent?: number;
  amountMinor?: number;
};

/** Koncept zálohové, ruční dílčí nebo konečné faktury z rozpočtu zakázky. */
export async function createDraftFromJob(
  ctx: Ctx,
  i: CreateDraftInput,
  deps: ModuleDeps,
): Promise<{ id: string }> {
  return inTx(ctx, async (c) => {
    const j = await loadJob(c.db, i.jobId);
    if (NO_BILLING_PHASES.includes(j.phase))
      throw new UserError(
        "V této fázi zakázky se ještě nefakturuje. Fakturovat jde od přípravy po vyhrané nabídce.",
      );
    const { payer, defaultRate } = await billingContext(c, deps, j);
    const mode = j.vatMode as VatMode;

    if (i.kind === "final") {
      const f = await buildFinal(c, j.id, deps);
      if (f.bs.finalIssued) throw new UserError("Konečná faktura této zakázky už je vystavená.");
      if (!f.lines.some((l) => l.role === "work"))
        throw new UserError("Není co vyúčtovat: všechno plnění je už vyfakturované.");
      const id = await insertDraft(c, j, {
        kind: "final",
        title: `${KIND_TITLE.final} – ${j.number}`,
        lines: f.lines,
      });
      return { id };
    }

    const contract = await loadContract(c.db, j);
    let net: number;
    let label: string;
    const base = i.kind === "proforma" ? "Záloha" : "Fakturace";
    if (i.amountMinor !== undefined) {
      net = i.amountMinor;
      label = `${base} ke smlouvě ${j.number} – ${j.title}`;
    } else if (i.percent) {
      net = Math.round((contract.contractMinor * i.percent) / 100);
      label = `${base} ${String(i.percent).replace(".", ",")} % ke smlouvě ${j.number} – ${j.title}`;
    } else
      throw new UserError(
        i.kind === "proforma"
          ? "Zadejte, kolik procent ceny zakázky (nebo jakou částku) se zálohuje."
          : "Zadejte, kolik procent ceny zakázky (nebo jakou částku) se fakturuje.",
      );
    if (net <= 0)
      throw new UserError(
        "Zakázka nemá nastavenou cenu, nejdřív ji vyplňte (nebo sestavte rozpočet) a nebo zadejte částku.",
      );
    const byRate = new Map<number, number>();
    for (const it of contract.budget.items)
      byRate.set(
        it.vatRateBp,
        (byRate.get(it.vatRateBp) ?? 0) + Math.abs(lineNetMinor(it.quantity, it.unitPriceMinor)),
      );
    const lines = amountLines({
      description: label,
      netMinor: net,
      weights: [...byRate.entries()].map(([vatRateBp, weight]) => ({ vatRateBp, weight })),
      defaultRateBp: defaultRate,
      payer,
      vatMode: mode,
    });
    const pct = i.percent ? ` ${String(i.percent).replace(".", ",")} %` : "";
    const id = await insertDraft(c, j, {
      kind: i.kind,
      title: `${KIND_TITLE[i.kind]}${pct} – ${j.number}`,
      lines,
    });
    return { id };
  });
}

/** Koncept dílčí faktury ze schváleného soupisu provedených prací; řádky po položkách rozpočtu. */
export async function createFromStatement(
  ctx: Ctx,
  statementId: string,
  deps: ModuleDeps,
): Promise<{ id: string }> {
  return inTx(ctx, async (c) => {
    // schválený soupis bez faktury a jeho řádky po položkách rozpočtu dodává oblast soupisů
    const s = await statementDraft(c, statementId);
    const [existing] = await c.db
      .select({ id: invoice.id })
      .from(invoice)
      .where(
        and(
          eq(invoice.statementId, statementId),
          isNull(invoice.deletedAt),
          ne(invoice.state, "credited"),
        ),
      );
    if (existing) throw new UserError("Ze soupisu už existuje koncept nebo faktura.");
    const j = await loadJob(c.db, s.jobId);
    if (NO_BILLING_PHASES.includes(j.phase))
      throw new UserError("V této fázi zakázky se ještě nefakturuje.");
    const { payer, defaultRate } = await billingContext(c, deps, j);
    const lines = statementInvoiceLines(s.lines, payer, j.vatMode as VatMode);
    if (!lines.length) throw new UserError("Soupis neobsahuje žádné provedené práce.");
    // soupis schválený níže než nárokováno: krácení se odečte, zákazník platí schválenou částku
    if (s.reductionMinor > 0)
      lines.push(
        ...reductionLines({
          reductionMinor: s.reductionMinor,
          number: s.number,
          lines,
          payer,
          defaultRateBp: defaultRate,
          vatMode: j.vatMode as VatMode,
        }),
      );
    const period = `${s.periodFrom} – ${s.periodTo}`;
    const id = await insertDraft(c, j, {
      kind: "partial",
      title: `Faktura ze soupisu č. ${s.number} – ${j.number}`,
      lines,
      statementId,
      note: `Soupis provedených prací č. ${s.number} za období ${period}.${s.note ? ` ${s.note}` : ""}`,
    });
    return { id };
  });
}

/** Doklad o uvolnění zádržného (celé nevyúčtované, nebo zadaná část); po předání nebo v záruce. */
export async function releaseRetention(
  ctx: Ctx,
  jobId: string,
  input: { amountMinor?: number },
  deps: ModuleDeps,
): Promise<{ id: string }> {
  return inTx(ctx, async (c) => {
    const j = await loadJob(c.db, jobId);
    if (!RELEASE_PHASES.includes(j.phase))
      throw new UserError(
        "Zádržné jde uvolnit až po předání díla (fáze Předání, Záruka nebo Uzavřeno).",
      );
    await billingContext(c, deps, j);
    await c.db.execute(sql`select pg_advisory_xact_lock(hashtext(${"billing:" + jobId}))`);
    const h = await loadHistory(c.db, jobId);
    const r = retentionState(h);
    if (r.outstandingMinor <= 0) throw new UserError("Na zakázce není žádné zádržné k uvolnění.");
    if (input.amountMinor !== undefined) {
      if (input.amountMinor <= 0) throw new UserError("Částka k uvolnění musí být kladná.");
      if (input.amountMinor > r.outstandingMinor)
        throw new UserError(
          `Lze uvolnit nejvýš ${formatMinor(r.outstandingMinor, j.currency)} (drženo zádržné).`,
        );
    }
    const [draft] = await c.db
      .select({ id: invoice.id })
      .from(invoice)
      .where(
        and(
          eq(invoice.jobId, jobId),
          eq(invoice.kind, "retention"),
          eq(invoice.state, "draft"),
          isNull(invoice.deletedAt),
        ),
      );
    if (draft)
      throw new UserError("Koncept uvolnění zádržného už existuje, dokončete ho nebo smažte.");
    const lines = releaseLines({
      held: r.outstandingGroups,
      ...(input.amountMinor !== undefined ? { amountMinor: input.amountMinor } : {}),
      jobNumber: j.number,
      vatMode: j.vatMode as VatMode,
    });
    if (!lines.length) throw new UserError("Na zakázce není žádné zádržné k uvolnění.");
    const amount = lines.reduce((a, l) => a + l.unitPriceMinor, 0);
    const id = await insertDraft(c, j, {
      kind: "retention",
      title: `Uvolnění zádržného ${retentionPct(j.retentionBp)} % – ${j.number} (${formatMinor(amount, j.currency)})`,
      lines,
    });
    return { id };
  });
}

/** Po vystavení: soupis označit jako vyfakturovaný. */
export async function afterIssue(c: Ctx, inv: { id: string; statementId: string | null }) {
  if (inv.statementId) await markStatementInvoiced(c, inv.statementId, inv.id);
}

/** Po stornu dokladu dobropisem: soupis uvolnit pro novou fakturu. */
export async function afterCredited(c: Ctx, inv: { id: string; statementId: string | null }) {
  if (inv.statementId) await markStatementInvoiced(c, inv.statementId, null);
}
