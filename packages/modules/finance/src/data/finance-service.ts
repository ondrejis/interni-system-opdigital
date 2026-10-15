import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { RetainerSetup, ServiceMap, SplitRuleInput } from "@rebar/core/contracts";
import { schema } from "@rebar/core/db";
import type { ModuleDeps } from "@rebar/core/module-server";
import { can, inTx, NotFoundError, UserError, type Ctx } from "@rebar/core/rbac";
import { payment, paymentAllocation, retainer } from "../schema";
import { paymentScope, toLogicRule } from "./model";
import { loadJob } from "./jobs";
import { commitPlan, computePlan, loadState, lockJob, namesOf, writeAllocations } from "./plan";
import { insertPayment, newPayRec } from "./payments";
import { paidSince } from "./client-card";
import { applyRetainerSplit, generateForRetainer } from "./retainer";
import { auditRules, checkRuleInputs, writeRules } from "./rules";
import { defaultRules } from "./settings";
import { assertUsers, guarded, num, thisMonth, today } from "./util";

/** Vstup `initJobFinance` rozšířený o retainer („Rovnou retainer“, R-36); zakázky ho posílají navíc k zmrazenému kontraktu. */
type InitInput = Parameters<ServiceMap["finance"]["initJobFinance"]>[1] & {
  retainer?: RetainerSetup;
};

/** Vlastník systému (aktivní uživatel s rolí `owner`): komu patří platby z Fakturoidu. */
async function ownerUserId(c: Ctx): Promise<string> {
  if (c.actor.userId && can(c, "private.read")) return c.actor.userId;
  const [r] = await c.db
    .select({ id: schema.user.id })
    .from(schema.user)
    .innerJoin(schema.role, eq(schema.role.id, schema.user.roleId))
    .where(
      and(
        eq(schema.role.key, "owner"),
        eq(schema.user.active, true),
        isNull(schema.user.deletedAt),
      ),
    )
    .limit(1);
  if (!r) throw new UserError("V systému není vlastník, kterému by platba patřila.");
  return r.id;
}

async function initJobFinance(ctx: Ctx, deps: ModuleDeps, input: InitInput) {
  return guarded(() =>
    inTx(ctx, async (c) => {
      const job = await loadJob(c, input.jobId);
      if (!job) throw new NotFoundError("Zakázka nenalezena.");
      await lockJob(c, job.id);
      const st0 = await loadState(c, job);

      // rozdělení: bez `splits_edit` se zadané pravidlo ignoruje a platí výchozí z Nastavení (R-21)
      const wanted: SplitRuleInput[] =
        input.split?.length && can(c, "finance.splits_edit")
          ? input.split
          : (await defaultRules(c.db, deps)).rules;
      if (wanted.length && !st0.rules.length) {
        await assertUsers(
          c.db,
          wanted.map((r) => r.userId),
        );
        const { logic } = checkRuleInputs(wanted);
        await writeRules(c, job.id, logic);
        await auditRules(c, job.id, job.title, [], logic);
      }

      const model = input.billingModel ?? job.billingModel;
      const tpl = input.templatePayments.filter(
        (p) => p.kind !== "intro" || model === "intro_then_retainer",
      );
      await assertUsers(
        c.db,
        tpl.map((p) => p.issuerId),
      );
      const recs = tpl.map((p) =>
        newPayRec(c, {
          jobId: job.id,
          companyId: job.companyId,
          description: p.description,
          kind: p.kind === "recurring" ? "one_off" : p.kind,
          amountMinor: p.amountMinor,
          issuerId: p.issuerId,
          dueOn: p.dueOn ?? null,
          periodMonth: p.periodMonth ?? null,
          source: "template",
          isPrivate: job.isPrivate,
          visibilitySource: job.isPrivate ? "inherited" : "own",
        }),
      );
      const ids: string[] = [];
      if (recs.length) {
        const st = await loadState(c, job);
        const plan = computePlan(
          st,
          { payments: [...st.payments, ...recs], rules: st.rules.map(toLogicRule) },
          today(),
        );
        const names = await namesOf(c, plan);
        for (const rec of recs) {
          await insertPayment(c, rec, plan.entries.find((e) => e.rec.id === rec.id)!.after, names);
          ids.push(rec.id);
        }
        await commitPlan(c, plan, names, new Set(ids));
      }

      if (input.retainer) {
        const rs = input.retainer;
        await assertUsers(c.db, [rs.issuerId, rs.firstIssuerId]);
        if (rs.issuerMode === "alternate" && !rs.firstIssuerId)
          throw new UserError("U střídání určete, kdo fakturuje jako první.");
        const [rec] = await c.db
          .insert(retainer)
          .values({
            jobId: job.id,
            amountMinor: rs.amountMinor,
            fromMonth: rs.fromMonth,
            issueDay: rs.issueDay,
            issuerMode: rs.issuerMode,
            issuerId: rs.issuerId,
            firstIssuerId: rs.firstIssuerId ?? null,
            createdBy: c.actor.userId,
            updatedBy: c.actor.userId,
          })
          .returning();
        await applyRetainerSplit(c, await loadState(c, job), rs.split, true);
        ids.push(...(await generateForRetainer(c, deps, job, rec!, thisMonth())));
      }
      return { paymentIds: ids };
    }),
  );
}

async function createStandalonePayment(
  ctx: Ctx,
  input: Parameters<ServiceMap["finance"]["createStandalonePayment"]>[1],
) {
  return guarded(() =>
    inTx(ctx, async (c) => {
      const owner = await ownerUserId(c);
      const rec = newPayRec(c, {
        companyId: input.companyId,
        description: input.description,
        kind: "recurring",
        amountMinor: input.amountMinor,
        issuerId: owner,
        status: "issued",
        invoiceNumber: input.invoiceNumber,
        invoiceUrl: input.invoiceUrl,
        issuedOn: input.issuedOn,
        dueOn: input.dueOn ?? null,
        source: "fakturoid",
        isPrivate: true,
        visibilitySource: "inherited",
      });
      const allocs = [{ userId: owner, amountMinor: rec.amountMinor }];
      await insertPayment(c, rec, allocs, {});
      await writeAllocations(c, rec.id, allocs);
      return { id: rec.id };
    }),
  );
}

/** Služba `finance` pro ostatní moduly (D §2.3): zakázky, klienti, hodiny, můj prostor. */
export function createFinanceService(deps: ModuleDeps): ServiceMap["finance"] {
  return {
    initJobFinance: (ctx, input) => initJobFinance(ctx, deps, input),
    defaultSplit: async (ctx) => (await defaultRules(ctx.db, deps)).rules,
    createStandalonePayment: (ctx, input) => createStandalonePayment(ctx, input),
    incomeSince: (ctx, input) => paidSince(ctx, input.companyIds, input.from),
    unpaidCount: async (ctx, { jobId }) => {
      const [r] = await ctx.db
        .select({ n: sql<number>`count(*)` })
        .from(payment)
        .where(
          and(
            eq(payment.jobId, jobId),
            inArray(payment.status, ["planned", "issued"]),
            isNull(payment.deletedAt),
            paymentScope(ctx),
          ),
        );
      return num(r?.n);
    },
    allocatedByUser: async (ctx, jobId) => {
      const rows = await ctx.db
        .select({
          userId: paymentAllocation.userId,
          sum: sql<number>`sum(${paymentAllocation.amountMinor})`,
        })
        .from(paymentAllocation)
        .innerJoin(payment, eq(payment.id, paymentAllocation.paymentId))
        .where(
          and(
            eq(payment.jobId, jobId),
            eq(payment.status, "paid"),
            sql`${payment.kind} <> 'recurring'`,
            isNull(payment.deletedAt),
            isNull(paymentAllocation.deletedAt),
            paymentScope(ctx),
          ),
        )
        .groupBy(paymentAllocation.userId);
      return Object.fromEntries(rows.map((r) => [r.userId, num(r.sum)]));
    },
  };
}
