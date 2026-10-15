import { NONE, P, job, type Probe } from "./shared";

const DATE = "2026-10-14";

/** Vstupy příkazů: modul „zakazky“. Každý příkaz modulu potřebuje záznam (`zakazky.<akce>`: `P(job)`). */
export const zakazkyProbes: Record<string, Probe> = {
  "zakazky.detail": P(job),
  "zakazky.board": P(() => ({ by: "status" }), true),
  "zakazky.prefillFromDeal": P(
    (e) => ({ companyId: NONE, services: ["web"], ownerId: e.otherUserId }),
    true,
  ),
  "zakazky.phase.preview": P((e) => ({ jobId: e.job.id, phaseId: NONE })),
  "zakazky.complete.preview": P(job),
  "zakazky.create": P(
    (e) => ({
      title: "Probe zakázka",
      type: "web",
      companyId: NONE,
      ownerId: e.otherUserId,
      startDate: DATE,
    }),
    true,
  ),
  "zakazky.createFromTemplate": P(
    (e) => ({
      title: "Probe zakázka",
      type: "web",
      companyId: NONE,
      ownerId: e.otherUserId,
      templateId: NONE,
    }),
    true,
  ),
  "zakazky.setPhase": P((e) => ({ jobId: e.job.id, phaseId: NONE })),
  "zakazky.phase.complete": P((e) => ({ jobId: e.job.id, phaseId: NONE })),
  "zakazky.phases.edit": P((e) => ({ jobId: e.job.id, phases: [{ name: "Fáze" }] })),
  "zakazky.setStatus": P((e) => ({ jobId: e.job.id, status: "paused" })),
  "zakazky.complete": P((e) => ({ jobId: e.job.id, reason: "finished" })),
  "zakazky.client.setFormer": P(job),
  "zakazky.team.add": P((e) => ({ jobId: e.job.id, userId: e.otherUserId })),
  "zakazky.team.remove": P((e) => ({ jobId: e.job.id, userId: e.otherUserId })),
  "zakazky.participants.add": P((e) => ({ jobId: e.job.id, personId: NONE })),
  "zakazky.participants.remove": P((e) => ({ jobId: e.job.id, personId: NONE })),
  "zakazky.template.list": P(() => ({}), true),
  "zakazky.template.get": P(() => ({ id: NONE }), true),
  "zakazky.template.create": P(() => ({ name: "Probe šablona", type: "web" }), true),
  "zakazky.template.update": P(() => ({ id: NONE, name: "Probe šablona" }), true),
  "zakazky.template.duplicate": P(() => ({ id: NONE }), true),
  "zakazky.template.archive": P(() => ({ id: NONE }), true),
  "zakazky.template.setDefault": P(() => ({ id: NONE }), true),
  "zakazky.template.saveFromJob": P((e) => ({ jobId: e.job.id, name: "Probe šablona" })),
};
