import { NotImplementedError } from "@rebar/core/contracts";
import { defineCommand } from "@rebar/core/module-server";
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

/* M1: stub příkazů (vstupy jsou finální, těla doplní FIN-B). */
const todo = (name: string) => async (): Promise<never> => {
  throw new NotImplementedError(`finance.${name}`);
};

/** Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení). */
export const dataCommands = [
  defineCommand({
    name: "finance.payment.list",
    permission: "finance.read",
    input: paymentListInput,
    handler: todo("payment.list"),
  }),
  defineCommand({
    name: "finance.payment.get",
    permission: "finance.read",
    input: paymentGetInput,
    handler: todo("payment.get"),
  }),
  defineCommand({
    name: "finance.payment.create",
    permission: "finance.payments_write",
    input: paymentCreateInput,
    handler: todo("payment.create"),
  }),
  defineCommand({
    name: "finance.payment.update",
    permission: "finance.payments_write",
    input: paymentUpdateInput,
    handler: todo("payment.update"),
  }),
  defineCommand({
    name: "finance.payment.transition",
    permission: "finance.payments_write",
    input: paymentTransitionInput,
    handler: todo("payment.transition"),
  }),
  defineCommand({
    name: "finance.payment.overrideAllocation",
    permission: "finance.splits_edit",
    input: paymentOverrideInput,
    handler: todo("payment.overrideAllocation"),
  }),
  defineCommand({
    name: "finance.payment.recalc",
    permission: "finance.payments_write",
    input: paymentRecalcInput,
    handler: todo("payment.recalc"),
  }),
  defineCommand({
    name: "finance.split.get",
    permission: "finance.read",
    input: splitGetInput,
    handler: todo("split.get"),
  }),
  defineCommand({
    name: "finance.split.set",
    permission: "finance.splits_edit",
    input: splitSetInput,
    handler: todo("split.set"),
  }),
  defineCommand({
    name: "finance.split.preview",
    permission: "finance.read",
    input: splitPreviewInput,
    handler: todo("split.preview"),
  }),
  defineCommand({
    name: "finance.split.default",
    permission: "finance.read",
    input: splitDefaultInput,
    handler: todo("split.default"),
  }),
  defineCommand({
    name: "finance.retainer.continue",
    permission: "finance.payments_write",
    input: retainerContinueInput,
    handler: todo("retainer.continue"),
  }),
  defineCommand({
    name: "finance.retainer.change",
    permission: "finance.payments_write",
    input: retainerChangeInput,
    handler: todo("retainer.change"),
  }),
  defineCommand({
    name: "finance.retainer.endPreview",
    permission: "finance.read",
    input: retainerEndPreviewInput,
    handler: todo("retainer.endPreview"),
  }),
  defineCommand({
    name: "finance.retainer.end",
    permission: "finance.payments_write",
    input: retainerEndInput,
    handler: todo("retainer.end"),
  }),
  defineCommand({
    name: "finance.job.overview",
    permission: "finance.read",
    input: jobOverviewInput,
    handler: todo("job.overview"),
  }),
  defineCommand({
    name: "finance.client.overview",
    permission: "finance.read",
    input: clientOverviewInput,
    handler: todo("client.overview"),
  }),
  defineCommand({
    name: "finance.settlement.create",
    permission: "finance.settlements_write",
    input: settlementCreateInput,
    handler: todo("settlement.create"),
  }),
  defineCommand({
    name: "finance.settlement.cancel",
    permission: "finance.settlements_write",
    input: settlementCancelInput,
    handler: todo("settlement.cancel"),
  }),
  defineCommand({
    name: "finance.settlement.list",
    permission: "finance.read",
    input: settlementListInput,
    handler: todo("settlement.list"),
  }),
  defineCommand({
    name: "finance.balance",
    permission: "finance.read",
    input: balanceInput,
    handler: todo("balance"),
  }),
  defineCommand({
    name: "finance.balance.months",
    permission: "finance.read",
    input: balanceMonthsInput,
    handler: todo("balance.months"),
  }),
  defineCommand({
    name: "finance.reports",
    permission: "finance.read",
    input: reportsInput,
    handler: todo("reports"),
  }),
  defineCommand({
    name: "finance.settings.get",
    permission: "finance.read",
    input: settingsGetInput,
    handler: todo("settings.get"),
  }),
  defineCommand({
    name: "finance.settings.set",
    permission: "finance.settings",
    input: settingsSetInput,
    handler: todo("settings.set"),
  }),
];
