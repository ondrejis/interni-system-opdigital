import { and, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { recordAudit } from "@rebar/core/audit";
import { schema, type Executor } from "@rebar/core/db";
import { assertEntityAccess, visibleRecordTitles, type EntityRegistry } from "@rebar/core/entities";
import { notify } from "@rebar/core/notifications";
import {
  can,
  inTx,
  NotFoundError,
  PermissionError,
  scopeOf,
  UserError,
  type Ctx,
} from "@rebar/core/rbac";
import { formatInstant } from "@rebar/core/time";
import { company, person } from "@rebar/kontakty/schema";
import { job } from "@rebar/zakazky/schema";
import { crmActivity, crmActivityType } from "../../schema";
import { recomputeJobCrm } from "../deals/recompute";
import { CRM_ACTIVITY_ASSIGNED } from "./notifications";
import { dueState, normalizeDue, snoozeTarget, suggestNextDue } from "./logic";
import type {
  ActivityDto,
  ActivityPriority,
  ActivityTypeDto,
  NextActivitySuggestion,
} from "./types";

/** Oprávnění aktivit a poznámek: nové klíče nevznikají, CRM používá `poptavky.*` (docs/CRM.md, bod 7). */
export const READ = "poptavky.read";
export const WRITE = "poptavky.write";

/** Řádek aktivity z databáze. */
export type ActivityRow = typeof crmActivity.$inferSelect;
type TypeRow = typeof crmActivityType.$inferSelect;

/* ---------- viditelnost a vlastníci ---------- */

/**
 * Rozsah „jen moje“ pro aktivity: přiřazeno mně, nebo jsem vlastník (vedoucí) zakázky, ke které aktivita patří.
 * Použije ho entita `crm_activity` i všechny dotazy příkazů, takže pravidlo je na jednom místě.
 */
export function activityScope(ctx: Ctx): SQL {
  const me = ctx.actor.userId;
  if (!me) return sql`false`;
  return or(
    eq(crmActivity.assigneeId, me),
    sql`exists (select 1 from ${job} where ${job.id} = ${crmActivity.jobId} and ${job.managerId} = ${me} and ${job.deletedAt} is null)`,
  )!;
}

/** Podmínka `WHERE` pro aktivity, které aktér smí číst (bez smazaných). Bez oprávnění vyhodí PermissionError. */
export function visibleActivities(ctx: Ctx): SQL {
  const scope = scopeOf(ctx, READ);
  if (!scope) throw new PermissionError();
  return and(isNull(crmActivity.deletedAt), scope === "all" ? undefined : activityScope(ctx))!;
}

/** Vlastníci aktivity pro rozsah „jen moje“: přiřazený a vedoucí zakázky; `null`, když aktivita neexistuje. */
export async function activityOwners(db: Executor, id: string): Promise<(string | null)[] | null> {
  const [row] = await db
    .select({ assignee: crmActivity.assigneeId, manager: job.managerId })
    .from(crmActivity)
    .leftJoin(job, eq(job.id, crmActivity.jobId))
    .where(and(eq(crmActivity.id, id), isNull(crmActivity.deletedAt)));
  return row ? [row.assignee, row.manager] : null;
}

/** Načte aktivitu k úpravě: kdo ji nesmí číst, tomu neexistuje; kdo ji nesmí měnit, dostane PermissionError. */
async function loadWritable(ctx: Ctx, id: string): Promise<ActivityRow> {
  const [row] = await ctx.db
    .select()
    .from(crmActivity)
    .where(and(eq(crmActivity.id, id), isNull(crmActivity.deletedAt)));
  if (!row) throw new NotFoundError("Aktivita nenalezena.");
  const owners = (await activityOwners(ctx.db, id)) ?? [];
  if (!can(ctx, READ, { ownerIds: owners })) throw new NotFoundError("Aktivita nenalezena.");
  if (!can(ctx, WRITE, { ownerIds: owners })) throw new PermissionError();
  return row;
}

/* ---------- typy ---------- */

/** Typ aktivity v podobě pro UI. */
export const toTypeDto = (t: TypeRow): ActivityTypeDto => ({
  id: t.id,
  key: t.key,
  name: t.name,
  icon: t.icon,
  defaultDurationMin: t.defaultDurationMin,
});

/** Aktivní typy aktivit v pořadí z nastavení. */
export async function listActivityTypes(db: Executor, opts: { all?: boolean } = {}) {
  const rows = await db
    .select()
    .from(crmActivityType)
    .where(
      and(
        isNull(crmActivityType.deletedAt),
        opts.all ? undefined : eq(crmActivityType.active, true),
      ),
    )
    .orderBy(crmActivityType.position, crmActivityType.name);
  return rows;
}

async function resolveType(
  db: Executor,
  ref: { typeId?: string | null | undefined; typeKey?: string | null | undefined },
): Promise<TypeRow> {
  const key = ref.typeId ?? ref.typeKey;
  if (!key) throw new UserError("Vyberte typ aktivity.");
  const [t] = await db
    .select()
    .from(crmActivityType)
    .where(
      and(
        isNull(crmActivityType.deletedAt),
        ref.typeId ? eq(crmActivityType.id, ref.typeId) : eq(crmActivityType.key, ref.typeKey!),
      ),
    );
  if (!t) throw new UserError("Typ aktivity neexistuje.");
  if (!t.active) throw new UserError(`Typ aktivity „${t.name}“ je vypnutý.`);
  return t;
}

/* ---------- vazby ---------- */

type Links = { jobId: string | null; companyId: string | null; personId: string | null };

/**
 * Ověří vazby aktivity (zakázka, firma, osoba musí existovat a aktér je musí smět číst) a doplní z zakázky firmu a osobu,
 * pokud nejsou zadané; aktivita tak patří i na časovou osu firmy a osoby. `trusted` přeskočí kontrolu přístupu
 * (první aktivita při kvalifikaci: zakázku právě založil sám systém).
 */
async function resolveLinks(
  ctx: Ctx,
  want: {
    jobId?: string | null | undefined;
    companyId?: string | null | undefined;
    personId?: string | null | undefined;
  },
  trusted: boolean,
): Promise<Links> {
  let companyId = want.companyId ?? null;
  let personId = want.personId ?? null;
  const jobId = want.jobId ?? null;
  if (jobId) {
    if (!trusted) await assertEntityAccess(ctx, "job", jobId, "read");
    const [j] = await ctx.db
      .select({ companyId: job.companyId, personId: job.personId })
      .from(job)
      .where(and(eq(job.id, jobId), isNull(job.deletedAt)));
    if (!j) throw new UserError("Zakázka neexistuje.");
    companyId ??= j.companyId;
    personId ??= j.personId;
  }
  if (companyId) {
    if (!trusted) await assertEntityAccess(ctx, "company", companyId, "read");
    const [c] = await ctx.db
      .select({ id: company.id })
      .from(company)
      .where(and(eq(company.id, companyId), isNull(company.deletedAt)));
    if (!c) throw new UserError("Firma neexistuje.");
  }
  if (personId) {
    if (!trusted) await assertEntityAccess(ctx, "person", personId, "read");
    const [p] = await ctx.db
      .select({ id: person.id })
      .from(person)
      .where(and(eq(person.id, personId), isNull(person.deletedAt)));
    if (!p) throw new UserError("Osoba neexistuje.");
  }
  return { jobId, companyId, personId };
}

async function assertActiveUser(db: Executor, userId: string) {
  const [u] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(
      and(eq(schema.user.id, userId), eq(schema.user.active, true), isNull(schema.user.deletedAt)),
    );
  if (!u) throw new UserError("Přiřazený uživatel neexistuje nebo je deaktivovaný.");
}

/** Přepočet `crm_*` zakázky; zakázka, která mezitím zmizela, aktivitu nezablokuje. */
async function recomputeJob(ctx: Ctx, jobId: string | null | undefined) {
  if (!jobId) return;
  try {
    await recomputeJobCrm(ctx, jobId);
  } catch (e) {
    if (!(e instanceof NotFoundError)) throw e;
  }
}

/* ---------- čitelné hodnoty do auditu ---------- */

const PRIORITY_TEXT: Record<string, string> = { low: "Nízká", normal: "Běžná", high: "Vysoká" };

/** Hodnoty aktivity v podobě pro člověka (popisky polí česky); do auditu a pro srovnání před a po změně. */
async function humanFields(db: Executor, row: ActivityRow): Promise<Record<string, unknown>> {
  const [type] = await db
    .select({ name: crmActivityType.name })
    .from(crmActivityType)
    .where(eq(crmActivityType.id, row.typeId));
  const userName = async (id: string | null) =>
    id
      ? ((
          await db
            .select({ name: schema.user.name })
            .from(schema.user)
            .where(eq(schema.user.id, id))
        )[0]?.name ?? null)
      : null;
  const [j] = row.jobId
    ? await db.select({ title: job.title }).from(job).where(eq(job.id, row.jobId))
    : [];
  const [c] = row.companyId
    ? await db.select({ name: company.name }).from(company).where(eq(company.id, row.companyId))
    : [];
  const [p] = row.personId
    ? await db.select({ name: person.name }).from(person).where(eq(person.id, row.personId))
    : [];
  return {
    Typ: type?.name ?? null,
    Předmět: row.subject,
    Termín: row.dueAt ? formatInstant(row.dueAt, { year: true, time: !row.allDay }) : null,
    "Celý den": row.allDay ? "ano" : "ne",
    "Délka (min)": row.durationMin,
    Priorita: PRIORITY_TEXT[row.priority] ?? row.priority,
    Místo: row.location,
    Poznámka: row.note,
    Výsledek: row.outcome,
    Přiřazeno: await userName(row.assigneeId),
    Zakázka: j?.title ?? null,
    Firma: c?.name ?? null,
    Osoba: p?.name ?? null,
    Hotovo: row.doneAt ? formatInstant(row.doneAt, { year: true }) : null,
  };
}

async function auditUpdate(
  ctx: Ctx,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  row: ActivityRow,
  summary?: string,
) {
  const changes = Object.keys(after)
    .filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null))
    .map((field) => ({ field, old: before[field] ?? null, new: after[field] ?? null }));
  if (!changes.length) return;
  await recordAudit(ctx, {
    action: "update",
    entityType: "crm_activity",
    entityId: row.id,
    summary: summary ?? row.subject,
    changes,
  });
}

/* ---------- upozornění ---------- */

/** Upozorní přiřazeného, že mu někdo (jiný) aktivitu naplánoval nebo předal. */
export async function notifyActivityAssigned(ctx: Ctx, row: ActivityRow) {
  if (!row.assigneeId || row.assigneeId === ctx.actor.userId) return;
  const [type] = await ctx.db
    .select({ name: crmActivityType.name })
    .from(crmActivityType)
    .where(eq(crmActivityType.id, row.typeId));
  const [j] = row.jobId
    ? await ctx.db.select({ title: job.title }).from(job).where(eq(job.id, row.jobId))
    : [];
  await notify(ctx.db, CRM_ACTIVITY_ASSIGNED, {
    params: {
      type: type?.name ?? "Aktivita",
      subject: row.subject,
      due: row.dueAt ? formatInstant(row.dueAt, { time: !row.allDay }) : "bez termínu",
      deal: j?.title ?? null,
    },
    to: { assignee: [row.assigneeId] },
    record: { type: "crm_activity", id: row.id },
    url: row.jobId ? `/crm?record=${row.jobId}` : "/crm/dnes",
    actorId: ctx.actor.userId,
  });
}

/* ---------- zápis ---------- */

/** Zadání nové aktivity (termín jako `Date`; tvar příkazu `crm.activity.create` po převodu). */
export type CreateActivityInput = {
  typeKey?: string | null | undefined;
  typeId?: string | null | undefined;
  subject: string;
  dueAt?: Date | null | undefined;
  allDay?: boolean | undefined;
  durationMin?: number | null | undefined;
  priority?: ActivityPriority | undefined;
  location?: string | null | undefined;
  note?: string | null | undefined;
  /** Bez hodnoty se aktivita přiřadí tomu, kdo ji zakládá; `null` = nepřiřazeno. */
  assigneeId?: string | null | undefined;
  jobId?: string | null | undefined;
  companyId?: string | null | undefined;
  personId?: string | null | undefined;
  /** Založí aktivitu rovnou jako hotovou (zalogovaný hovor). */
  done?: boolean | undefined;
  outcome?: string | null | undefined;
};

/** Volby zápisu aktivity: systémové volání a čas pro testy. */
export type ActivityOpts = {
  /** Systémové volání (první aktivita při kvalifikaci): přeskočí kontrolu přístupu k vazbám a rozsah „jen moje“. */
  trusted?: boolean;
  now?: Date;
};

/** Zdůvodnění toho, proč „jen moje“ nesmí aktivitu založit. */
const OWN_ONLY = "S rozsahem „jen moje“ smíte aktivitu založit jen sobě nebo na svou zakázku.";

/**
 * Založí aktivitu: ověří typ, vazby a přiřazeného, zapíše ji s auditem, přepočte zakázku (jako poslední krok) a upozorní
 * přiřazeného. Běží v transakci volajícího (nebo si otevře vlastní).
 */
export async function createActivity(
  ctx: Ctx,
  input: CreateActivityInput,
  opts: ActivityOpts = {},
): Promise<ActivityRow> {
  const now = opts.now ?? new Date();
  return inTx(ctx, async (c) => {
    const type = await resolveType(c.db, input);
    const links = await resolveLinks(c, input, opts.trusted === true);
    const assigneeId =
      input.assigneeId === undefined ? (c.actor.userId ?? null) : (input.assigneeId ?? null);
    if (assigneeId) await assertActiveUser(c.db, assigneeId);

    if (!opts.trusted && scopeOf(c, WRITE) === "own") {
      const [j] = links.jobId
        ? await c.db.select({ m: job.managerId }).from(job).where(eq(job.id, links.jobId))
        : [];
      if (!can(c, WRITE, { ownerIds: [assigneeId, j?.m ?? null] }))
        throw new PermissionError(OWN_ONLY);
    }

    const allDay = input.allDay === true;
    const dueAt = input.dueAt ? normalizeDue(input.dueAt, allDay) : null;
    const durationMin = allDay ? null : (input.durationMin ?? type.defaultDurationMin ?? null);
    const markDone = input.done === true;
    const [row] = await c.db
      .insert(crmActivity)
      .values({
        typeId: type.id,
        subject: input.subject,
        dueAt: dueAt ?? (markDone ? now : null),
        allDay: dueAt ? allDay : false,
        durationMin,
        priority: input.priority ?? "normal",
        location: input.location ?? null,
        note: input.note ?? null,
        outcome: markDone ? (input.outcome ?? null) : null,
        doneAt: markDone ? now : null,
        doneBy: markDone ? (c.actor.userId ?? null) : null,
        assigneeId,
        ...links,
        createdBy: c.actor.userId,
        updatedBy: c.actor.userId,
      })
      .returning();
    const created = row!;
    const shown = await humanFields(c.db, created);
    await recordAudit(c, {
      action: "create",
      entityType: "crm_activity",
      entityId: created.id,
      summary: `${type.name}: ${created.subject}`,
      changes: Object.entries(shown)
        .filter(([, v]) => v !== null && v !== "ne")
        .map(([field, v]) => ({ field, old: null, new: v })),
    });
    await notifyActivityAssigned(c, created);
    await recomputeJob(c, created.jobId);
    return created;
  });
}

/** Změna aktivity: jen zadaná pole; `null` hodnotu nebo vazbu odebere. */
export type UpdateActivityInput = Partial<Omit<CreateActivityInput, "done" | "outcome">> & {
  outcome?: string | null | undefined;
};

/** Změní aktivitu (jen zadaná pole; `null` vazbu nebo hodnotu odebere). Přepočte původní i nové zakázky. */
export async function updateActivity(
  ctx: Ctx,
  id: string,
  patch: UpdateActivityInput,
): Promise<ActivityRow> {
  return inTx(ctx, async (c) => {
    const before = await loadWritable(c, id);
    const set: Partial<typeof crmActivity.$inferInsert> = {};
    if (patch.typeId || patch.typeKey) {
      const type = await resolveType(c.db, patch);
      if (type.id !== before.typeId) set.typeId = type.id;
    }
    if (patch.subject !== undefined) set.subject = patch.subject;
    const allDay = patch.allDay ?? before.allDay;
    if (patch.dueAt !== undefined || patch.allDay !== undefined) {
      const due = patch.dueAt === undefined ? before.dueAt : patch.dueAt;
      set.dueAt = due ? normalizeDue(due, allDay) : null;
      set.allDay = due ? allDay : false;
      if (allDay) set.durationMin = null;
    }
    if (patch.durationMin !== undefined && !allDay) set.durationMin = patch.durationMin;
    if (patch.priority !== undefined) set.priority = patch.priority;
    if (patch.location !== undefined) set.location = patch.location;
    if (patch.note !== undefined) set.note = patch.note;
    if (patch.outcome !== undefined) set.outcome = patch.outcome;
    if (patch.assigneeId !== undefined) {
      if (patch.assigneeId) await assertActiveUser(c.db, patch.assigneeId);
      set.assigneeId = patch.assigneeId;
    }
    if (
      patch.jobId !== undefined ||
      patch.companyId !== undefined ||
      patch.personId !== undefined
    ) {
      const links = await resolveLinks(
        c,
        {
          jobId: patch.jobId === undefined ? before.jobId : patch.jobId,
          companyId: patch.companyId === undefined ? before.companyId : patch.companyId,
          personId: patch.personId === undefined ? before.personId : patch.personId,
        },
        false,
      );
      Object.assign(set, links);
    }
    if (!Object.keys(set).length) return before;

    const beforeShown = await humanFields(c.db, before);
    const [row] = await c.db
      .update(crmActivity)
      .set({ ...set, updatedBy: c.actor.userId })
      .where(eq(crmActivity.id, id))
      .returning();
    const after = row!;
    await auditUpdate(c, beforeShown, await humanFields(c.db, after), after);
    if (after.assigneeId !== before.assigneeId) await notifyActivityAssigned(c, after);
    await recomputeJob(c, after.jobId);
    if (before.jobId !== after.jobId) await recomputeJob(c, before.jobId);
    return after;
  });
}

/** Návrh další aktivity: stejný typ, předmět a vazby, termín nejbližší pracovní den po dokončení. */
export async function suggestionFor(
  db: Executor,
  row: ActivityRow,
  now: Date = new Date(),
): Promise<NextActivitySuggestion> {
  const [type] = await db
    .select({ key: crmActivityType.key })
    .from(crmActivityType)
    .where(eq(crmActivityType.id, row.typeId));
  return {
    typeId: row.typeId,
    typeKey: type?.key ?? "task",
    subject: row.subject,
    dueAt: suggestNextDue(row, now).toISOString(),
    allDay: row.allDay,
    durationMin: row.durationMin,
    priority: row.priority as ActivityPriority,
    location: row.location,
    assigneeId: row.assigneeId,
    jobId: row.jobId,
    companyId: row.companyId,
    personId: row.personId,
  };
}

/**
 * Označí aktivitu jako hotovou (volitelně s výsledkem) a rovnou naplánuje další, je-li zadaná. Opakované dokončení
 * nic nemění. Vrací dokončenou aktivitu, návrh další a případně založenou další aktivitu.
 */
export async function completeActivity(
  ctx: Ctx,
  id: string,
  input: { outcome?: string | null | undefined; next?: CreateActivityInput | null | undefined },
  now: Date = new Date(),
): Promise<{ row: ActivityRow; suggestion: NextActivitySuggestion; next: ActivityRow | null }> {
  return inTx(ctx, async (c) => {
    const before = await loadWritable(c, id);
    let row = before;
    if (!before.doneAt) {
      const beforeShown = await humanFields(c.db, before);
      const [updated] = await c.db
        .update(crmActivity)
        .set({
          doneAt: now,
          doneBy: c.actor.userId,
          ...(input.outcome !== undefined ? { outcome: input.outcome } : {}),
          updatedBy: c.actor.userId,
        })
        .where(eq(crmActivity.id, id))
        .returning();
      row = updated!;
      await auditUpdate(
        c,
        beforeShown,
        await humanFields(c.db, row),
        row,
        `Dokončeno: ${before.subject}`,
      );
    } else if (input.outcome !== undefined && input.outcome !== before.outcome) {
      const [updated] = await c.db
        .update(crmActivity)
        .set({ outcome: input.outcome, updatedBy: c.actor.userId })
        .where(eq(crmActivity.id, id))
        .returning();
      row = updated!;
    }
    const done = row;
    const next = input.next ? await createActivity(c, input.next, { now }) : null;
    await recomputeJob(c, done.jobId);
    return { row: done, suggestion: await suggestionFor(c.db, before, now), next };
  });
}

/** Vrátí hotovou aktivitu mezi otevřené. */
export async function reopenActivity(ctx: Ctx, id: string): Promise<ActivityRow> {
  return inTx(ctx, async (c) => {
    const before = await loadWritable(c, id);
    if (!before.doneAt) return before;
    const beforeShown = await humanFields(c.db, before);
    const [row] = await c.db
      .update(crmActivity)
      .set({ doneAt: null, doneBy: null, updatedBy: c.actor.userId })
      .where(eq(crmActivity.id, id))
      .returning();
    await auditUpdate(
      c,
      beforeShown,
      await humanFields(c.db, row!),
      row!,
      `Znovu otevřeno: ${before.subject}`,
    );
    await recomputeJob(c, row!.jobId);
    return row!;
  });
}

/** Odloží otevřenou aktivitu na nový termín (`dueAt`), nebo o `days` dní od dneška se stejnou hodinou. */
export async function snoozeActivity(
  ctx: Ctx,
  id: string,
  to: { dueAt?: Date | undefined; days?: number | undefined },
  now: Date = new Date(),
): Promise<ActivityRow> {
  return inTx(ctx, async (c) => {
    const before = await loadWritable(c, id);
    if (before.doneAt) throw new UserError("Hotovou aktivitu nejde odložit, nejdřív ji otevřete.");
    const target = to.dueAt
      ? normalizeDue(to.dueAt, before.allDay)
      : snoozeTarget(before, to.days ?? 1, now);
    const beforeShown = await humanFields(c.db, before);
    const [row] = await c.db
      .update(crmActivity)
      .set({ dueAt: target, updatedBy: c.actor.userId })
      .where(eq(crmActivity.id, id))
      .returning();
    await auditUpdate(
      c,
      beforeShown,
      await humanFields(c.db, row!),
      row!,
      `Odloženo: ${before.subject}`,
    );
    await recomputeJob(c, row!.jobId);
    return row!;
  });
}

/** Smaže aktivitu (měkce, jde obnovit) a přepočte zakázku. */
export async function deleteActivity(ctx: Ctx, id: string): Promise<void> {
  await inTx(ctx, async (c) => {
    const row = await loadWritable(c, id);
    await c.db
      .update(crmActivity)
      .set({ deletedAt: new Date(), updatedBy: c.actor.userId })
      .where(eq(crmActivity.id, id));
    await recordAudit(c, {
      action: "delete",
      entityType: "crm_activity",
      entityId: id,
      summary: row.subject,
    });
    await recomputeJob(c, row.jobId);
  });
}

/* ---------- DTO ---------- */

const iso = (d: Date | null) => d?.toISOString() ?? null;

/**
 * Aktivity v podobě pro UI: typ, jména (přiřazený, kdo dokončil) a názvy vazeb. Názvy zakázky, firmy a osoby
 * jen z toho, co aktér smí vidět (bez `registry` se vynechají).
 */
export async function toActivityDtos(
  ctx: Ctx,
  registry: EntityRegistry | null,
  rows: readonly ActivityRow[],
  now: Date = new Date(),
): Promise<ActivityDto[]> {
  if (!rows.length) return [];
  const types = new Map((await listActivityTypes(ctx.db, { all: true })).map((t) => [t.id, t]));
  const userIds = [
    ...new Set(rows.flatMap((r) => [r.assigneeId, r.doneBy]).filter((v): v is string => !!v)),
  ];
  const users = userIds.length
    ? new Map(
        (
          await ctx.db
            .select({ id: schema.user.id, name: schema.user.name })
            .from(schema.user)
            .where(inArray(schema.user.id, userIds))
        ).map((u) => [u.id, u.name]),
      )
    : new Map<string, string>();
  const ids = (pick: (r: ActivityRow) => string | null) => [
    ...new Set(rows.map(pick).filter((v): v is string => !!v)),
  ];
  const titles = async (entity: string, list: string[]) =>
    registry && list.length ? await visibleRecordTitles(ctx, registry, entity, list) : {};
  const [jobs, companies, persons] = await Promise.all([
    titles(
      "job",
      ids((r) => r.jobId),
    ),
    titles(
      "company",
      ids((r) => r.companyId),
    ),
    titles(
      "person",
      ids((r) => r.personId),
    ),
  ]);
  const visibleJobIds = Object.keys(jobs);
  const numbers = visibleJobIds.length
    ? new Map(
        (
          await ctx.db
            .select({ id: job.id, number: job.number })
            .from(job)
            .where(inArray(job.id, visibleJobIds))
        ).map((j) => [j.id, j.number]),
      )
    : new Map<string, string>();
  return rows.map((r) => {
    const t = types.get(r.typeId);
    return {
      id: r.id,
      typeId: r.typeId,
      typeKey: t?.key ?? "",
      typeName: t?.name ?? "Aktivita",
      typeIcon: t?.icon ?? "circle",
      subject: r.subject,
      dueAt: iso(r.dueAt),
      allDay: r.allDay,
      durationMin: r.durationMin,
      priority: r.priority as ActivityPriority,
      location: r.location,
      note: r.note,
      outcome: r.outcome,
      doneAt: iso(r.doneAt),
      doneById: r.doneBy,
      doneByName: r.doneBy ? (users.get(r.doneBy) ?? null) : null,
      assigneeId: r.assigneeId,
      assigneeName: r.assigneeId ? (users.get(r.assigneeId) ?? null) : null,
      jobId: r.jobId,
      jobTitle: r.jobId ? (jobs[r.jobId] ?? null) : null,
      jobNumber: r.jobId ? (numbers.get(r.jobId) ?? null) : null,
      companyId: r.companyId,
      companyName: r.companyId ? (companies[r.companyId] ?? null) : null,
      personId: r.personId,
      personName: r.personId ? (persons[r.personId] ?? null) : null,
      state: dueState(r, now),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  });
}
