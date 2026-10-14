import { randomUUID } from "node:crypto";
import { and, asc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { recordAudit } from "@rebar/core/audit";
import { assertEntityAccess, createRecord, resolveEntity, visibleIds } from "@rebar/core/entities";
import { defineCommand, defineModuleServer, type ModuleDeps } from "@rebar/core/module-server";
import { inTx, PermissionError, scopeOf, UserError } from "@rebar/core/rbac";
import { addDaysIso, localParts, todayIso } from "@rebar/core/time";
import { assertJobWritable, canWriteDiary, resolveWeather } from "./diary";
import { jobPhase, siteDiary } from "./schema";

const jobId = z.uuid();
/** Zápis z terminálu smí být zpožděný (offline fronta), ale ne starší než tolik dní. */
const MAX_LATE_DAYS = 14;

/** Jak daleko dopředu se v „Dnes na stavbě“ ukazují fáze, které teprve začnou. */
const LOOKAHEAD_DAYS = 7;

/**
 * Co se na stavbách řemeslníka dnes dělá: fáze harmonogramu, které dnes běží nebo v nejbližších dnech začnou
 * (jen nedokončené), a zda je za dnešek zapsaný deník. Jen zakázky, které aktér smí vidět; žádné ceny.
 */
export const terminalToday = defineCommand({
  name: "realizace.terminal.today",
  permission: "realizace.read",
  input: z.object({}),
  handler: async (ctx, _i, deps) => {
    const today = todayIso();
    const def = deps.registry.get("job");
    if (!def || !scopeOf(ctx, "realizace.read")) return { today, jobs: [] };
    const ids = await visibleIds(ctx, await resolveEntity(ctx.db, def));
    if (!ids.length) return { today, jobs: [] };
    const until = addDaysIso(today, LOOKAHEAD_DAYS);
    const phases = await ctx.db
      .select({
        id: jobPhase.id,
        jobId: jobPhase.jobId,
        name: jobPhase.name,
        startDate: jobPhase.startDate,
        endDate: jobPhase.endDate,
        progress: jobPhase.progress,
        milestone: jobPhase.milestone,
        responsibleId: jobPhase.responsibleId,
        note: jobPhase.note,
      })
      .from(jobPhase)
      .where(
        and(
          inArray(jobPhase.jobId, ids),
          isNull(jobPhase.deletedAt),
          sql`${jobPhase.status} <> 'done'`,
          lte(jobPhase.startDate, until),
          gte(jobPhase.endDate, today),
        ),
      )
      .orderBy(asc(jobPhase.startDate), asc(jobPhase.position));
    const jobsWithPhases = [...new Set(phases.map((p) => p.jobId))];
    const diaries = jobsWithPhases.length
      ? await ctx.db
          .select({ jobId: siteDiary.jobId })
          .from(siteDiary)
          .where(
            and(
              inArray(siteDiary.jobId, jobsWithPhases),
              eq(siteDiary.date, today),
              isNull(siteDiary.deletedAt),
            ),
          )
      : [];
    const written = new Set(diaries.map((d) => d.jobId));
    const me = ctx.actor.userId;
    return {
      today,
      jobs: jobsWithPhases.map((id) => ({
        jobId: id,
        diaryWritten: written.has(id),
        phases: phases
          .filter((p) => p.jobId === id)
          .map((p) => ({
            id: p.id,
            name: p.name,
            startDate: p.startDate,
            endDate: p.endDate,
            progress: p.progress,
            milestone: p.milestone,
            mine: !!me && p.responsibleId === me,
            running: p.startDate <= today,
            note: p.note,
          })),
      })),
    };
  },
});

/** Čas zápisu z terminálu: čas z mobilu (offline fronta), pokud je rozumný, jinak teď. */
function writtenAt(at: string | null | undefined, now = new Date()): Date {
  if (!at) return now;
  const t = new Date(at);
  if (Number.isNaN(t.getTime())) return now;
  if (t.getTime() > now.getTime()) return now;
  if (now.getTime() - t.getTime() > MAX_LATE_DAYS * 86_400_000)
    throw new UserError(
      `Zápis je starší než ${MAX_LATE_DAYS} dní. Doplňte ho do deníku v kanceláři.`,
    );
  return t;
}

const noteInput = z.object({
  jobId,
  text: z.string().trim().min(1, "Napište, co se dělalo.").max(2000),
  /** Do které části zápisu se řádek přidá: provedené práce, nebo události dne (poznámka, nehoda). */
  section: z.enum(["work", "events"]).default("work"),
  /** Čas, kdy řemeslník zápis pořídil (u zápisů z offline fronty). */
  at: z.iso.datetime({ offset: true }).nullish(),
});

/**
 * Přidá řádek do dnešního zápisu stavebního deníku (při prvním zápisu dne ho založí). Řádek se vždy připojuje na konec,
 * takže zápisy kolegů téhož dne se nepřepíšou. Podepsaný zápis se nemění (česká hláška).
 */
export const terminalNote = defineCommand({
  name: "realizace.terminal.note",
  permission: "realizace.write",
  input: noteInput,
  handler: async (ctx, i) => {
    if (!(await canWriteDiary(ctx, i.jobId)))
      throw new PermissionError("Do deníku zapisuje stavbyvedoucí a tým zakázky.");
    await assertJobWritable(ctx, i.jobId);
    const when = writtenAt(i.at);
    const { date, time } = localParts(when);
    const line = `[${time}] ${i.text}`;

    // počasí pro nový zápis se bere mimo transakci (volání má limit 4 s); selhání zápis nezastaví
    const [existing] = await ctx.db
      .select({ id: siteDiary.id })
      .from(siteDiary)
      .where(
        and(eq(siteDiary.jobId, i.jobId), eq(siteDiary.date, date), isNull(siteDiary.deletedAt)),
      );
    const weather = existing ? null : (await resolveWeather(ctx, i.jobId, date)).weather;

    return inTx(ctx, async (c) => {
      const [cur] = await c.db
        .select()
        .from(siteDiary)
        .where(
          and(eq(siteDiary.jobId, i.jobId), eq(siteDiary.date, date), isNull(siteDiary.deletedAt)),
        )
        .for("update");
      if (cur?.signedAt)
        throw new UserError(
          "Zápis dne je už podepsaný a nejde měnit. Poznámku předejte stavbyvedoucímu, ať podpis zruší.",
        );
      const append = (prev: string | null | undefined) => (prev ? `${prev}\n${line}` : line);
      if (cur) {
        await c.db
          .update(siteDiary)
          .set({
            ...(i.section === "work" ? { work: append(cur.work) } : { events: append(cur.events) }),
            updatedBy: c.actor.userId,
          })
          .where(eq(siteDiary.id, cur.id));
      } else {
        await c.db.insert(siteDiary).values({
          id: randomUUID(),
          jobId: i.jobId,
          date,
          ...(i.section === "work" ? { work: line } : { events: line }),
          ...(weather
            ? {
                weatherData: weather,
                weather: weather.label,
                ...(weather.tempMax !== null || weather.tempMin !== null
                  ? {
                      temperature: Math.round(
                        ((weather.tempMax ?? weather.tempMin!) +
                          (weather.tempMin ?? weather.tempMax!)) /
                          2,
                      ),
                    }
                  : {}),
              }
            : {}),
          createdBy: c.actor.userId,
          updatedBy: c.actor.userId,
        });
      }
      await recordAudit(c, {
        action: cur ? "update" : "create",
        entityType: "job",
        entityId: i.jobId,
        summary: `Stavební deník ${date}${cur ? ": přidán zápis z terminálu" : ": nový zápis z terminálu"}`,
      });
      return { date };
    });
  },
});

const defectInput = z.object({
  jobId,
  title: z.string().trim().min(3, "Popište závadu.").max(200),
  description: z.string().trim().max(2000).nullish(),
  severity: z.enum(["minor", "normal", "major"]).default("normal"),
  at: z.iso.datetime({ offset: true }).nullish(),
});

/** Nahlášení závady z terminálu: založí vadu zakázky (stejně jako záložka Vady; tým zakázky dostane upozornění). */
export const terminalDefect = defineCommand({
  name: "realizace.terminal.defect",
  permission: "realizace.write",
  input: defectInput,
  handler: async (ctx, i, deps: ModuleDeps) => {
    await assertEntityAccess(ctx, "job", i.jobId, "read");
    await assertJobWritable(ctx, i.jobId);
    const def = deps.registry.get("defect");
    if (!def) throw new UserError("Vady nejsou zapnuté.");
    const when = writtenAt(i.at);
    return inTx(ctx, async (c) => {
      const e = await resolveEntity(c.db, def);
      const created = await createRecord(c, deps.registry, e, {
        title: i.title,
        job: i.jobId,
        description: i.description || null,
        severity: i.severity,
        foundAt: localParts(when).date,
      });
      return { id: String(created.row.id) };
    });
  },
});

export const area = defineModuleServer({
  commands: [terminalToday, terminalNote, terminalDefect],
});
