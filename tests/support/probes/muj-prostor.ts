import { NONE, P, type Probe } from "./shared";

/**
 * Vstupy příkazů: modul „muj-prostor“. Každý příkaz modulu potřebuje záznam (`muj-prostor.<akce>`: `P(() => ({…}), true)`).
 * Soubor je společný pro MPR-1 až MPR-3: každý agent píše jen svůj blok (označený ID).
 */
export const mujProstorProbes: Record<string, Probe> = {
  // ===== MPR-1: hosting a domény =====
  "muj-prostor.hosting.overview": P(() => ({}), true),
  "muj-prostor.hosting.markRenewed": P(
    () => ({ id: NONE, expectedNextRenewal: "2026-10-14" }),
    true,
  ),
  "muj-prostor.hosting.undoRenewed": P(
    () => ({ id: NONE, from: "2027-10-14", to: "2026-10-14" }),
    true,
  ),
  "muj-prostor.client.overview": P(() => ({ companyId: NONE }), true),
  "muj-prostor.domains.list": P(() => ({}), true),
  "muj-prostor.domains.bulkAdd": P(() => ({ text: "probe.example" }), true),
  "muj-prostor.domains.assignClient": P(() => ({ ids: [NONE], companyId: null }), true),
  // ===== MPR-2: knihovna a soukromé =====
  "muj-prostor.library.list": P(() => ({ q: "probe" }), true),
  "muj-prostor.library.variables": P(() => ({}), true),
  "muj-prostor.library.preview": P(() => ({ id: NONE, context: {} }), true),
  "muj-prostor.library.pick": P(() => ({ kind: "person", q: "probe" }), true),
  "muj-prostor.library.move": P(() => ({ direction: "toTemplates", id: NONE }), true),
  "muj-prostor.private.overview": P(() => ({}), true),
  "muj-prostor.private.createNote": P(() => ({ title: "probe", text: "probe" }), true),
  // ===== MPR-3: opakované faktury =====
  "muj-prostor.invoices.overview": P(() => ({}), true),
  "muj-prostor.invoices.prepare": P(() => ({}), true),
  "muj-prostor.invoices.update": P(() => ({ id: NONE, amountMinor: 100 }), true),
  "muj-prostor.invoices.approve": P(() => ({ id: NONE, expectedAmountMinor: 100 }), true),
  "muj-prostor.invoices.cancel": P(() => ({ id: NONE }), true),
  "muj-prostor.invoices.reopen": P(() => ({ id: NONE }), true),
  "muj-prostor.invoices.retryPayment": P(() => ({ id: NONE }), true),
  "muj-prostor.fakturoid.status": P(() => ({}), true),
  "muj-prostor.fakturoid.save": P(
    () => ({
      account: "probe",
      clientId: "probe",
      clientSecret: "probe",
      contactEmail: "probe@example.com",
    }),
    true,
  ),
  "muj-prostor.fakturoid.test": P(() => ({}), true),
  "muj-prostor.fakturoid.disconnect": P(() => ({}), true),
};
