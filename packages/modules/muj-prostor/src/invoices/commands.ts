import { defineCommand } from "@rebar/core/module-server";
import {
  fakturoidNoInput,
  fakturoidSaveInput,
  invoicesApproveInput,
  invoicesIdInput,
  invoicesOverviewInput,
  invoicesPrepareInput,
  invoicesUpdateInput,
} from "../contract";
import {
  approveInvoice,
  cancelInvoice,
  disconnectFakturoid,
  fakturoidStatus,
  loadInvoicesOverview,
  prepareInvoiceDrafts,
  reopenInvoice,
  retryInvoicePayment,
  saveFakturoid,
  testFakturoid,
  updateInvoiceAmount,
} from "./data";

const permission = "muj-prostor.recurring_invoices";

/** Návrhy a hotové faktury, souhrn a stav Fakturoidu (stránka Opakované faktury, sekce na kartě klienta). */
export const invoicesOverview = defineCommand({
  name: "muj-prostor.invoices.overview",
  permission,
  input: invoicesOverviewInput,
  handler: (ctx, input, deps) => loadInvoicesOverview(ctx, deps, input),
});

/** Ručně připraví návrhy (totéž co denní úloha); idempotentní. */
export const invoicesPrepare = defineCommand({
  name: "muj-prostor.invoices.prepare",
  permission,
  input: invoicesPrepareInput,
  handler: (ctx, _input, deps) => prepareInvoiceDrafts(ctx, deps),
});

/** Upraví částku konceptu. */
export const invoicesUpdate = defineCommand({
  name: "muj-prostor.invoices.update",
  permission,
  input: invoicesUpdateInput,
  handler: (ctx, input, deps) => updateInvoiceAmount(ctx, deps, input),
});

/** Schválit a vytvořit ve Fakturoidu: faktura, posun obnovy, platba vlastníkovi (idempotentní). */
export const invoicesApprove = defineCommand({
  name: "muj-prostor.invoices.approve",
  permission,
  input: invoicesApproveInput,
  handler: (ctx, input, deps) => approveInvoice(ctx, deps, input),
});

/** Zruší návrh. */
export const invoicesCancel = defineCommand({
  name: "muj-prostor.invoices.cancel",
  permission,
  input: invoicesIdInput,
  handler: (ctx, input, deps) => cancelInvoice(ctx, deps, input.id),
});

/** Vrátí zrušený návrh do konceptu. */
export const invoicesReopen = defineCommand({
  name: "muj-prostor.invoices.reopen",
  permission,
  input: invoicesIdInput,
  handler: (ctx, input) => reopenInvoice(ctx, input.id),
});

/** Doplní chybějící platbu u hotové faktury. */
export const invoicesRetryPayment = defineCommand({
  name: "muj-prostor.invoices.retryPayment",
  permission,
  input: invoicesIdInput,
  handler: (ctx, input, deps) => retryInvoicePayment(ctx, deps, input.id),
});

/** Stav nastavení Fakturoidu (bez tajemství). */
export const fakturoidStatusCmd = defineCommand({
  name: "muj-prostor.fakturoid.status",
  permission,
  input: fakturoidNoInput,
  handler: (ctx, _input, deps) => fakturoidStatus(ctx, deps),
});

/** Uloží přístup k Fakturoidu (šifrovaně; vyžaduje i `settings.integrations`). */
export const fakturoidSaveCmd = defineCommand({
  name: "muj-prostor.fakturoid.save",
  permission,
  input: fakturoidSaveInput,
  handler: (ctx, input, deps) => saveFakturoid(ctx, deps, input),
});

/** Test spojení s Fakturoidem. */
export const fakturoidTestCmd = defineCommand({
  name: "muj-prostor.fakturoid.test",
  permission,
  input: fakturoidNoInput,
  handler: (ctx, _input, deps) => testFakturoid(ctx, deps),
});

/** Odpojí Fakturoid. */
export const fakturoidDisconnectCmd = defineCommand({
  name: "muj-prostor.fakturoid.disconnect",
  permission,
  input: fakturoidNoInput,
  handler: (ctx, _input, deps) => disconnectFakturoid(ctx, deps),
});

/** Příkazy oblasti „invoices“. */
export const invoicesCommands = [
  invoicesOverview,
  invoicesPrepare,
  invoicesUpdate,
  invoicesApprove,
  invoicesCancel,
  invoicesReopen,
  invoicesRetryPayment,
  fakturoidStatusCmd,
  fakturoidSaveCmd,
  fakturoidTestCmd,
  fakturoidDisconnectCmd,
];
