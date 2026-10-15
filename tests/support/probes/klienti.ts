import { NONE, P, type Probe } from "./shared";

/** Vstupy příkazů: modul „klienti“. Vše míří na neexistujícího klienta, příkaz tedy nic nezmění. */
export const klientiProbes: Record<string, Probe> = {
  "klienti.list": P(() => ({ includeFormer: true }), true),
  "klienti.setStatus": P(() => ({ companyId: NONE, status: "active" }), true),
  "klienti.setServices": P(() => ({ companyId: NONE, services: ["web"] }), true),
  "klienti.saveContext": P(() => ({ companyId: NONE, notes: "x" }), true),
  "klienti.summary": P(() => ({ companyId: NONE }), true),
  "klienti.tabCounts": P(() => ({ companyId: NONE }), true),
};
