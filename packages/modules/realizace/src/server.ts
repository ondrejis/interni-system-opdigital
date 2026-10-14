import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { recordAudit } from "@rebar/core/audit";
import { getPipeline } from "@rebar/core/config-data";
import { schema } from "@rebar/core/db";
import { assertEntityAccess, defineEntity, resolveEntity, visibleIds } from "@rebar/core/entities";
import {
  defineCommand,
  defineModuleJob,
  defineModuleServer,
  type AttentionItem,
  type ModuleDeps,
} from "@rebar/core/module-server";
import { nextNumber } from "@rebar/core/numbering";
import { notify } from "@rebar/core/notifications";
import { inTx, NotFoundError, PermissionError, scopeOf, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { formatDate } from "@rebar/core/shared";
import { todayIso } from "@rebar/core/time";
import { job, jobMember } from "@rebar/zakazky/schema";
import { notifyJobTeam } from "@rebar/zakazky/server";
import { defectsOpen } from "./defects";
import { canWriteDiary, diaryCommands } from "./diary";
import { phaseHooks } from "./hooks";
import { investorView } from "./investor";
import {
  DEFECT_ASSIGNED,
  DEFECT_NEW,
  JOB_HANDOVER,
  JOB_SCHEDULE,
  PHASE_ADDED,
  PHASE_DONE,
} from "./notifications";
import {
  sendDiaryReminders,
  sendMorningOverview,
  sendPhaseDeadlines,
  sendPhaseStarts,
} from "./scheduled";
import { area as terminal } from "./terminal";
import { defect, handoverItem, handoverProtocol, jobPhase, siteDiary } from "./schema";
import {
  jobProgress,
  phaseDelay,
  shiftDependents,
  statusFromProgress,
  wouldCycle,
} from "./schedule";

export const DEFECT_PIPELINE = { entityType: "defect", key: "default" } as const;
export const SEVERITY_LOOKUP = "defect.severity";
/** Názvy výchozích závažností do textu upozornění (hodnoty číselníku `defect.severity`). */
const SEVERITY_LABELS: Record<string, string> = {
  minor: "Drobná",
  normal: "Běžná",
  major: "Závažná",
};

/** Vada nebo reklamace na zakázce. Vidí ji ten, kdo vadu řeší, vede zakázku, nebo je v jejím týmu. */
export const defectEntity = defineEntity({
  key: "defect",
  listPath: "/realizace/vady",
  module: "realizace",
  label: { one: "Vada", many: "Vady" },
  table: defect,
  titleKey: "title",
  statusKey: "stage",
  permissions: { read: "realizace.read", write: "realizace.write" },
  ownerColumns: [defect.responsibleId],
  scope: (ctx) => {
    const me = ctx.actor.userId;
    if (!me) return sql`false`;
    return sql`(${defect.responsibleId} = ${me} or exists (select 1 from ${job} where ${job.id} = ${defect.jobId} and ${job.managerId} = ${me}) or exists (select 1 from ${jobMember} where ${jobMember.jobId} = ${defect.jobId} and ${jobMember.userId} = ${me}))`;
  },
  owners: async (db, id) => {
    const [row] = await db
      .select({ responsible: defect.responsibleId, manager: job.managerId, jobId: defect.jobId })
      .from(defect)
      .innerJoin(job, eq(job.id, defect.jobId))
      .where(and(eq(defect.id, id), isNull(defect.deletedAt)));
    if (!row) return null;
    const members = await db
      .select({ userId: jobMember.userId })
      .from(jobMember)
      .where(eq(jobMember.jobId, row.jobId));
    return [row.responsible, row.manager, ...members.map((m) => m.userId)];
  },
  beforeCreate: async (ctx, values) => {
    const out = { ...values };
    if (!out.stage) {
      const pipeline = await getPipeline(ctx.db, DEFECT_PIPELINE.entityType, DEFECT_PIPELINE.key);
      const first = pipeline?.stages.find((s) => s.kind === "open") ?? pipeline?.stages[0];
      if (first) out.stage = first.id;
    }
    if (!out.foundAt) out.foundAt = todayIso();
    return out;
  },
  afterCreate: async (ctx, created) => {
    const jobId = String(created.jobId);
    const [j] = await ctx.db
      .select({ number: job.number, managerId: job.managerId })
      .from(job)
      .where(eq(job.id, jobId));
    if (!j) return;
    const members = await ctx.db
      .select({ userId: jobMember.userId })
      .from(jobMember)
      .where(eq(jobMember.jobId, jobId));
    // záznamem události je vada: příjemce, který vadu nesmí číst, upozornění nedostane
    await notify(ctx.db, DEFECT_NEW, {
      params: {
        number: j.number,
        title: String(created.title),
        severity: SEVERITY_LABELS[String(created.severity ?? "")] ?? null,
        due: created.dueDate ? formatDate(String(created.dueDate)) : null,
      },
      to: {
        team: [j.managerId, ...members.map((m) => m.userId)],
        responsible: [created.responsibleId as string | null],
      },
      record: { type: "defect", id: String(created.id) },
      actorId: ctx.actor.userId,
    });
  },
  afterUpdate: async (ctx, before, after) => {
    if (!after.responsibleId || after.responsibleId === before.responsibleId) return;
    const [j] = await ctx.db
      .select({ number: job.number })
      .from(job)
      .where(eq(job.id, String(after.jobId)));
    await notify(ctx.db, DEFECT_ASSIGNED, {
      params: {
        number: j?.number ?? null,
        title: String(after.title),
        due: after.dueDate ? formatDate(String(after.dueDate)) : null,
      },
      to: { responsible: [String(after.responsibleId)] },
      record: { type: "defect", id: String(after.id) },
      actorId: ctx.actor.userId,
    });
  },
  attributes: [
    {
      key: "title",
      label: "Název",
      type: "text",
      field: "title",
      required: true,
      width: 280,
      defaultVisible: true,
    },
    {
      key: "job",
      label: "Zakázka",
      type: "record",
      field: "jobId",
      record: { entityType: "job" },
      required: true,
      width: 220,
      defaultVisible: true,
    },
    {
      key: "stage",
      label: "Stav",
      type: "status",
      field: "stageId",
      pipeline: DEFECT_PIPELINE,
      required: true,
      width: 150,
      defaultVisible: true,
    },
    {
      key: "severity",
      label: "Závažnost",
      type: "select",
      field: "severity",
      lookup: SEVERITY_LOOKUP,
      width: 130,
      defaultVisible: true,
    },
    {
      key: "responsible",
      label: "Řeší",
      type: "user",
      field: "responsibleId",
      width: 160,
      defaultVisible: true,
    },
    { key: "foundAt", label: "Nalezeno", type: "date", field: "foundAt", width: 120 },
    {
      key: "dueDate",
      label: "Termín opravy",
      type: "date",
      field: "dueDate",
      width: 130,
      defaultVisible: true,
    },
    { key: "fixedAt", label: "Opraveno", type: "date", field: "fixedAt", width: 120 },
    { key: "description", label: "Popis", type: "longtext", field: "description", width: 320 },
  ],
  search: (r) => ({ title: String(r.title) }),
  url: (id) => `/realizace/vady/${id}`,
});

/* ---------- společné pomocníky ---------- */

const jobId = z.uuid();

async function readJob(ctx: Ctx, id: string) {
  await assertEntityAccess(ctx, "job", id, "read");
  if (!scopeOf(ctx, "realizace.read")) throw new PermissionError();
}
/** Plán upravuje ten, kdo smí zakázku měnit. */
async function writeJob(ctx: Ctx, id: string) {
  await assertEntityAccess(ctx, "job", id, "write");
}

/** Termín zakázky = rozsah fází. */
async function syncJobDates(ctx: Ctx, id: string) {
  await ctx.db.execute(sql`
    update job set start_date = p.min_start, end_date = p.max_end, updated_at = now(), updated_by = ${ctx.actor.userId}
    from (select min(start_date) as min_start, max(end_date) as max_end from job_phase where job_id = ${id} and deleted_at is null) p
    where job.id = ${id} and p.min_start is not null
      and (job.start_date is distinct from p.min_start or job.end_date is distinct from p.max_end)`);
}

const range = (a: string, b: string) => (a === b ? a : `${a} – ${b}`);
/** Datum nebo rozsah v textu upozornění: „2. 11. 2026 – 6. 11. 2026“. */
const fmtRange = (a: string, b: string) =>
  a === b ? formatDate(a) : `${formatDate(a)} – ${formatDate(b)}`;
const shiftedText = (n: number) => (n ? `Posunuto navazujících fází: ${n}` : null);

type PhaseRow = typeof jobPhase.$inferSelect;
const toPhase = (p: PhaseRow, today: string) => ({
  id: p.id,
  name: p.name,
  startDate: p.startDate,
  endDate: p.endDate,
  baselineStart: p.baselineStart,
  baselineEnd: p.baselineEnd,
  actualStart: p.actualStart,
  actualEnd: p.actualEnd,
  progress: p.progress,
  status: p.status,
  plannedHours: p.plannedHours,
  responsibleId: p.responsibleId,
  dependsOnId: p.dependsOnId,
  milestone: p.milestone,
  note: p.note,
  delay: phaseDelay(p, today),
});

async function loadPhases(ctx: Ctx, id: string) {
  return ctx.db
    .select()
    .from(jobPhase)
    .where(and(eq(jobPhase.jobId, id), isNull(jobPhase.deletedAt)))
    .orderBy(asc(jobPhase.position), asc(jobPhase.startDate), asc(jobPhase.createdAt));
}

/* ---------- harmonogram ---------- */

export const phasesList = defineCommand({
  name: "realizace.phases.list",
  permission: "realizace.read",
  input: z.object({ jobId }),
  handler: async (ctx, i) => {
    await readJob(ctx, i.jobId);
    const today = todayIso();
    const rows = await loadPhases(ctx, i.jobId);
    const responsible = [
      ...new Set(rows.map((r) => r.responsibleId).filter((x): x is string => !!x)),
    ];
    const users = responsible.length
      ? await ctx.db
          .select({ id: schema.user.id, name: schema.user.name })
          .from(schema.user)
          .where(inArray(schema.user.id, responsible))
      : [];
    return {
      phases: rows.map((p) => toPhase(p, today)),
      progress: jobProgress(rows),
      users: Object.fromEntries(users.map((u) => [u.id, u.name])),
    };
  },
});

const optDate = z.preprocess((v) => (v === "" ? null : v), z.iso.date().nullish());

const phaseInput = z.object({
  jobId,
  id: z.uuid().optional(),
  name: z.string().trim().min(2, "Vyplňte název fáze.").max(120),
  startDate: z.iso.date("Vyplňte začátek fáze."),
  endDate: z.iso.date("Vyplňte konec fáze."),
  actualStart: optDate,
  actualEnd: optDate,
  progress: z.number().int().min(0).max(100).default(0),
  plannedHours: z.number().int().min(0).max(100_000).nullish(),
  responsibleId: z.uuid().nullish(),
  dependsOnId: z.uuid().nullish(),
  milestone: z.boolean().default(false),
  note: z.string().trim().max(1000).nullish(),
  /** Posunout navazující fáze, když se tato přeplánuje. */
  shift: z.boolean().default(true),
});

async function applyShift(ctx: Ctx, id: string, phaseId: string, shift: boolean) {
  if (!shift) return [];
  const all = await loadPhases(ctx, id);
  const moved = shiftDependents(all, phaseId);
  for (const m of moved)
    await ctx.db
      .update(jobPhase)
      .set({ startDate: m.startDate, endDate: m.endDate, updatedBy: ctx.actor.userId })
      .where(eq(jobPhase.id, m.id));
  return moved;
}

export const phasesSave = defineCommand({
  name: "realizace.phases.save",
  permission: "realizace.read",
  input: phaseInput,
  handler: async (ctx, d) => {
    await writeJob(ctx, d.jobId);
    if (d.milestone) d.endDate = d.startDate;
    if (d.endDate < d.startDate) throw new UserError("Konec fáze musí být po začátku.");
    if (d.actualStart && d.actualEnd && d.actualEnd < d.actualStart)
      throw new UserError("Skutečný konec je před skutečným začátkem.");

    return inTx(ctx, async (c) => {
      const all = await loadPhases(c, d.jobId);
      if (d.dependsOnId && !all.some((p) => p.id === d.dependsOnId))
        throw new UserError("Předchozí fáze patří k jiné zakázce.");
      if (wouldCycle(all, d.id ?? null, d.dependsOnId ?? null))
        throw new UserError("Návaznost by vytvořila kruh — fáze by čekala sama na sebe.");
      const before = d.id ? all.find((p) => p.id === d.id) : undefined;
      if (d.id && !before) throw new NotFoundError("Fáze nenalezena.");

      const status = statusFromProgress(d.progress);
      const today = todayIso();
      const values = {
        name: d.name,
        startDate: d.startDate,
        endDate: d.endDate,
        actualStart:
          d.actualStart ?? (status !== "planned" ? (before?.actualStart ?? today) : null),
        actualEnd: status === "done" ? (d.actualEnd ?? today) : null,
        progress: d.progress,
        status,
        plannedHours: d.plannedHours ?? null,
        responsibleId: d.responsibleId ?? null,
        dependsOnId: d.dependsOnId ?? null,
        milestone: d.milestone,
        note: d.note || null,
        updatedBy: c.actor.userId,
      };
      let phaseId = d.id;
      if (phaseId) {
        await c.db.update(jobPhase).set(values).where(eq(jobPhase.id, phaseId));
      } else {
        const [row] = await c.db
          .insert(jobPhase)
          .values({
            ...values,
            jobId: d.jobId,
            position: all.length ? Math.max(...all.map((p) => p.position)) + 1 : 0,
            baselineStart: d.startDate,
            baselineEnd: d.endDate,
            createdBy: c.actor.userId,
          })
          .returning({ id: jobPhase.id });
        phaseId = row!.id;
      }
      const moved = await applyShift(c, d.jobId, phaseId, d.shift);
      await syncJobDates(c, d.jobId);

      const datesChanged =
        !before || before.startDate !== d.startDate || before.endDate !== d.endDate;
      await recordAudit(c, {
        action: before ? "update" : "create",
        entityType: "job",
        entityId: d.jobId,
        summary: before
          ? `Fáze „${d.name}“ upravena${datesChanged ? ` (${range(d.startDate, d.endDate)})` : ""}${moved.length ? `, posunuto ${moved.length} navazujících` : ""}`
          : `Přidána fáze „${d.name}“ (${range(d.startDate, d.endDate)})`,
      });
      if (datesChanged || moved.length)
        await notifyJobTeam(
          c.db,
          d.jobId,
          c.actor.userId,
          before ? JOB_SCHEDULE : PHASE_ADDED,
          {
            phase: d.name,
            dates: fmtRange(d.startDate, d.endDate),
            shifted: before ? shiftedText(moved.length) : null,
          },
          { extraUserIds: [d.responsibleId] },
        );
      return { id: phaseId, shifted: moved.length };
    });
  },
});

/** Přetažení pruhu v Ganttu: nové datum začátku a konce, volitelně s posunem navazujících. */
export const phasesMove = defineCommand({
  name: "realizace.phases.move",
  permission: "realizace.read",
  input: z.object({
    jobId,
    id: z.uuid(),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    shift: z.boolean().default(true),
  }),
  handler: async (ctx, i) => {
    await writeJob(ctx, i.jobId);
    if (i.endDate < i.startDate) throw new UserError("Konec fáze musí být po začátku.");
    return inTx(ctx, async (c) => {
      const [p] = await c.db
        .select()
        .from(jobPhase)
        .where(and(eq(jobPhase.id, i.id), eq(jobPhase.jobId, i.jobId), isNull(jobPhase.deletedAt)));
      if (!p) throw new NotFoundError("Fáze nenalezena.");
      const end = p.milestone ? i.startDate : i.endDate;
      if (p.startDate === i.startDate && p.endDate === end) return { shifted: 0 };
      await c.db
        .update(jobPhase)
        .set({ startDate: i.startDate, endDate: end, updatedBy: c.actor.userId })
        .where(eq(jobPhase.id, i.id));
      const moved = await applyShift(c, i.jobId, i.id, i.shift);
      await syncJobDates(c, i.jobId);
      await recordAudit(c, {
        action: "update",
        entityType: "job",
        entityId: i.jobId,
        summary: `Fáze „${p.name}“ přeplánována na ${range(i.startDate, end)}${moved.length ? `, posunuto ${moved.length} navazujících` : ""}`,
      });
      await notifyJobTeam(
        c.db,
        i.jobId,
        c.actor.userId,
        JOB_SCHEDULE,
        { phase: p.name, dates: fmtRange(i.startDate, end), shifted: shiftedText(moved.length) },
        { extraUserIds: [p.responsibleId] },
      );
      return { shifted: moved.length };
    });
  },
});

export const phasesSetProgress = defineCommand({
  name: "realizace.phases.setProgress",
  permission: "realizace.read",
  input: z.object({ jobId, id: z.uuid(), progress: z.number().int().min(0).max(100) }),
  handler: async (ctx, i) => {
    // průběh smí zapisovat i vedoucí a tým zakázky (montér hlásí postup), ne jen ten, kdo plán přeplánovává
    if (!(await canWriteDiary(ctx, i.jobId))) throw new PermissionError();
    await inTx(ctx, async (c) => {
      const [p] = await c.db
        .select()
        .from(jobPhase)
        .where(and(eq(jobPhase.id, i.id), eq(jobPhase.jobId, i.jobId), isNull(jobPhase.deletedAt)));
      if (!p) throw new NotFoundError("Fáze nenalezena.");
      const status = statusFromProgress(i.progress);
      const today = todayIso();
      await c.db
        .update(jobPhase)
        .set({
          progress: i.progress,
          status,
          actualStart: p.actualStart ?? (i.progress > 0 ? today : null),
          actualEnd: status === "done" ? (p.actualEnd ?? today) : null,
          updatedBy: c.actor.userId,
        })
        .where(eq(jobPhase.id, i.id));
      if (status !== p.status) {
        await recordAudit(c, {
          action: "update",
          entityType: "job",
          entityId: i.jobId,
          summary: `Fáze „${p.name}“: ${status === "done" ? "hotovo" : `${i.progress} %`}`,
        });
        if (status === "done")
          await notifyJobTeam(
            c.db,
            i.jobId,
            c.actor.userId,
            PHASE_DONE,
            { phase: p.name },
            { extraUserIds: [p.responsibleId] },
          );
      }
    });
  },
});

export const phasesDelete = defineCommand({
  name: "realizace.phases.delete",
  permission: "realizace.read",
  input: z.object({ id: z.uuid() }),
  handler: async (ctx, i) => {
    await inTx(ctx, async (c) => {
      const [p] = await c.db
        .select()
        .from(jobPhase)
        .where(and(eq(jobPhase.id, i.id), isNull(jobPhase.deletedAt)));
      if (!p) throw new NotFoundError("Fáze nenalezena.");
      await writeJob(c, p.jobId);
      await c.db.update(jobPhase).set({ dependsOnId: null }).where(eq(jobPhase.dependsOnId, i.id));
      await c.db
        .update(jobPhase)
        .set({ deletedAt: new Date(), updatedBy: c.actor.userId })
        .where(eq(jobPhase.id, i.id));
      await syncJobDates(c, p.jobId);
      await recordAudit(c, {
        action: "delete",
        entityType: "job",
        entityId: p.jobId,
        summary: `Odebrána fáze „${p.name}“`,
      });
    });
  },
});

/** Aktuální plán se stane novým výchozím (např. po dohodě se zákazníkem o posunu). */
export const phasesSetBaseline = defineCommand({
  name: "realizace.phases.setBaseline",
  permission: "realizace.read",
  input: z.object({ jobId }),
  handler: async (ctx, i) => {
    await writeJob(ctx, i.jobId);
    await inTx(ctx, async (c) => {
      await c.db
        .update(jobPhase)
        .set({
          baselineStart: sql`${jobPhase.startDate}`,
          baselineEnd: sql`${jobPhase.endDate}`,
          updatedBy: c.actor.userId,
        })
        .where(and(eq(jobPhase.jobId, i.jobId), isNull(jobPhase.deletedAt)));
      await recordAudit(c, {
        action: "update",
        entityType: "job",
        entityId: i.jobId,
        summary: "Aktuální harmonogram uložen jako výchozí plán",
      });
    });
  },
});

/** Přehled všech zakázek s harmonogramem (v rozsahu, který aktér vidí): průběh, zpoždění, nejbližší fáze. */
export const overview = defineCommand({
  name: "realizace.overview",
  permission: "realizace.read",
  input: z.object({}),
  handler: async (ctx, _i, deps) => {
    const jobDef = deps.registry.get("job");
    if (!jobDef) return [];
    const ids = await visibleIds(ctx, await resolveEntity(ctx.db, jobDef));
    if (!ids.length) return [];
    const phases = await ctx.db
      .select()
      .from(jobPhase)
      .where(and(inArray(jobPhase.jobId, ids), isNull(jobPhase.deletedAt)));
    if (!phases.length) return [];
    const jobs = await ctx.db
      .select({ id: job.id, number: job.number, title: job.title })
      .from(job)
      .where(inArray(job.id, [...new Set(phases.map((p) => p.jobId))]));
    const today = todayIso();
    return jobs
      .map((j) => {
        const ps = phases.filter((p) => p.jobId === j.id);
        const open = ps
          .filter((p) => p.status !== "done")
          .sort((a, b) => a.startDate.localeCompare(b.startDate));
        return {
          id: j.id,
          number: j.number,
          title: j.title,
          startDate: ps.map((p) => p.startDate).sort()[0]!,
          endDate: ps
            .map((p) => p.endDate)
            .sort()
            .reverse()[0]!,
          progress: jobProgress(ps),
          delay: Math.max(0, ...ps.map((p) => phaseDelay(p, today))),
          next: open[0]
            ? { name: open[0].name, startDate: open[0].startDate, endDate: open[0].endDate }
            : null,
          phases: ps.length,
          done: ps.every((p) => p.status === "done"),
        };
      })
      .sort(
        (a, b) =>
          Number(a.done) - Number(b.done) ||
          b.delay - a.delay ||
          a.startDate.localeCompare(b.startDate),
      );
  },
});

/* ---------- předávací protokol ---------- */

export const handoverList = defineCommand({
  name: "realizace.handover.list",
  permission: "realizace.read",
  input: z.object({ jobId }),
  handler: async (ctx, i) => {
    await readJob(ctx, i.jobId);
    const protocols = await ctx.db
      .select()
      .from(handoverProtocol)
      .where(and(eq(handoverProtocol.jobId, i.jobId), isNull(handoverProtocol.deletedAt)))
      .orderBy(desc(handoverProtocol.date), desc(handoverProtocol.createdAt));
    const items = protocols.length
      ? await ctx.db
          .select()
          .from(handoverItem)
          .where(
            inArray(
              handoverItem.protocolId,
              protocols.map((p) => p.id),
            ),
          )
          .orderBy(asc(handoverItem.position))
      : [];
    return protocols.map((p) => ({
      id: p.id,
      number: p.number,
      date: p.date,
      note: p.note,
      acceptedBy: p.acceptedBy,
      status: p.status,
      signatureFileId: p.signatureFileId,
      signedAt: p.signedAt,
      items: items
        .filter((it) => it.protocolId === p.id)
        .map((it) => ({ text: it.text, ok: it.ok, note: it.note })),
    }));
  },
});

export const handoverSave = defineCommand({
  name: "realizace.handover.save",
  permission: "realizace.write",
  input: z.object({
    jobId,
    id: z.uuid().optional(),
    date: z.iso.date("Vyplňte datum předání."),
    note: z.string().trim().max(3000).nullish(),
    acceptedBy: z.string().trim().max(120).nullish(),
    items: z
      .array(
        z.object({
          text: z.string().trim().min(1).max(300),
          ok: z.boolean(),
          note: z.string().trim().max(500).nullish(),
        }),
      )
      .max(100),
  }),
  handler: async (ctx, i) => {
    await readJob(ctx, i.jobId);
    return inTx(ctx, async (c) => {
      let id = i.id;
      if (id) {
        const [cur] = await c.db
          .select()
          .from(handoverProtocol)
          .where(
            and(
              eq(handoverProtocol.id, id),
              eq(handoverProtocol.jobId, i.jobId),
              isNull(handoverProtocol.deletedAt),
            ),
          );
        if (!cur) throw new NotFoundError("Protokol nenalezen.");
        if (cur.status === "signed") throw new UserError("Podepsaný protokol už nejde měnit.");
        await c.db
          .update(handoverProtocol)
          .set({
            date: i.date,
            note: i.note || null,
            acceptedBy: i.acceptedBy || null,
            updatedBy: c.actor.userId,
          })
          .where(eq(handoverProtocol.id, id));
        await c.db.delete(handoverItem).where(eq(handoverItem.protocolId, id));
      } else {
        const number = await nextNumber(c.db, "realizace.predani");
        const [row] = await c.db
          .insert(handoverProtocol)
          .values({
            jobId: i.jobId,
            number,
            date: i.date,
            note: i.note || null,
            acceptedBy: i.acceptedBy || null,
            createdBy: c.actor.userId,
            updatedBy: c.actor.userId,
          })
          .returning({ id: handoverProtocol.id });
        id = row!.id;
        await recordAudit(c, {
          action: "create",
          entityType: "job",
          entityId: i.jobId,
          summary: `Založen předávací protokol ${number}`,
        });
      }
      if (i.items.length)
        await c.db.insert(handoverItem).values(
          i.items.map((it, n) => ({
            protocolId: id!,
            position: n,
            text: it.text,
            ok: it.ok,
            note: it.note || null,
          })),
        );
      return { id };
    });
  },
});

/** Podpis zákazníka: soubor s podpisem musí být připojený k téže zakázce. Podepsaný protokol je neměnný. */
export const handoverSign = defineCommand({
  name: "realizace.handover.sign",
  permission: "realizace.write",
  input: z.object({
    id: z.uuid(),
    signatureFileId: z.uuid(),
    acceptedBy: z.string().trim().min(2, "Napište, kdo za zákazníka přebírá.").max(120),
  }),
  handler: async (ctx, i) => {
    await inTx(ctx, async (c) => {
      const [p] = await c.db
        .select()
        .from(handoverProtocol)
        .where(and(eq(handoverProtocol.id, i.id), isNull(handoverProtocol.deletedAt)));
      if (!p) throw new NotFoundError("Protokol nenalezen.");
      await readJob(c, p.jobId);
      if (p.status === "signed") throw new UserError("Protokol už je podepsaný.");
      const [att] = await c.db
        .select({ id: schema.attachment.id })
        .from(schema.attachment)
        .where(
          and(
            eq(schema.attachment.fileId, i.signatureFileId),
            eq(schema.attachment.entityType, "job"),
            eq(schema.attachment.entityId, p.jobId),
            isNull(schema.attachment.deletedAt),
          ),
        );
      if (!att)
        throw new UserError("Podpis se nepodařilo najít u této zakázky. Zkuste ho nahrát znovu.");
      await c.db
        .update(handoverProtocol)
        .set({
          status: "signed",
          signatureFileId: i.signatureFileId,
          acceptedBy: i.acceptedBy,
          signedAt: todayIso(),
          updatedBy: c.actor.userId,
        })
        .where(eq(handoverProtocol.id, i.id));
      await recordAudit(c, {
        action: "update",
        entityType: "job",
        entityId: p.jobId,
        summary: `Předávací protokol ${p.number} podepsán (${i.acceptedBy})`,
      });
      await notifyJobTeam(c.db, p.jobId, c.actor.userId, JOB_HANDOVER, {
        protocol: p.number,
        acceptedBy: i.acceptedBy,
      });
    });
  },
});

export const handoverDelete = defineCommand({
  name: "realizace.handover.delete",
  permission: "realizace.write",
  input: z.object({ id: z.uuid() }),
  handler: async (ctx, i) => {
    await inTx(ctx, async (c) => {
      const [p] = await c.db
        .select()
        .from(handoverProtocol)
        .where(and(eq(handoverProtocol.id, i.id), isNull(handoverProtocol.deletedAt)));
      if (!p) throw new NotFoundError("Protokol nenalezen.");
      await readJob(c, p.jobId);
      if (p.status === "signed") throw new UserError("Podepsaný protokol nejde smazat.");
      await c.db
        .update(handoverProtocol)
        .set({ deletedAt: new Date(), updatedBy: c.actor.userId })
        .where(eq(handoverProtocol.id, i.id));
    });
  },
});

/* ---------- přehled: pozornost, dlaždice, kalendářní vrstva ---------- */

async function visibleJobIds(ctx: Ctx, deps: ModuleDeps) {
  const def = deps.registry.get("job");
  if (!def) return [];
  return visibleIds(ctx, await resolveEntity(ctx.db, def));
}
const canRead = (ctx: Ctx) => scopeOf(ctx, "realizace.read") !== null;

export const server = defineModuleServer({
  entities: [defectEntity],
  phaseHooks,
  jobs: [
    defineModuleJob({
      name: "realizace.today",
      schema: z.object({}),
      cron: "0 6 * * 1-5",
      retryLimit: 1,
      async handler(deps) {
        await sendMorningOverview(deps.db);
      },
    }),
    defineModuleJob({
      name: "realizace.phases",
      schema: z.object({}),
      cron: "10 6 * * 1-5",
      retryLimit: 1,
      async handler(deps) {
        await sendPhaseStarts(deps.db);
        await sendPhaseDeadlines(deps.db);
      },
    }),
    defineModuleJob({
      name: "realizace.diary",
      schema: z.object({}),
      cron: "0 16 * * 1-5",
      retryLimit: 1,
      async handler(deps) {
        await sendDiaryReminders(deps.db);
      },
    }),
  ],
  commands: [
    phasesList,
    phasesSave,
    phasesMove,
    phasesSetProgress,
    phasesDelete,
    phasesSetBaseline,
    overview,
    ...diaryCommands,
    investorView,
    defectsOpen,
    handoverList,
    handoverSave,
    handoverSign,
    handoverDelete,
    ...(terminal.commands ?? []),
  ],
  attention: [
    async (ctx, deps) => {
      if (!canRead(ctx)) return [];
      const ids = await visibleJobIds(ctx, deps);
      if (!ids.length) return [];
      const today = todayIso();
      const rows = await ctx.db
        .select({ p: jobPhase, number: job.number, title: job.title })
        .from(jobPhase)
        .innerJoin(job, eq(job.id, jobPhase.jobId))
        .where(
          and(
            inArray(jobPhase.jobId, ids),
            isNull(jobPhase.deletedAt),
            sql`${jobPhase.status} <> 'done'`,
          ),
        );
      return rows
        .map((r) => ({ ...r, delay: phaseDelay(r.p, today) }))
        .filter((r) => r.delay > 0)
        .sort((a, b) => b.delay - a.delay)
        .slice(0, 8)
        .map((r): AttentionItem => ({
          id: `phase-delay-${r.p.id}`,
          module: "realizace",
          severity: r.delay >= 5 ? "danger" : "warning",
          title: `${r.number}: fáze „${r.p.name}“ má zpoždění ${r.delay} pracovních dnů`,
          detail: r.title,
          href: `/zakazky/${r.p.jobId}`,
        }));
    },
    async (ctx) => {
      if (!canRead(ctx)) return [];
      const me = ctx.actor.userId;
      if (!me) return [];
      const rows = await ctx.db
        .select({ id: defect.id, title: defect.title, due: defect.dueDate })
        .from(defect)
        .innerJoin(schema.pipelineStage, eq(schema.pipelineStage.id, defect.stageId))
        .where(
          and(
            isNull(defect.deletedAt),
            eq(defect.responsibleId, me),
            sql`${schema.pipelineStage.kind} = 'open'`,
            sql`${defect.dueDate} < ${todayIso()}`,
          ),
        )
        .limit(8);
      return rows.map((r): AttentionItem => ({
        id: `defect-overdue-${r.id}`,
        module: "realizace",
        severity: "warning",
        title: `Vada „${r.title}“ je po termínu opravy`,
        href: `/realizace/vady/${r.id}`,
      }));
    },
  ],
  widgets: [
    async (ctx, deps) => {
      if (!canRead(ctx)) return [];
      const ids = await visibleJobIds(ctx, deps);
      if (!ids.length) return [];
      const today = todayIso();
      const phases = await ctx.db
        .select()
        .from(jobPhase)
        .where(and(inArray(jobPhase.jobId, ids), isNull(jobPhase.deletedAt)));
      const delayed = new Set(phases.filter((p) => phaseDelay(p, today) > 0).map((p) => p.jobId));
      return [
        {
          id: "jobs-delayed",
          module: "realizace",
          title: "Zakázky se zpožděním",
          value: String(delayed.size),
          hint: `z ${new Set(phases.map((p) => p.jobId)).size} s harmonogramem`,
          tone: delayed.size ? "warning" : "success",
          href: "/realizace",
          order: 30,
        },
      ];
    },
  ],
  calendarLayers: [
    {
      key: "realizace.phases",
      label: "Fáze zakázek",
      color: "blue",
      items: async (ctx, range, deps) => {
        if (!canRead(ctx)) return [];
        const ids = await visibleJobIds(ctx, deps);
        if (!ids.length) return [];
        const rows = await ctx.db
          .select({ p: jobPhase, number: job.number })
          .from(jobPhase)
          .innerJoin(job, eq(job.id, jobPhase.jobId))
          .where(
            and(
              inArray(jobPhase.jobId, ids),
              isNull(jobPhase.deletedAt),
              sql`${jobPhase.startDate} <= ${range.to}`,
              sql`${jobPhase.endDate} >= ${range.from}`,
            ),
          );
        return rows.map((r) => ({
          id: `phase-${r.p.id}`,
          layer: "realizace.phases",
          title: `${r.number}: ${r.p.name}`,
          start: r.p.startDate,
          end: r.p.endDate,
          allDay: true,
          href: `/zakazky/${r.p.jobId}`,
        }));
      },
    },
  ],
});

export {
  diaryDelete,
  diaryList,
  diaryPrefill,
  diaryPrint,
  diarySave,
  diarySign,
  diaryUnsign,
  diaryWeather,
} from "./diary";
export { defectsOpen } from "./defects";
export { investorView } from "./investor";
export { phaseHooks };
export {
  nextWorkday,
  previousWorkday,
  sendDiaryReminders,
  sendMorningOverview,
  sendPhaseDeadlines,
  sendPhaseStarts,
} from "./scheduled";
export { defect, handoverItem, handoverProtocol, jobPhase, siteDiary };
export * from "./schedule";
export const entities = [defectEntity];
