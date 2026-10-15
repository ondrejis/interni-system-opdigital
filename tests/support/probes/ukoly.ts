import { P, type Probe } from "./shared";

const ID = "11111111-1111-4111-8111-111111111111";

/** Vstupy příkazů: modul „ukoly“ (úkoly a aktivity; poznámky přidává UKO-N). */
export const ukolyProbes: Record<string, Probe> = {
  "ukoly.get": P(() => ({ id: ID }), true),
  "ukoly.list": P(() => ({ view: "all" }), true),
  "ukoly.forRecord": P(() => ({ jobId: ID }), true),
  "ukoly.counts": P(() => ({}), true),
  "ukoly.parse": P(() => ({ text: "zavolat Novákovi zítra 10:00" }), true),
  "ukoly.create": P(() => ({ title: "Zkouška" }), true),
  "ukoly.quickAdd": P(() => ({ text: "zavolat Novákovi zítra 10:00" }), true),
  "ukoly.update": P(() => ({ id: ID, title: "Změna" }), true),
  "ukoly.setStatus": P(() => ({ id: ID, status: "in_progress" }), true),
  "ukoly.complete": P(() => ({ id: ID }), true),
  "ukoly.reschedule": P(() => ({ id: ID, dueDate: "2026-10-20" }), true),
  "ukoly.assign": P(() => ({ id: ID, assigneeId: null }), true),
  "ukoly.publishAndAssign": P(() => ({ id: ID, assigneeId: ID }), true),
  "ukoly.attendees.set": P(() => ({ id: ID, attendees: [] }), true),
  "ukoly.delete": P(() => ({ id: ID }), true),
  "ukoly.type.list": P(() => ({}), true),
  "ukoly.type.save": P(() => ({ key: "zkouska", name: "Zkouška" }), true),
  "ukoly.type.delete": P(() => ({ id: ID }), true),
  "ukoly.type.reorder": P(() => ({ ids: [ID] }), true),
  // UKO-N: poznámky (`ukoly.note.*`)
  "ukoly.note.get": P(() => ({ id: ID }), true),
  "ukoly.note.list": P(() => ({ standalone: true }), true),
  "ukoly.note.create": P(() => ({ title: "Zkouška" }), true),
  "ukoly.note.save": P(() => ({ id: ID, baseVersion: 1, title: "Změna" }), true),
  "ukoly.note.update": P(() => ({ id: ID, tags: [] }), true),
  "ukoly.note.pin": P(() => ({ id: ID, pinned: true }), true),
  "ukoly.note.delete": P(() => ({ id: ID }), true),
};
