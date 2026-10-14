import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { defineCommand } from "@rebar/core/module-server";
import { PermissionError } from "@rebar/core/rbac";
import { weatherSummary } from "./diary-shared";
import { jobProgress } from "./schedule";
import { jobPhase, siteDiary } from "./schema";

/**
 * Data Realizace pro veřejnou stránku investora (odkaz jen ke čtení). Příkaz smí volat jen systémový kontext
 * aplikace, který předtím ověřil token odkazu; přihlášený uživatel ho přes `runCommand` volat nesmí, jinak by si
 * mohl vyžádat cizí zakázku. Vrací jen to, co rozsah dovolí, a nikdy ceny, hodiny ani osobní údaje nad rámec jmen.
 */
export const investorView = defineCommand({
  name: "realizace.investor.view",
  input: z.object({
    jobId: z.uuid(),
    scope: z.object({
      schedule: z.boolean(),
      diary: z.enum(["none", "flagged", "all"]),
    }),
  }),
  handler: async (ctx, i) => {
    if (ctx.actor.kind !== "system") throw new PermissionError();

    const phases = i.scope.schedule
      ? await ctx.db
          .select()
          .from(jobPhase)
          .where(and(eq(jobPhase.jobId, i.jobId), isNull(jobPhase.deletedAt)))
          .orderBy(asc(jobPhase.position), asc(jobPhase.startDate))
      : [];

    const entries =
      i.scope.diary === "none"
        ? []
        : await ctx.db
            .select()
            .from(siteDiary)
            .where(
              and(
                eq(siteDiary.jobId, i.jobId),
                isNull(siteDiary.deletedAt),
                i.scope.diary === "flagged" ? eq(siteDiary.forInvestor, true) : undefined,
              ),
            )
            .orderBy(siteDiary.date)
            .limit(400);

    const diary = entries
      .map((d) => ({
        date: d.date,
        weather: d.weatherData
          ? weatherSummary(d.weatherData)
          : [d.weather, d.temperature !== null ? `${d.temperature} °C` : null]
              .filter(Boolean)
              .join(", "),
        work: d.work,
        workers: (d.workers ?? []).map((w) => w.name),
        machines: (d.machineRows ?? []).map((m) => m.name),
        materials: (d.materialRows ?? []).map((m) => ({ name: m.name, qty: m.qty, unit: m.unit })),
        photoIds: d.photoIds ?? [],
        // interní události a vady jen u zápisů výslovně určených investorovi
        events: d.forInvestor ? d.events : null,
        incidents: d.forInvestor ? (d.incidents ?? []).map((x) => x.text) : [],
        signed: !!d.signedAt,
      }))
      .reverse();

    return {
      phases: phases.map((p) => ({
        name: p.name,
        startDate: p.startDate,
        endDate: p.endDate,
        progress: p.progress,
        status: p.status,
        milestone: p.milestone,
      })),
      progress: phases.length ? jobProgress(phases) : null,
      diary,
      diaryPhotoIds: diary.flatMap((d) => d.photoIds),
    };
  },
});
