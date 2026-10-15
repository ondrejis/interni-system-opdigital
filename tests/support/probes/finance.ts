import { NONE, P, type Probe } from "./shared";

const year = new Date().getFullYear();
const money = 100_000;

/**
 * Vstupy příkazů: modul „finance“. Každý příkaz modulu potřebuje záznam (`finance.<akce>`: `P(() => ({…}), true)`).
 * Příkazy jsou vesměs vázané na zakázku (`jobId`), zbylé na platbu, vyrovnání nebo nastavení (`global`).
 */
export const financeProbes: Record<string, Probe> = {
  "finance.payment.list": P(() => ({}), true),
  "finance.payment.get": P(() => ({ id: NONE }), true),
  "finance.payment.create": P((e) => ({
    jobId: e.job.id,
    description: "Zkušební platba",
    amountMinor: money,
    issuerId: e.otherUserId,
  })),
  "finance.payment.update": P(() => ({ id: NONE, description: "Úprava" }), true),
  "finance.payment.transition": P(() => ({ id: NONE, to: "canceled" }), true),
  "finance.payment.overrideAllocation": P(() => ({ id: NONE, allocations: null }), true),
  "finance.payment.recalc": P((e) => ({ jobId: e.job.id })),
  "finance.split.get": P((e) => ({ jobId: e.job.id })),
  "finance.split.set": P((e) => ({ jobId: e.job.id, rules: [] })),
  "finance.split.preview": P(() => ({ rules: [] }), true),
  "finance.split.default": P(() => ({}), true),
  "finance.retainer.continue": P((e) => ({
    jobId: e.job.id,
    amountMinor: money,
    fromMonth: `${year}-12`,
    issueDay: 1,
    issuerMode: "fixed",
    issuerId: e.otherUserId,
  })),
  "finance.retainer.change": P((e) => ({ jobId: e.job.id, amountMinor: money })),
  "finance.retainer.endPreview": P((e) => ({ jobId: e.job.id, endMonth: `${year}-12` })),
  "finance.retainer.end": P((e) => ({ jobId: e.job.id })),
  "finance.job.overview": P((e) => ({ jobId: e.job.id })),
  "finance.client.overview": P(() => ({ companyId: NONE }), true),
  "finance.settlement.create": P(
    (e) => ({
      fromUserId: e.otherUserId,
      toUserId: NONE,
      amountMinor: money,
      settledOn: `${year}-01-15`,
      method: "transfer",
    }),
    true,
  ),
  "finance.settlement.cancel": P(() => ({ id: NONE }), true),
  "finance.settlement.list": P(() => ({}), true),
  "finance.balance": P(() => ({}), true),
  "finance.balance.months": P(() => ({}), true),
  "finance.reports": P(() => ({}), true),
  "finance.settings.get": P(() => ({}), true),
  "finance.settings.set": P(() => ({ balanceBasis: "paid" }), true),
};
