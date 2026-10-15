import { P, type Probe } from "./shared";

const ID = "11111111-1111-4111-8111-111111111111";

/** Vstupy příkazů: modul „sablony-emailu“. Každý příkaz modulu potřebuje záznam (`sablony-emailu.<akce>`: `P(() => ({…}), true)`). */
export const sablonyEmailuProbes: Record<string, Probe> = {
  "sablony-emailu.variables": P(() => ({}), true),
  "sablony-emailu.templates": P(() => ({ q: "follow" }), true),
  "sablony-emailu.render": P(() => ({ entityType: "company", id: ID, templateId: ID }), true),
  "sablony-emailu.preview": P(
    () => ({ subject: "Dobrý den {jmeno}", body: "Text {firma}", context: { personId: ID } }),
    true,
  ),
  "sablony-emailu.pick": P(() => ({ kind: "person", q: "novák" }), true),
  "sablony-emailu.markUsed": P(() => ({ templateId: ID }), true),
  "sablony-emailu.logActivity": P(
    () => ({ entityType: "company", id: ID, subject: "Follow-up" }),
    true,
  ),
  "sablony-emailu.saveContent": P(
    () => ({ id: ID, subject: "Předmět", bodyText: "Text e-mailu" }),
    true,
  ),
};
