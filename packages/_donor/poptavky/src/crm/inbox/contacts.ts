import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { getLookup, getPipeline } from "@rebar/core/config-data";
import { schema } from "@rebar/core/db";
import { assertEntityAccess, getEntityPolicy, resolveEntity } from "@rebar/core/entities";
import { defineCommand } from "@rebar/core/module-server";
import { inTx, NotFoundError, UserError, can, scopeOf } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { recordAudit } from "@rebar/core/audit";
import { company, person } from "@rebar/kontakty/schema";
import { job, jobParticipant } from "@rebar/zakazky/schema";
import { crmActivityType, inquiry } from "../../schema";
import { findContactDuplicates } from "../deals/duplicates";
import { daysSince } from "../logic";
import { JOB_TYPE_FIELD } from "./quick-add";

/* ---------- společné volby pro dialogy (typy aktivit, zdroje, stavy, typy kontaktu) ---------- */

/**
 * Číselníky a nabídky pro dialogy schránky a rychlého zadání v jednom dotazu: typy aktivit, zdroje, důvody zamítnutí,
 * typy firem, typy zakázek (vlastní pole) a obchodní stavy nástěnky.
 */
export const optionsCommand = defineCommand({
  name: "crm.inbox.options",
  permission: ["poptavky.read", "zakazky.read", "zakazky.write"],
  input: z.object({}),
  handler: async (ctx, _i, deps) => {
    const types = await ctx.db
      .select({
        key: crmActivityType.key,
        name: crmActivityType.name,
        icon: crmActivityType.icon,
        defaultDurationMin: crmActivityType.defaultDurationMin,
      })
      .from(crmActivityType)
      .where(and(isNull(crmActivityType.deletedAt), eq(crmActivityType.active, true)))
      .orderBy(asc(crmActivityType.position));
    const pick = async (key: string) =>
      (await getLookup(ctx.db, key)).map((r) => ({ value: r.value, label: r.label }));
    const pipeline = await getPipeline(ctx.db, "job", "default");
    const jobDef = deps.registry.get("job");
    const jobE = jobDef ? await resolveEntity(ctx.db, jobDef) : null;
    const jobType = jobE?.byKey.get(`custom.${JOB_TYPE_FIELD}`);
    return {
      activityTypes: types,
      sources: await pick("job.source"),
      inquiryLostReasons: await pick("inquiry.lost_reason"),
      companyTypes: await pick("company.type"),
      jobTypes: (jobType?.choices ?? []).map((c) => ({ value: c.value, label: c.label })),
      stages: (pipeline?.stages ?? [])
        .filter((s) => s.kind === "open" && ["inquiry", "offer"].includes(String(s.phase)))
        .map((s) => ({ id: s.id, name: s.name, phase: s.phase, color: s.color })),
    };
  },
});

/** Údaje poptávky a nalezené duplicity pro dialog „Kvalifikovat“ (firma/osoba z poptávky, IČO k doplnění). */
export const qualifyPreviewCommand = defineCommand({
  name: "crm.inbox.qualifyPreview",
  permission: "poptavky.convert",
  input: z.object({ id: z.uuid(), ico: z.string().trim().max(20).optional() }),
  handler: async (ctx, i) => {
    await assertEntityAccess(ctx, "inquiry", i.id, "read");
    const [row] = await ctx.db.select().from(inquiry).where(eq(inquiry.id, i.id));
    if (!row) throw new NotFoundError();
    const duplicates = can(ctx, "kontakty.read")
      ? await findContactDuplicates(ctx, {
          ico: i.ico,
          email: row.contactEmail,
          phone: row.contactPhone,
        })
      : { companies: [], persons: [] };
    const names = async () => {
      const out: { company: string | null; person: string | null } = {
        company: null,
        person: null,
      };
      if (row.companyId && can(ctx, "kontakty.read"))
        out.company =
          (
            await ctx.db
              .select({ n: company.name })
              .from(company)
              .where(eq(company.id, row.companyId))
          )[0]?.n ?? null;
      if (row.personId && can(ctx, "kontakty.read"))
        out.person =
          (
            await ctx.db.select({ n: person.name }).from(person).where(eq(person.id, row.personId))
          )[0]?.n ?? null;
      return out;
    };
    return {
      inquiry: {
        id: row.id,
        title: row.title,
        contactName: row.contactName,
        contactEmail: row.contactEmail,
        contactPhone: row.contactPhone,
        companyName: row.companyName,
        message: row.message,
        source: row.source,
        ownerId: row.ownerId,
        convertedJobId: row.convertedJobId,
        companyId: row.companyId,
        personId: row.personId,
        linked: await names(),
      },
      duplicates,
    };
  },
});

/* ---------- přehled obchodu firmy a osoby ---------- */

/** Zakázky, které aktér smí číst (rozsah „jen moje“ platí; bez oprávnění žádné). */
async function visibleJobIds(ctx: Ctx, ids: string[]): Promise<string[]> {
  const scope = scopeOf(ctx, "zakazky.read");
  if (!scope || !ids.length) return [];
  if (scope === "all") return ids;
  const policy = getEntityPolicy("job");
  if (!policy) return [];
  const ok: string[] = [];
  for (const id of ids) {
    const owners = await policy.owners(ctx.db, id);
    if (owners && can(ctx, "zakazky.read", owners)) ok.push(id);
  }
  return ok;
}

/** Zakázka v přehledu obchodu kontaktu (fáze, stav, aktivity; částky jen s oprávněním). */
export type OverviewDeal = {
  id: string;
  number: string;
  title: string;
  phase: string;
  stageId: string;
  stageName: string;
  isOpen: boolean;
  expectedCloseDate: string | null;
  daysInStage: number | null;
  nextActivityAt: string | null;
  openActivities: number;
  overdueActivities: number;
  rotting: boolean;
  /** Role osoby na zakázce, když je jen účastník (ne hlavní kontakt). */
  participantRole: string | null;
  /** Částky jen s oprávněním `zakazky.finance`. */
  valueMinor?: number;
  weightedMinor?: number;
};

const OPEN_PHASES = ["inquiry", "offer"];
const WON_PHASES = ["preparation", "execution", "handover", "warranty", "closed"];

/**
 * Přehled obchodu u firmy nebo osoby: zakázky s fází a stavem (pro mini pás stavů), souhrn otevřených a vyhraných obchodů,
 * kontaktní osoby, související firmy a (u osoby) účasti na zakázkách. Částky vidí jen, kdo má `zakazky.finance`;
 * zakázky se řídí oprávněním `zakazky.read` (rozsah „jen moje“ platí).
 */
export const overviewCommand = defineCommand({
  name: "crm.contact.overview",
  permission: "kontakty.read",
  input: z.object({ entity: z.enum(["company", "person"]), id: z.uuid() }),
  handler: async (ctx, i) => {
    await assertEntityAccess(ctx, i.entity, i.id, "read");
    const money = can(ctx, "zakazky.finance");

    // kandidáti: zakázky firmy / osoby jako hlavního kontaktu a účasti osoby na zakázkách
    const direct = await ctx.db
      .select({ id: job.id })
      .from(job)
      .where(
        and(
          isNull(job.deletedAt),
          i.entity === "company" ? eq(job.companyId, i.id) : eq(job.personId, i.id),
        ),
      );
    const parts =
      i.entity === "person"
        ? await ctx.db
            .select({ jobId: jobParticipant.jobId, role: jobParticipant.role })
            .from(jobParticipant)
            .where(and(eq(jobParticipant.personId, i.id), isNull(jobParticipant.deletedAt)))
        : [];
    const roleOf = new Map(parts.map((p) => [p.jobId, p.role]));
    const ids = await visibleJobIds(ctx, [
      ...new Set([...direct.map((d) => d.id), ...parts.map((p) => p.jobId)]),
    ]);

    const rows = ids.length
      ? await ctx.db
          .select({
            id: job.id,
            number: job.number,
            title: job.title,
            phase: job.phase,
            stageId: job.stageId,
            stageName: schema.pipelineStage.name,
            expectedCloseDate: job.expectedCloseDate,
            stageEntered: job.crmStageEnteredAt,
            nextActivityAt: job.crmNextActivityAt,
            openActivities: job.crmOpenActivities,
            overdueActivities: job.crmOverdueActivities,
            rotting: job.crmRotting,
            archivedAt: job.crmArchivedAt,
            sumContract: job.valueMinor,
            weighted: job.crmWeightedMinor,
            updatedAt: job.updatedAt,
          })
          .from(job)
          .innerJoin(schema.pipelineStage, eq(schema.pipelineStage.id, job.stageId))
          .where(inArray(job.id, ids))
          .orderBy(desc(job.updatedAt))
      : [];

    const now = new Date();
    const deals: OverviewDeal[] = rows.map((r) => {
      const isOpen = OPEN_PHASES.includes(r.phase) && !r.archivedAt;
      return {
        id: r.id,
        number: r.number,
        title: r.title,
        phase: r.phase,
        stageId: r.stageId,
        stageName: r.stageName,
        isOpen,
        expectedCloseDate: r.expectedCloseDate,
        daysInStage: r.stageEntered ? Math.max(0, daysSince(r.stageEntered, now)) : null,
        nextActivityAt: r.nextActivityAt?.toISOString() ?? null,
        openActivities: r.openActivities,
        overdueActivities: r.overdueActivities,
        rotting: r.rotting,
        participantRole: direct.some((d) => d.id === r.id) ? null : (roleOf.get(r.id) ?? ""),
        ...(money ? { valueMinor: r.sumContract, weightedMinor: r.weighted } : {}),
      };
    });

    const open = rows.filter((r) => OPEN_PHASES.includes(r.phase) && !r.archivedAt);
    const won = rows.filter((r) => WON_PHASES.includes(r.phase));
    const summary = {
      open: open.length,
      won: won.length,
      lost: rows.filter((r) => r.phase === "lost").length,
      ...(money
        ? {
            openValueMinor: open.reduce((s, r) => s + r.sumContract, 0),
            weightedMinor: open.reduce((s, r) => s + r.weighted, 0),
            // obrat = smluvní cena vyhraných zakázek (bez DPH)
            turnoverMinor: won.reduce((s, r) => s + r.sumContract, 0),
          }
        : {}),
    };

    const pipeline = await getPipeline(ctx.db, "job", "default");
    const stages = (pipeline?.stages ?? [])
      .filter(
        (s) => (s.kind === "open" && OPEN_PHASES.includes(String(s.phase))) || s.kind === "won",
      )
      .map((s) => ({ id: s.id, name: s.name, color: s.color, kind: s.kind, phase: s.phase }));

    // kontaktní osoby firmy, firma osoby, související firmy
    const base: {
      people: {
        id: string;
        name: string;
        position: string | null;
        role: string | null;
        email: string | null;
        phone: string | null;
      }[];
      company: { id: string; name: string } | null;
      parent: { id: string; name: string } | null;
      children: { id: string; name: string }[];
    } = { people: [], company: null, parent: null, children: [] };
    if (i.entity === "company") {
      base.people = await ctx.db
        .select({
          id: person.id,
          name: person.name,
          position: person.position,
          role: person.role,
          email: person.email,
          phone: person.phone,
        })
        .from(person)
        .where(and(eq(person.companyId, i.id), isNull(person.deletedAt)))
        .orderBy(asc(person.name))
        .limit(50);
      const [self] = await ctx.db
        .select({ parentId: company.parentId })
        .from(company)
        .where(eq(company.id, i.id));
      if (self?.parentId)
        base.parent =
          (
            await ctx.db
              .select({ id: company.id, name: company.name })
              .from(company)
              .where(and(eq(company.id, self.parentId), isNull(company.deletedAt)))
          )[0] ?? null;
      base.children = await ctx.db
        .select({ id: company.id, name: company.name })
        .from(company)
        .where(and(eq(company.parentId, i.id), isNull(company.deletedAt)))
        .orderBy(asc(company.name))
        .limit(50);
    } else {
      const [self] = await ctx.db
        .select({ companyId: person.companyId })
        .from(person)
        .where(eq(person.id, i.id));
      if (self?.companyId)
        base.company =
          (
            await ctx.db
              .select({ id: company.id, name: company.name })
              .from(company)
              .where(and(eq(company.id, self.companyId), isNull(company.deletedAt)))
          )[0] ?? null;
    }
    return { deals, summary, stages, money, ...base };
  },
});

/* ---------- účastníci zakázky ---------- */

const jobIdInput = z.object({ jobId: z.uuid() });

/** Účastníci zakázky (osoba + role) s kontaktními údaji (ty jen s oprávněním ke kontaktům). */
export const participantsListCommand = defineCommand({
  name: "crm.participant.list",
  permission: "zakazky.read",
  input: jobIdInput,
  handler: async (ctx, i) => {
    await assertEntityAccess(ctx, "job", i.jobId, "read");
    const contacts = can(ctx, "kontakty.read");
    const rows = await ctx.db
      .select({
        id: jobParticipant.id,
        personId: jobParticipant.personId,
        role: jobParticipant.role,
        name: person.name,
        email: person.email,
        phone: person.phone,
        companyId: person.companyId,
        companyName: company.name,
      })
      .from(jobParticipant)
      .innerJoin(person, eq(person.id, jobParticipant.personId))
      .leftJoin(company, eq(company.id, person.companyId))
      .where(and(eq(jobParticipant.jobId, i.jobId), isNull(jobParticipant.deletedAt)))
      .orderBy(asc(jobParticipant.createdAt));
    return rows.map((r) => ({
      id: r.id,
      personId: r.personId,
      role: r.role,
      name: r.name,
      companyId: r.companyId,
      companyName: r.companyName,
      email: contacts ? r.email : null,
      phone: contacts ? r.phone : null,
    }));
  },
});

const roleField = z.string().trim().max(60).optional();

export const participantAddCommand = defineCommand({
  name: "crm.participant.add",
  permission: "zakazky.write",
  input: jobIdInput.extend({ personId: z.uuid(), role: roleField }),
  handler: async (ctx, i) => {
    await assertEntityAccess(ctx, "job", i.jobId, "write");
    // osoba musí být viditelná (rozsah ke kontaktům); cizí osoba se tváří jako neexistující
    await assertEntityAccess(ctx, "person", i.personId, "read");
    return inTx(ctx, async (c) => {
      const [dupe] = await c.db
        .select({ id: jobParticipant.id })
        .from(jobParticipant)
        .where(
          and(
            eq(jobParticipant.jobId, i.jobId),
            eq(jobParticipant.personId, i.personId),
            isNull(jobParticipant.deletedAt),
          ),
        );
      if (dupe) throw new UserError("Tato osoba už je mezi účastníky zakázky.");
      const [row] = await c.db
        .insert(jobParticipant)
        .values({
          jobId: i.jobId,
          personId: i.personId,
          role: i.role || null,
          createdBy: c.actor.userId,
          updatedBy: c.actor.userId,
        })
        .returning({ id: jobParticipant.id });
      const [p] = await c.db
        .select({ name: person.name })
        .from(person)
        .where(eq(person.id, i.personId));
      await recordAudit(c, {
        action: "update",
        entityType: "job",
        entityId: i.jobId,
        summary: `Účastník zakázky: ${p?.name ?? ""}${i.role ? ` (${i.role})` : ""}`,
        changes: [
          { field: "Účastníci", old: null, new: `${p?.name ?? ""}${i.role ? ` – ${i.role}` : ""}` },
        ],
      });
      return { id: row!.id };
    });
  },
});

export const participantUpdateCommand = defineCommand({
  name: "crm.participant.update",
  permission: "zakazky.write",
  input: z.object({ id: z.uuid(), role: roleField }),
  handler: async (ctx, i) => {
    const [cur] = await ctx.db
      .select()
      .from(jobParticipant)
      .where(and(eq(jobParticipant.id, i.id), isNull(jobParticipant.deletedAt)));
    if (!cur) throw new NotFoundError();
    await assertEntityAccess(ctx, "job", cur.jobId, "write");
    await inTx(ctx, async (c) => {
      await c.db
        .update(jobParticipant)
        .set({ role: i.role || null, updatedBy: c.actor.userId })
        .where(eq(jobParticipant.id, i.id));
      await recordAudit(c, {
        action: "update",
        entityType: "job",
        entityId: cur.jobId,
        summary: "Změněna role účastníka zakázky",
        changes: [{ field: "Role účastníka", old: cur.role, new: i.role || null }],
      });
    });
    return { id: i.id };
  },
});

export const participantRemoveCommand = defineCommand({
  name: "crm.participant.remove",
  permission: "zakazky.write",
  input: z.object({ id: z.uuid() }),
  handler: async (ctx, i) => {
    const [cur] = await ctx.db
      .select()
      .from(jobParticipant)
      .where(and(eq(jobParticipant.id, i.id), isNull(jobParticipant.deletedAt)));
    if (!cur) throw new NotFoundError();
    await assertEntityAccess(ctx, "job", cur.jobId, "write");
    await inTx(ctx, async (c) => {
      await c.db
        .update(jobParticipant)
        .set({ deletedAt: new Date(), updatedBy: c.actor.userId })
        .where(eq(jobParticipant.id, i.id));
      const [p] = await c.db
        .select({ name: person.name })
        .from(person)
        .where(eq(person.id, cur.personId));
      await recordAudit(c, {
        action: "update",
        entityType: "job",
        entityId: cur.jobId,
        summary: `Odebrán účastník zakázky: ${p?.name ?? ""}`,
        changes: [{ field: "Účastníci", old: p?.name ?? null, new: null }],
      });
    });
  },
});

export const contactCommands = [
  optionsCommand,
  qualifyPreviewCommand,
  overviewCommand,
  participantsListCommand,
  participantAddCommand,
  participantUpdateCommand,
  participantRemoveCommand,
];
