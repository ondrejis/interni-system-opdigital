import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { SplitRuleInput } from "@rebar/core/contracts";
import { recordAudit } from "@rebar/core/audit";
import { inTx, NotFoundError, UserError, can, type Ctx } from "@rebar/core/rbac";
import { splitRule } from "../schema";
import {
  effectiveSplitRules,
  formatMoney,
  hasErrors,
  previewSplit,
  validateSplitRules,
  type SplitRule,
  type ValidationIssue,
} from "../logic";
import type {
  PersonRef,
  SplitDefaultResult,
  SplitGetResult,
  SplitPreviewResult,
  SplitSetResult,
} from "../contract";
import type { FinDeps } from "./deps";
import { defaultRules } from "./settings";
import { loadJob } from "./jobs";
import { inputToLogicRule, toLogicRule, toRuleView, type RuleRec } from "./model";
import { commitPlan, computePlan, loadState, lockJob, namesOf, toChanges } from "./plan";
import { assertUsers, guarded, loadPeople, today } from "./util";

/** Zkontroluje pravidla zadaná uživatelem: jen známé druhy plateb, platná pole, součet procent ≤ 100 % (R-11). */
export function checkRuleInputs(rules: readonly SplitRuleInput[]): {
  logic: SplitRule[];
  issues: ValidationIssue[];
} {
  for (const r of rules)
    if (r.appliesTo === "recurring")
      throw new UserError("Pravidlo nemůže platit pro opakované platby z Fakturoidu.");
  const logic = rules.map((r, i) => inputToLogicRule(r, i));
  const issues = validateSplitRules(logic);
  const err = issues.find((i) => i.severity === "error");
  if (err) throw new UserError(err.message);
  return { logic, issues };
}

/** Pravidlo česky pro historii: „Ondřej 60 % (jen retainer, do 12/2026)“. */
export function describeRule(r: SplitRule, names: Record<string, string>): string {
  const who = names[r.userId] ?? "?";
  const what =
    r.mode === "percent"
      ? `${String(r.percent).replace(".", ",")} %`
      : r.mode === "fixed_per_payment"
        ? `fixně ${formatMoney(r.fixedMinor ?? 0)} z platby`
        : `fixně celkem ${formatMoney(r.fixedMinor ?? 0)}`;
  const extra = [
    r.appliesTo !== "all" ? `jen ${r.appliesTo}` : "",
    r.validFromMonth ? `od ${r.validFromMonth}` : "",
    r.validToMonth ? `do ${r.validToMonth}` : "",
  ].filter(Boolean);
  return `${who} ${what}${extra.length ? ` (${extra.join(", ")})` : ""}`;
}

/** Pravidla zakázky z databáze (nesmazaná, podle pořadí). */
export async function loadRules(c: Ctx, jobId: string): Promise<RuleRec[]> {
  return c.db
    .select()
    .from(splitRule)
    .where(and(eq(splitRule.jobId, jobId), isNull(splitRule.deletedAt)))
    .orderBy(asc(splitRule.position), asc(splitRule.createdAt));
}

/** Zapíše pravidla zakázky: nahradí všechna (`only` neuvedeno), nebo jen pravidla jednoho druhu platby (`only`). */
export async function writeRules(
  c: Ctx,
  jobId: string,
  rules: readonly SplitRule[],
  only?: "retainer",
): Promise<void> {
  await c.db
    .delete(splitRule)
    .where(and(eq(splitRule.jobId, jobId), only ? eq(splitRule.appliesTo, only) : undefined));
  if (!rules.length) return;
  const [{ max } = { max: -1 }] = await c.db
    .select({ max: sql<number>`coalesce(max(${splitRule.position}), -1)` })
    .from(splitRule)
    .where(eq(splitRule.jobId, jobId));
  await c.db.insert(splitRule).values(
    rules.map((r, i) => ({
      jobId,
      userId: r.userId,
      mode: r.mode,
      percent: r.mode === "percent" ? String(r.percent) : null,
      fixedMinor: r.mode === "percent" ? null : (r.fixedMinor ?? 0),
      appliesTo: r.appliesTo,
      validFromMonth: r.validFromMonth || null,
      validToMonth: r.validToMonth || null,
      position: Number(max) + 1 + i,
      createdBy: c.actor.userId,
      updatedBy: c.actor.userId,
    })),
  );
}

/** Zapíše změnu pravidel do historie zakázky. */
export async function auditRules(
  c: Ctx,
  jobId: string,
  jobTitle: string,
  before: readonly SplitRule[],
  after: readonly SplitRule[],
): Promise<void> {
  const ids = [...before, ...after].map((r) => r.userId);
  const people = await loadPeople(c.db, ids);
  const names = Object.fromEntries(Object.values(people).map((p) => [p.id, p.firstName]));
  const text = (rs: readonly SplitRule[]) =>
    rs.length ? rs.map((r) => describeRule(r, names)).join("; ") : "žádná (vše fakturujícímu)";
  const o = text(before);
  const n = text(after);
  if (o === n) return;
  await recordAudit(c, {
    action: "update",
    entityType: "job",
    entityId: jobId,
    summary: "Rozdělení plateb změněno",
    entityTitle: jobTitle,
    changes: [{ field: "Rozdělení plateb", old: o, new: n }],
  });
}

/** `finance.split.get`: pravidla zakázky s upozorněními. */
export async function getSplit(ctx: Ctx, jobId: string): Promise<SplitGetResult> {
  const job = await loadJob(ctx, jobId);
  if (!job) throw new NotFoundError("Zakázka nenalezena.");
  const rules = await loadRules(ctx, jobId);
  return {
    rules: rules.map(toRuleView),
    issues: validateSplitRules(rules.map(toLogicRule)),
    canEdit: can(ctx, "finance.splits_edit"),
    people: await loadPeople(
      ctx.db,
      rules.map((r) => r.userId),
    ),
  };
}

/**
 * `finance.split.set`: nahradí pravidla zakázky a přepočítá podíly plateb. Změna podílu už zaplacené platby se nejdřív
 * potvrzuje (`needs_confirmation`, nic se nezapíše).
 */
export function setSplit(
  ctx: Ctx,
  input: { jobId: string; rules: SplitRuleInput[]; confirmRecalc: boolean },
): Promise<SplitSetResult> {
  return guarded(async () => {
    const { logic, issues } = checkRuleInputs(input.rules);
    return inTx(ctx, async (c) => {
      const job = await loadJob(c, input.jobId);
      if (!job) throw new NotFoundError("Zakázka nenalezena.");
      await assertUsers(
        c.db,
        input.rules.map((r) => r.userId),
      );
      await lockJob(c, job.id);
      const st = await loadState(c, job);
      const plan = computePlan(st, { payments: st.payments, rules: logic }, today());
      if (plan.confirm.length && !input.confirmRecalc)
        return { status: "needs_confirmation", changes: toChanges(plan) };
      await auditRules(c, job.id, job.title, st.rules.map(toLogicRule), logic);
      await writeRules(c, job.id, logic);
      const recalculated = await commitPlan(c, plan, await namesOf(c, plan));
      return {
        status: "ok",
        warnings: [...issues, ...plan.warnings],
        recalculated,
        rules: (await loadRules(c, job.id)).map(toRuleView),
      } satisfies SplitSetResult;
    });
  });
}

/** `finance.split.preview`: živý náhled rozdělení ukázkové částky. */
export async function previewRules(
  ctx: Ctx,
  input: {
    amountMinor: number;
    kind: "one_off" | "intro" | "retainer" | "extra";
    issuerId?: string | undefined;
    month?: string | undefined;
    rules: SplitRuleInput[];
  },
): Promise<SplitPreviewResult> {
  const issuerId = input.issuerId ?? input.rules[0]?.userId;
  if (!issuerId) return { text: "", allocations: [], warnings: [], error: null };
  const people = await loadPeople(ctx.db, [issuerId, ...input.rules.map((r) => r.userId)]);
  const labels: Record<string, { name: string }> = Object.fromEntries(
    Object.values(people).map((p: PersonRef) => [p.id, { name: p.firstName }]),
  );
  let logic: SplitRule[];
  try {
    logic = checkRuleInputs(input.rules).logic;
  } catch (e) {
    if (e instanceof UserError)
      return { text: "", allocations: [], warnings: [], error: e.message };
    throw e;
  }
  const r = previewSplit({
    amountMinor: input.amountMinor,
    kind: input.kind,
    issuerId,
    ...(input.month ? { month: input.month } : { today: today() }),
    rules: logic,
    people: labels,
  });
  return { text: r.text, allocations: r.allocations, warnings: r.warnings, error: r.error };
}

/** `finance.split.default`: výchozí pravidla nových zakázek. */
export async function getDefaultSplit(ctx: Ctx, deps: FinDeps): Promise<SplitDefaultResult> {
  const d = await defaultRules(ctx.db, deps);
  return {
    ...d,
    people: await loadPeople(
      ctx.db,
      d.rules.map((r) => r.userId),
    ),
  };
}

export { effectiveSplitRules, hasErrors };
