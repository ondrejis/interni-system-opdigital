import type { Probe } from "../security-probes";
import { P, WEEK } from "./shared";

/** Vstupy příkazů: Docházka. */
export const dochazkaProbes: Record<string, Probe> = {
  "dochazka.week": P((e) => ({ weekStart: WEEK, userId: e.otherUserId }), true),
  "dochazka.save": P(
    (e) => ({ userId: e.otherUserId, date: "2026-09-21", kind: "work", hours: 1 }),
    true,
  ),
  "dochazka.delete": P((e) => ({
    id: e.job.id === e.f.jobA.id ? e.f.ids.timeEntryA : e.f.ids.timeEntryB,
  })),
  "dochazka.submitWeek": P(() => ({ weekStart: "2030-01-07" }), true),
  "dochazka.withdrawWeek": P(() => ({ weekStart: "2030-01-07" }), true),
  "dochazka.reviewWeek": P(
    (e) => ({ userId: e.otherUserId, weekStart: WEEK, decision: "approve" }),
    true,
  ),
  "dochazka.approvals": P(() => ({}), true),
  "dochazka.clock.status": P(() => ({}), true),
  "dochazka.clock.in": P(() => ({}), true),
  "dochazka.clock.break": P(() => ({ action: "start" }), true),
  "dochazka.clock.out": P(() => ({}), true),
  "dochazka.month": P((e) => ({ month: "2026-09", userId: e.otherUserId }), true),
  "dochazka.report": P(() => ({ month: "2026-09" }), true),
  "dochazka.lockMonth": P(() => ({ month: "2030-01", locked: true }), true),
  "dochazka.settings.get": P(() => ({}), true),
  "dochazka.settings.save": P(
    () => ({
      hoursPerDay: 8,
      workDays: [1, 2, 3, 4, 5],
      requireApproval: false,
      defaultHourlyCostMinor: 1,
      reminder: false,
    }),
    true,
  ),
};
