import { and, eq, isNull, notInArray } from "drizzle-orm";
import { emitDomain } from "@rebar/core/events";
import type { ModuleDeps } from "@rebar/core/module-server";
import { can, inTx, NotFoundError, UserError, type Ctx } from "@rebar/core/rbac";
import { completeJob, setMarketingStage } from "@rebar/zakazky/api";
import { job as jobTable } from "@rebar/zakazky/schema";
import { payment, retainer } from "../schema";
import {
  addMonths,
  dateInMonth,
  retainerEndImpact,
  retainerIssuerFor,
  retainerSchedule,
  type RetainerDef,
} from "../logic";
import type {
  RetainerChangeResult,
  RetainerContinueResult,
  RetainerEndPreview,
  RetainerEndResult,
  RetainerView,
} from "../contract";
import type { SplitRuleInput } from "@rebar/core/contracts";
import { auditPayment, paymentChanges } from "./audit";
import type { FinDeps } from "./deps";
import { loadJob, type JobInfo } from "./jobs";
import { toLogicRule, type PayRec } from "./model";
import { commitPlan, computePlan, loadState, lockJob, namesOf, type JobState } from "./plan";
import { insertPayment, newPayRec } from "./payments";
import { auditRules, checkRuleInputs, writeRules } from "./rules";
import { defaultRules } from "./settings";
import { assertUsers, guarded, thisMonth, today, uniq } from "./util";

/** Řádek retaineru z databáze. */
export type RetainerRec = typeof retainer.$inferSelect;

/** Retainer ve tvaru pro UI. */
export const retainerView = (r: RetainerRec): RetainerView => ({
  id: r.id,
  jobId: r.jobId,
  amountMinor: r.amountMinor,
  fromMonth: r.fromMonth,
  toMonth: r.toMonth,
  issueDay: r.issueDay,
  issuerMode: r.issuerMode,
  issuerId: r.issuerId,
  firstIssuerId: r.firstIssuerId,
  active: r.active,
});

const defOf = (r: RetainerRec): RetainerDef => ({
  id: r.id,
  jobId: r.jobId,
  amountMinor: r.amountMinor,
  fromMonth: r.fromMonth,
  toMonth: r.toMonth,
  issueDay: r.issueDay,
  issuerMode: r.issuerMode,
  issuerId: r.issuerId,
  firstIssuerId: r.firstIssuerId,
  active: r.active,
});

/** Aktivní retainer zakázky (nesmazaný), nebo `undefined`. */
export async function loadActiveRetainer(c: Ctx, jobId: string): Promise<RetainerRec | undefined> {
  const [r] = await c.db
    .select()
    .from(retainer)
    .where(and(eq(retainer.jobId, jobId), eq(retainer.active, true), isNull(retainer.deletedAt)));
  return r;
}

/** Osoby, které se u střídání fakturace střídají (podle pravidel zakázky, výchozího rozdělení a fakturujících). */
async function partnersOf(c: Ctx, deps: FinDeps, st: JobState, r: RetainerRec): Promise<string[]> {
  const def = await defaultRules(c.db, deps);
  const all = uniq([
    r.issuerId,
    ...st.rules.map((x) => x.userId),
    ...def.rules.map((x) => x.userId),
  ]);
  return all.filter((id) => id !== r.firstIssuerId).sort();
}

/**
 * Založí chybějící měsíční platby retaineru do měsíce `upToMonth` včetně (Plánovaná, druh retainer, se spočítaným
 * rozdělením). Idempotentní: měsíc, který už platbu má (i zrušenou nebo v koši), se nezakládá znovu. Volat v transakci
 * pod zámkem zakázky. Vrací id nových plateb.
 */
export async function generateForRetainer(
  c: Ctx,
  deps: FinDeps,
  job: JobInfo,
  r: RetainerRec,
  upToMonth: string,
): Promise<string[]> {
  const existing = await c.db
    .select({ periodMonth: payment.periodMonth, retainerId: payment.retainerId })
    .from(payment)
    .where(eq(payment.retainerId, r.id));
  const st = await loadState(c, job);
  const scheduled = retainerSchedule(defOf(r), {
    upToMonth,
    partnerIds: await partnersOf(c, deps, st, r),
    existing: existing.flatMap((e) =>
      e.periodMonth ? [{ periodMonth: e.periodMonth, retainerId: e.retainerId }] : [],
    ),
  });
  if (!scheduled.length) return [];
  const recs = scheduled.map((s) =>
    newPayRec(c, {
      jobId: job.id,
      companyId: job.companyId,
      description: s.description,
      kind: "retainer",
      periodMonth: s.periodMonth,
      amountMinor: s.amountMinor,
      issuerId: s.issuerId,
      status: "planned",
      issuedOn: s.plannedIssuedOn,
      source: "retainer",
      retainerId: r.id,
      isPrivate: job.isPrivate,
      visibilitySource: job.isPrivate ? "inherited" : "own",
    }),
  );
  const plan = computePlan(
    st,
    { payments: [...st.payments, ...recs], rules: st.rules.map(toLogicRule) },
    today(),
  );
  const names = await namesOf(c, plan);
  const fresh = new Set(recs.map((x) => x.id));
  for (const rec of recs) {
    const mine = plan.entries.find((e) => e.rec.id === rec.id)!;
    await insertPayment(c, rec, mine.after, names);
  }
  // přepočet jen nových plateb; uložené podíly existujících plateb se nemění (potvrzení by tu nikdo nedal)
  await commitPlan(
    c,
    { ...plan, entries: plan.entries.filter((e) => fresh.has(e.rec.id)) },
    names,
    fresh,
  );
  return recs.map((x) => x.id);
}

/** Úloha `finance.retainer.generate`: pro všechny aktivní retainery běžících zakázek založí chybějící platby do `upToMonth`. */
export async function generateAllRetainers(
  ctx: Ctx,
  deps: FinDeps,
  upToMonth: string = thisMonth(),
): Promise<{ retainers: number; created: number }> {
  const rows = await ctx.db
    .select({ id: retainer.id, jobId: retainer.jobId })
    .from(retainer)
    .innerJoin(jobTable, eq(jobTable.id, retainer.jobId))
    .where(
      and(
        eq(retainer.active, true),
        isNull(retainer.deletedAt),
        isNull(jobTable.deletedAt),
        notInArray(jobTable.status, ["done", "cancelled"]),
      ),
    );
  let created = 0;
  for (const row of rows) {
    created += await inTx(ctx, async (c) => {
      const job = await loadJob(c, row.jobId);
      if (!job) return 0;
      await lockJob(c, job.id);
      const [r] = await c.db.select().from(retainer).where(eq(retainer.id, row.id));
      if (!r || !r.active) return 0;
      return (await generateForRetainer(c, deps, job, r, upToMonth)).length;
    });
  }
  return { retainers: rows.length, created };
}

function checkSetup(input: {
  fromMonth: string;
  issuerMode: string;
  firstIssuerId?: string | null | undefined;
}) {
  const now = thisMonth();
  if (input.fromMonth < addMonths(now, -12))
    throw new UserError("Retainer nemůže začínat víc než 12 měsíců v minulosti.");
  if (input.fromMonth > addMonths(now, 24))
    throw new UserError("Retainer nemůže začínat za víc než 24 měsíců.");
  if (input.issuerMode === "alternate" && !input.firstIssuerId)
    throw new UserError("U střídání určete, kdo fakturuje jako první.");
}

/** Uloží pravidla retaineru (platí jen pro druh `retainer`) a zapíše změnu do historie. */
export async function applyRetainerSplit(
  c: Ctx,
  st: JobState,
  split: readonly SplitRuleInput[],
  silentIfDenied = false,
): Promise<void> {
  if (!split.length) return;
  if (!can(c, "finance.splits_edit")) {
    if (silentIfDenied) return;
    throw new UserError("Rozdělení retaineru smí zadat jen ten, kdo upravuje rozdělení plateb.");
  }
  await assertUsers(
    c.db,
    split.map((s) => s.userId),
  );
  const forced = split.map((s) => ({ ...s, appliesTo: "retainer" as const }));
  const before = st.rules.map(toLogicRule);
  const others = before.filter((r) => r.appliesTo !== "retainer");
  const { logic } = checkRuleInputs([
    ...others.map((r) => ({
      userId: r.userId,
      mode: r.mode,
      ...(r.mode === "percent"
        ? { percent: Number(r.percent) }
        : { fixedMinor: r.fixedMinor ?? 0 }),
      appliesTo: r.appliesTo,
      validFrom: r.validFromMonth ?? null,
      validTo: r.validToMonth ?? null,
    })),
    ...forced,
  ]);
  const retainerRules = logic.slice(others.length);
  await writeRules(c, st.job.id, retainerRules, "retainer");
  await auditRules(c, st.job.id, st.job.title, before, [...others, ...retainerRules]);
}

/** `finance.retainer.continue`: Pokračovat na retainer (ZAK-14): založí retainer, pravidla, přesune zakázku do fáze Retainer. */
export function continueRetainer(
  ctx: Ctx,
  deps: ModuleDeps,
  input: {
    jobId: string;
    amountMinor: number;
    fromMonth: string;
    issueDay: number;
    issuerMode: "fixed" | "alternate";
    issuerId: string;
    firstIssuerId?: string | undefined;
    split?: SplitRuleInput[] | undefined;
  },
): Promise<RetainerContinueResult> {
  return guarded(() =>
    inTx(ctx, async (c) => {
      const job = await loadJob(c, input.jobId);
      if (!job) throw new NotFoundError("Zakázka nenalezena.");
      await lockJob(c, job.id);
      if (job.status === "done" || job.status === "cancelled")
        throw new UserError("Zakázka je ukončená.");
      if (job.marketingStage === "retainer" || job.marketingStage === "ended")
        throw new UserError("Zakázka už je ve fázi Retainer nebo ukončená.");
      if (await loadActiveRetainer(c, job.id)) throw new UserError("Zakázka už má retainer.");
      checkSetup(input);
      await assertUsers(c.db, [input.issuerId, input.firstIssuerId]);
      const st0 = await loadState(c, job);
      const [rec] = await c.db
        .insert(retainer)
        .values({
          jobId: job.id,
          amountMinor: input.amountMinor,
          fromMonth: input.fromMonth,
          issueDay: input.issueDay,
          issuerMode: input.issuerMode,
          issuerId: input.issuerId,
          firstIssuerId: input.firstIssuerId ?? null,
          createdBy: c.actor.userId,
          updatedBy: c.actor.userId,
        })
        .returning();
      await applyRetainerSplit(c, st0, input.split ?? []);
      if (job.type === "marketing") await setMarketingStage(c, job.id, "retainer");
      const paymentIds = await generateForRetainer(c, deps, job, rec!, thisMonth());
      const st = await loadState(c, job);
      const plan = computePlan(
        st,
        { payments: st.payments, rules: st.rules.map(toLogicRule) },
        today(),
      );
      return { retainer: retainerView(rec!), paymentIds, warnings: plan.warnings };
    }),
  );
}

/** `finance.retainer.change`: změní retainer od měsíce (výchozí aktuální) a upraví již založené plánované platby od něj dál. */
export function changeRetainer(
  ctx: Ctx,
  deps: FinDeps,
  input: {
    jobId: string;
    effectiveFrom?: string | undefined;
    amountMinor?: number | undefined;
    issueDay?: number | undefined;
    issuerMode?: "fixed" | "alternate" | undefined;
    issuerId?: string | undefined;
    firstIssuerId?: string | null | undefined;
    split?: SplitRuleInput[] | undefined;
  },
): Promise<RetainerChangeResult> {
  return guarded(() =>
    inTx(ctx, async (c) => {
      const job = await loadJob(c, input.jobId);
      if (!job) throw new NotFoundError("Zakázka nenalezena.");
      await lockJob(c, job.id);
      const cur = await loadActiveRetainer(c, job.id);
      if (!cur) throw new UserError("Zakázka nemá aktivní retainer.");
      const mode = input.issuerMode ?? cur.issuerMode;
      const first = input.firstIssuerId === undefined ? cur.firstIssuerId : input.firstIssuerId;
      if (mode === "alternate" && !first)
        throw new UserError("U střídání určete, kdo fakturuje jako první.");
      await assertUsers(c.db, [input.issuerId, first]);
      const [rec] = await c.db
        .update(retainer)
        .set({
          amountMinor: input.amountMinor ?? cur.amountMinor,
          issueDay: input.issueDay ?? cur.issueDay,
          issuerMode: mode,
          issuerId: input.issuerId ?? cur.issuerId,
          firstIssuerId: first,
          updatedBy: c.actor.userId,
        })
        .where(eq(retainer.id, cur.id))
        .returning();
      const st0 = await loadState(c, job);
      await applyRetainerSplit(c, st0, input.split ?? []);
      const st = await loadState(c, job);
      const eff = input.effectiveFrom ?? thisMonth();
      const partners = await partnersOf(c, deps, st, rec!);
      let updated = 0;
      const nextPayments: PayRec[] = st.payments.map((p) => {
        if (
          p.retainerId !== cur.id ||
          p.status !== "planned" ||
          !p.periodMonth ||
          p.periodMonth < eff
        )
          return p;
        updated++;
        return {
          ...p,
          amountMinor: rec!.amountMinor,
          issuerId: retainerIssuerFor(defOf(rec!), p.periodMonth, partners),
          issuedOn: dateInMonth(p.periodMonth, rec!.issueDay),
        };
      });
      const plan = computePlan(
        st,
        { payments: nextPayments, rules: st.rules.map(toLogicRule) },
        today(),
      );
      const names = await namesOf(c, plan);
      for (const p of nextPayments) {
        const old = st.payments.find((x) => x.id === p.id)!;
        if (old === p) continue;
        await c.db
          .update(payment)
          .set({
            amountMinor: p.amountMinor,
            issuerId: p.issuerId,
            issuedOn: p.issuedOn,
            updatedBy: c.actor.userId,
          })
          .where(eq(payment.id, p.id));
        await auditPayment(c, "update", p, "Retainer změněn", paymentChanges(old, p, names));
      }
      // podíly už zaplacených plateb se při změně retaineru nepřepisují
      await commitPlan(
        c,
        { ...plan, entries: plan.entries.filter((e) => e.prevStatus !== "paid") },
        names,
      );
      return { retainer: retainerView(rec!), updatedPayments: updated, warnings: plan.warnings };
    }),
  );
}

async function impactOf(c: Ctx, job: JobInfo, endMonth: string) {
  const st = await loadState(c, job);
  const r = await loadActiveRetainer(c, job.id);
  const refs = st.payments
    .filter((p) => r && p.retainerId === r.id && p.periodMonth)
    .map((p) => ({ id: p.id, periodMonth: p.periodMonth!, status: p.status }));
  const impact = retainerEndImpact(refs, endMonth);
  const byId = new Map(st.payments.map((p) => [p.id, p]));
  return { st, r, impact, byId };
}

/** `finance.retainer.endPreview`: které plánované platby se při ukončení k měsíci zruší a které zůstanou. */
export async function endPreview(
  ctx: Ctx,
  input: { jobId: string; endMonth: string },
): Promise<RetainerEndPreview> {
  const job = await loadJob(ctx, input.jobId);
  if (!job) throw new NotFoundError("Zakázka nenalezena.");
  const { impact, byId } = await impactOf(ctx, job, input.endMonth);
  return {
    cancel: impact.cancelIds.map((id) => {
      const p = byId.get(id)!;
      return {
        id,
        periodMonth: p.periodMonth!,
        description: p.description,
        amountMinor: p.amountMinor,
      };
    }),
    kept: impact.keptIds.map((id) => {
      const p = byId.get(id)!;
      return { id, periodMonth: p.periodMonth!, description: p.description, status: p.status };
    }),
    closesJobNow: input.endMonth <= thisMonth(),
  };
}

/** `finance.retainer.end`: ukončí retainer k měsíci, zruší budoucí plánované platby a (končí-li už teď) dokončí zakázku. */
export function endRetainer(
  ctx: Ctx,
  deps: ModuleDeps,
  input: {
    jobId: string;
    endMonth?: string | undefined;
    cancelPlanned: boolean;
    closeJob: boolean;
  },
): Promise<RetainerEndResult> {
  return guarded(() =>
    inTx(ctx, async (c) => {
      const job = await loadJob(c, input.jobId);
      if (!job) throw new NotFoundError("Zakázka nenalezena.");
      await lockJob(c, job.id);
      const now = thisMonth();
      const cur = await loadActiveRetainer(c, job.id);
      const endMonth = input.endMonth ?? now;
      const canceledPaymentIds: string[] = [];
      let keptPaymentIds: string[] = [];
      if (cur) {
        if (endMonth < cur.fromMonth)
          throw new UserError("Retainer nemůže skončit dřív, než začal.");
        const { st, impact } = await impactOf(c, job, endMonth);
        keptPaymentIds = impact.keptIds;
        await c.db
          .update(retainer)
          .set({ toMonth: endMonth, active: endMonth > now, updatedBy: c.actor.userId })
          .where(eq(retainer.id, cur.id));
        if (input.cancelPlanned && impact.cancelIds.length) {
          const ids = new Set(impact.cancelIds);
          const next = st.payments.map((p): PayRec =>
            ids.has(p.id) ? { ...p, status: "canceled" } : p,
          );
          const plan = computePlan(
            st,
            { payments: next, rules: st.rules.map(toLogicRule) },
            today(),
          );
          const names = await namesOf(c, plan);
          for (const p of next.filter((x) => ids.has(x.id))) {
            const old = st.payments.find((x) => x.id === p.id)!;
            await c.db
              .update(payment)
              .set({ status: "canceled", updatedBy: c.actor.userId })
              .where(eq(payment.id, p.id));
            await auditPayment(
              c,
              "update",
              p,
              "Zrušeno ukončením retaineru",
              paymentChanges(old, p, names),
            );
            const entity = { type: "payment", id: p.id, isPrivate: p.isPrivate };
            await emitDomain(
              c,
              "payment.status_changed",
              { paymentId: p.id, from: old.status, to: "canceled" },
              { entity },
            );
            canceledPaymentIds.push(p.id);
          }
          await commitPlan(
            c,
            { ...plan, entries: plan.entries.filter((e) => e.prevStatus !== "paid") },
            names,
          );
        }
      }
      let completed: RetainerEndResult["completed"] = null;
      if (
        input.closeJob &&
        endMonth <= now &&
        job.status !== "done" &&
        job.status !== "cancelled"
      ) {
        if (job.type === "marketing") await setMarketingStage(c, job.id, "ended");
        completed = await completeJob(c, deps, { jobId: job.id, reason: "retainer_ended" });
      }
      return { canceledPaymentIds, keptPaymentIds, completed };
    }),
  );
}
