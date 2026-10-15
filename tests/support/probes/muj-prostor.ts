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
  // ===== MPR-2: knihovna a soukromé (doplní MPR-2) =====
  // ===== MPR-3: opakované faktury (doplní MPR-3) =====
};
