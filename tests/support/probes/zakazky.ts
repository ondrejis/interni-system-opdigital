import { P, job, type Probe } from "./shared";

/** Vstupy příkazů: Zakázky. */
export const zakazkyProbes: Record<string, Probe> = {
  "zakazky.team.list": P(job),
  "zakazky.team.add": P((e) => ({ jobId: e.job.id, userId: e.otherUserId })),
  "zakazky.team.remove": P((e) => ({ jobId: e.job.id, userId: e.otherUserId })),
  "zakazky.transition": P((e) => ({ jobId: e.job.id, to: "handover" })),
  "zakazky.phase.preview": P(job),
  "zakazky.template.list": P(() => ({}), true),
  "zakazky.template.get": P((e) => ({ id: e.f.ids.template }), true),
  "zakazky.template.createFromJob": P((e) => ({ jobId: e.job.id, name: "Šablona" })),
  "zakazky.template.save": P((e) => ({ id: e.f.ids.template, name: "x" }), true),
  "zakazky.template.delete": P((e) => ({ id: e.f.ids.template }), true),
  "zakazky.template.apply": P((e) => ({ jobId: e.job.id, templateId: e.f.ids.template })),
};
