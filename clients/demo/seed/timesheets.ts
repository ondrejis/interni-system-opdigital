import type { DemoUserKey } from "./users";
import type { DemoJob, World } from "./world";

const pad = (n: number) => String(n).padStart(2, "0");
const clock = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

/**
 * Zapíše docházku jako sám pracovník (denní záznam od–do s půlhodinovou pauzou). Záznam je koncept;
 * týdny se na konci seedu odesílají a schvalují (`settleTimesheets`).
 */
export async function book(
  w: World,
  user: DemoUserKey,
  date: string,
  hours: number,
  o: {
    job?: DemoJob | null;
    kind?: "work" | "travel" | "workshop" | "admin" | "vacation" | "sick" | "doctor";
    start?: number;
    note?: string;
  } = {},
) {
  const start = o.start ?? 7 * 60;
  const absence = o.kind === "vacation" || o.kind === "sick" || o.kind === "doctor";
  const hasBreak = hours > 6;
  await w.kit.run(w.cast[user].ctx, "dochazka.save", {
    date,
    kind: o.kind ?? "work",
    ...(absence
      ? { hours }
      : {
          startTime: clock(start),
          endTime: clock(start + Math.round(hours * 60) + (hasBreak ? 30 : 0)),
          breakMinutes: hasBreak ? 30 : 0,
        }),
    ...(o.job ? { jobId: o.job.id } : {}),
    ...(o.note ? { note: o.note } : {}),
  });
}

/** Odešle a schválí docházku všech starších týdnů; poslední týdny nechá rozpracované, ať je co schvalovat. */
export async function settleTimesheets(
  w: World,
  weekStarts: string[],
  keep: { submittedWeeks: string[] },
) {
  const people = ["owner", "office", "foreman1", "foreman2", "worker1", "worker2"] as const;
  for (const wk of weekStarts) {
    for (const u of people) {
      try {
        await w.kit.run(w.cast[u].ctx, "dochazka.submitWeek", { weekStart: wk });
      } catch {
        continue; // nic k odeslání
      }
      if (keep.submittedWeeks.includes(wk)) continue;
      // schvaluje majitel (zaměstnanec neschvaluje sám sebe)
      const reviewer = u === "owner" ? "office" : "owner";
      await w.kit.run(w.cast[reviewer].ctx, "dochazka.reviewWeek", {
        userId: w.cast[u].id,
        weekStart: wk,
        decision: "approve",
      });
    }
  }
}
