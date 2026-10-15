import type { SplitRuleInput } from "@rebar/core/contracts";
import { defineCommand, type ModuleDeps } from "@rebar/core/module-server";
import type { Ctx } from "@rebar/core/rbac";
import {
  balanceInput,
  balanceMonthsInput,
  clientOverviewInput,
  jobOverviewInput,
  paymentCreateInput,
  paymentGetInput,
  paymentListInput,
  paymentOverrideInput,
  paymentRecalcInput,
  paymentTransitionInput,
  paymentUpdateInput,
  reportsInput,
  retainerChangeInput,
  retainerContinueInput,
  retainerEndInput,
  retainerEndPreviewInput,
  settingsGetInput,
  settingsSetInput,
  settlementCancelInput,
  settlementCreateInput,
  settlementListInput,
  splitDefaultInput,
  splitGetInput,
  splitPreviewInput,
  splitSetInput,
} from "../contract";
import type { FinanceSettings } from "../contract";
import { clientOverview, jobOverview } from "./overview";
import {
  createPayment,
  getPayment,
  listPayments,
  overrideAllocation,
  recalcJob,
  transitionPayment,
  updatePayment,
} from "./payments";
import { changeRetainer, continueRetainer, endPreview, endRetainer } from "./retainer";
import { reports } from "./reports";
import { checkRuleInputs, getDefaultSplit, getSplit, previewRules, setSplit } from "./rules";
import { balanceBasisSetting, balanceBasisOf, defaultRules, defaultSplitSetting } from "./settings";
import {
  cancelSettlement,
  createSettlement,
  getBalance,
  getBalanceMonths,
  listSettlements,
} from "./settlements";
import { assertUsers, loadPeople } from "./util";

/** Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení). */
export const dataCommands = [
  defineCommand({
    name: "finance.payment.list",
    permission: "finance.read",
    input: paymentListInput,
    handler: (ctx, i, d) => listPayments(ctx, d, i),
  }),
  defineCommand({
    name: "finance.payment.get",
    permission: "finance.read",
    input: paymentGetInput,
    handler: (ctx, i, d) => getPayment(ctx, d, i.id),
  }),
  defineCommand({
    name: "finance.payment.create",
    permission: "finance.payments_write",
    input: paymentCreateInput,
    handler: (ctx, i, d) => createPayment(ctx, d, i),
  }),
  defineCommand({
    name: "finance.payment.update",
    permission: "finance.payments_write",
    input: paymentUpdateInput,
    handler: (ctx, i, d) => updatePayment(ctx, d, i),
  }),
  defineCommand({
    name: "finance.payment.transition",
    permission: "finance.payments_write",
    input: paymentTransitionInput,
    handler: (ctx, i, d) => transitionPayment(ctx, d, i),
  }),
  defineCommand({
    name: "finance.payment.overrideAllocation",
    permission: "finance.splits_edit",
    input: paymentOverrideInput,
    handler: (ctx, i, d) => overrideAllocation(ctx, d, i),
  }),
  defineCommand({
    name: "finance.payment.recalc",
    permission: "finance.payments_write",
    input: paymentRecalcInput,
    handler: (ctx, i) => recalcJob(ctx, i),
  }),
  defineCommand({
    name: "finance.split.get",
    permission: "finance.read",
    input: splitGetInput,
    handler: (ctx, i) => getSplit(ctx, i.jobId),
  }),
  defineCommand({
    name: "finance.split.set",
    permission: "finance.splits_edit",
    input: splitSetInput,
    handler: (ctx, i) => setSplit(ctx, i),
  }),
  defineCommand({
    name: "finance.split.preview",
    permission: "finance.read",
    input: splitPreviewInput,
    handler: (ctx, i) => previewRules(ctx, i),
  }),
  defineCommand({
    name: "finance.split.default",
    permission: "finance.read",
    input: splitDefaultInput,
    handler: (ctx, _i, d) => getDefaultSplit(ctx, d),
  }),
  defineCommand({
    name: "finance.retainer.continue",
    permission: "finance.payments_write",
    input: retainerContinueInput,
    handler: (ctx, i, d) => continueRetainer(ctx, d, i),
  }),
  defineCommand({
    name: "finance.retainer.change",
    permission: "finance.payments_write",
    input: retainerChangeInput,
    handler: (ctx, i, d) => changeRetainer(ctx, d, i),
  }),
  defineCommand({
    name: "finance.retainer.endPreview",
    permission: "finance.read",
    input: retainerEndPreviewInput,
    handler: (ctx, i) => endPreview(ctx, i),
  }),
  defineCommand({
    name: "finance.retainer.end",
    permission: "finance.payments_write",
    input: retainerEndInput,
    handler: (ctx, i, d) => endRetainer(ctx, d, i),
  }),
  defineCommand({
    name: "finance.job.overview",
    permission: "finance.read",
    input: jobOverviewInput,
    handler: (ctx, i, d) => jobOverview(ctx, d, i.jobId),
  }),
  defineCommand({
    name: "finance.client.overview",
    permission: "finance.read",
    input: clientOverviewInput,
    handler: (ctx, i, d) => clientOverview(ctx, d, i),
  }),
  defineCommand({
    name: "finance.settlement.create",
    permission: "finance.settlements_write",
    input: settlementCreateInput,
    handler: (ctx, i) => createSettlement(ctx, i),
  }),
  defineCommand({
    name: "finance.settlement.cancel",
    permission: "finance.settlements_write",
    input: settlementCancelInput,
    handler: (ctx, i) => cancelSettlement(ctx, i),
  }),
  defineCommand({
    name: "finance.settlement.list",
    permission: "finance.read",
    input: settlementListInput,
    handler: (ctx, i) => listSettlements(ctx, i),
  }),
  defineCommand({
    name: "finance.balance",
    permission: "finance.read",
    input: balanceInput,
    handler: (ctx, i, d) => getBalance(ctx, d, i),
  }),
  defineCommand({
    name: "finance.balance.months",
    permission: "finance.read",
    input: balanceMonthsInput,
    handler: (ctx, i, d) => getBalanceMonths(ctx, d, i),
  }),
  defineCommand({
    name: "finance.reports",
    permission: "finance.read",
    input: reportsInput,
    handler: (ctx, i, d) => reports(ctx, d, i),
  }),
  defineCommand({
    name: "finance.settings.get",
    permission: "finance.read",
    input: settingsGetInput,
    handler: getSettings,
  }),
  defineCommand({
    name: "finance.settings.set",
    permission: "finance.settings",
    input: settingsSetInput,
    handler: setSettings,
  }),
];

async function getSettings(ctx: Ctx, _i: unknown, deps: ModuleDeps): Promise<FinanceSettings> {
  const d = await defaultRules(ctx.db, deps);
  return {
    balanceBasis: await balanceBasisOf(ctx.db, deps),
    defaultSplit: d.rules,
    defaultSplitConfigured: d.configured,
    people: await loadPeople(
      ctx.db,
      d.rules.map((r) => r.userId),
    ),
  };
}

async function setSettings(
  ctx: Ctx,
  input: {
    balanceBasis?: "paid" | "issued" | undefined;
    defaultSplit?: SplitRuleInput[] | null | undefined;
  },
  deps: ModuleDeps,
): Promise<FinanceSettings> {
  if (input.defaultSplit) {
    checkRuleInputs(input.defaultSplit);
    await assertUsers(
      ctx.db,
      input.defaultSplit.map((r) => r.userId),
    );
  }
  if (input.balanceBasis)
    await deps.settings.set(ctx, balanceBasisSetting, { basis: input.balanceBasis });
  if (input.defaultSplit !== undefined)
    await deps.settings.set(ctx, defaultSplitSetting, { rules: input.defaultSplit });
  return getSettings(ctx, undefined, deps);
}
