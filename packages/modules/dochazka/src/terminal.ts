import { and, asc, eq, gte, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import { visibleRecordTitles } from "@rebar/core/entities";
import { defineCommand } from "@rebar/core/module-server";
import { PermissionError } from "@rebar/core/rbac";
import { localParts, todayIso, weekStartIso } from "@rebar/core/time";
import { timeEntry } from "./schema";

/**
 * Přehled odpracovaného času pro dlaždici Docházka v terminálu: dnešek (záznamy se zakázkou a časy) a týden. Jen vlastní
 * záznamy, jen minuty: sazby, náklady ani částky se nevracejí.
 */
export const terminalSummary = defineCommand({
  name: "dochazka.terminal.summary",
  permission: "dochazka.own",
  input: z.object({}),
  handler: async (ctx, _i, deps) => {
    const userId = ctx.actor.userId;
    if (!userId) throw new PermissionError();
    const today = todayIso();
    const rows = await ctx.db
      .select({
        id: timeEntry.id,
        date: timeEntry.date,
        kind: timeEntry.kind,
        startedAt: timeEntry.startedAt,
        endedAt: timeEntry.endedAt,
        minutes: timeEntry.minutes,
        jobId: timeEntry.jobId,
        status: timeEntry.status,
      })
      .from(timeEntry)
      .where(
        and(
          eq(timeEntry.userId, userId),
          gte(timeEntry.date, weekStartIso(today)),
          lte(timeEntry.date, today),
          isNull(timeEntry.deletedAt),
        ),
      )
      .orderBy(asc(timeEntry.date), asc(timeEntry.startedAt));
    const titles = await visibleRecordTitles(ctx, deps.registry, "job", [
      ...new Set(rows.flatMap((r) => (r.jobId && r.date === today ? [r.jobId] : []))),
    ]);
    const todayRows = rows.filter((r) => r.date === today);
    return {
      today,
      todayMinutes: todayRows.reduce((a, r) => a + r.minutes, 0),
      weekMinutes: rows.reduce((a, r) => a + r.minutes, 0),
      entries: todayRows.map((r) => ({
        id: r.id,
        kind: r.kind,
        from: r.startedAt ? localParts(r.startedAt).time : null,
        to: r.endedAt ? localParts(r.endedAt).time : null,
        minutes: r.minutes,
        running: !!r.startedAt && !r.endedAt,
        job: r.jobId ? (titles[r.jobId] ?? null) : null,
        status: r.status,
      })),
    };
  },
});
