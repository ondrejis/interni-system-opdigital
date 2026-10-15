import { NONE, P, type Probe } from "./shared";

const DATE = "2026-10-14";

/** Vstupy příkazů: modul „obchody“. Každý příkaz modulu potřebuje záznam (`obchody.<akce>`). */
export const obchodyProbes: Record<string, Probe> = {
  "obchody.board": P(() => ({}), true),
  "obchody.detail": P(() => ({ dealId: NONE }), true),
  "obchody.history": P(() => ({ dealId: NONE }), true),
  "obchody.winPreview": P(() => ({ dealId: NONE }), true),
  "obchody.lostReasons": P(() => ({}), true),
  "obchody.create": P(() => ({ title: "Probe obchod" }), true),
  "obchody.quickAdd": P(() => ({ title: "Probe obchod", company: { name: "Probe s.r.o." } }), true),
  "obchody.update": P(() => ({ dealId: NONE, patch: { title: "Probe obchod" } }), true),
  "obchody.moveStage": P(() => ({ dealId: NONE, stageId: NONE }), true),
  "obchody.win": P(() => ({ dealId: NONE, wonOn: DATE }), true),
  "obchody.lose": P(() => ({ dealId: NONE, reason: "price" }), true),
  "obchody.reopen": P(() => ({ dealId: NONE }), true),
  "obchody.markOpened": P(() => ({ dealId: NONE }), true),
  "obchody.archive": P(() => ({ dealId: NONE }), true),
  "obchody.participants.add": P(() => ({ dealId: NONE, personId: NONE }), true),
  "obchody.participants.remove": P(() => ({ dealId: NONE, personId: NONE }), true),
  "obchody.pipeline.get": P(() => ({}), true),
  "obchody.pipeline.stage.add": P(() => ({ name: "Probe fáze" }), true),
  "obchody.pipeline.stage.update": P(() => ({ stageId: NONE, name: "Probe fáze" }), true),
  "obchody.pipeline.stage.delete": P(() => ({ stageId: NONE }), true),
  "obchody.pipeline.stage.reorder": P(() => ({ stageIds: [NONE] }), true),
  "obchody.pipeline.lostReason.add": P(() => ({ label: "Probe důvod" }), true),
  "obchody.pipeline.lostReason.update": P(() => ({ itemId: NONE, label: "Probe důvod" }), true),
  "obchody.pipeline.lostReason.reorder": P(() => ({ itemIds: [NONE] }), true),
};
