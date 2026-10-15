import { P, type Probe } from "./shared";

const ID = "11111111-1111-4111-8111-111111111111";

/** Vstupy příkazů: modul „hodiny“. */
export const hodinyProbes: Record<string, Probe> = {
  "hodiny.parse": P(() => ({ text: "1,5" }), true),
  "hodiny.week": P(() => ({ weekStart: "2026-10-12" }), true),
  "hodiny.save": P((e) => ({ jobId: e.job.id, date: "2026-10-12", time: "1,5" })),
  "hodiny.cell.save": P((e) => ({ jobId: e.job.id, date: "2026-10-12", time: "1:30" })),
  "hodiny.delete": P(() => ({ id: ID }), true),
  "hodiny.jobs": P(() => ({}), true),
  "hodiny.forTask": P(() => ({ taskId: ID }), true),
  "hodiny.report": P(() => ({ period: "week" }), true),
  "hodiny.job.summary": P((e) => ({ jobId: e.job.id })),
};
