import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { getTableColumns } from "drizzle-orm";
import { recordAudit } from "@rebar/core/audit";
import { schema, type Executor } from "@rebar/core/db";
import type { ModuleDeps } from "@rebar/core/module-server";
import { NotFoundError, UserError, inTx, type Ctx } from "@rebar/core/rbac";
import { me, myEntries } from "../access";
import type { CellSaveInput, CellSaveOutput, SaveInput, SaveOutput } from "../contract";
import { dayLimitError, planCellSave, type CellEntry } from "../logic/grid";
import { formatDuration, parseCellDuration, parseDuration } from "../logic/parse-time";
import { timeEntry } from "../schema";
import { loadJob, loadTask, taskTitles } from "./lookups";

/*
  Zápis hodin (HOD-01): vlastní záznamy aktéra, bez stopek a bez schvalování. Viditelnost dědí záznam od zakázky a úkolu
  (hodiny soukromé zakázky jsou soukromé), `time_entry` nemá vlastní zámek.
*/

const ENTITY = "time_entry";

type Row = typeof timeEntry.$inferSelect;

/** Minuty ze vstupu příkazu: `minutes` má přednost, jinak se rozebere text `time`. */
function minutesOf(input: { time?: string | undefined; minutes?: number | undefined }, allowZero: boolean): number {
  if (input.minutes !== undefined) {
    if (input.minutes <= 0 && !allowZero) throw new UserError("Čas musí být větší než nula.");
    return input.minutes;
  }
  const parsed = allowZero ? parseCellDuration(input.time ?? "") : parseDuration(input.time ?? "");
  if (!parsed.ok) throw new UserError(parsed.error);
  if (parsed.minutes <= 0 && !allowZero) throw new UserError("Čas musí být větší než nula.");
  return parsed.minutes;
}

/** Součet minut člověka v den, bez uvedených záznamů (ty se právě mění). */
async function dayMinutesExcept(
  db: Executor,
  userId: string,
  date: string,
  exceptIds: readonly string[],
): Promise<number> {
  const [r] = await db
    .select({ total: sql<number>`coalesce(sum(${timeEntry.minutes}), 0)::int` })
    .from(timeEntry)
    .where(
      and(
        eq(timeEntry.userId, userId),
        eq(timeEntry.date, date),
        isNull(timeEntry.deletedAt),
        ...exceptIds.map((id) => ne(timeEntry.id, id)),
      ),
    );
  return r?.total ?? 0;
}

/**
 * Zda je zakázka nebo úkol soukromý (záznam hodin pak dědí zámek). Čte tabulky přes registr entit, takže nepotřebuje
 * znát cizí moduly; entita, která v registru není, se přeskočí.
 */
async function hasPrivateParent(
  db: Executor,
  deps: ModuleDeps,
  parents: readonly { entityType: string; id: string | null }[],
): Promise<boolean> {
  for (const p of parents) {
    if (!p.id) continue;
    const def = deps.registry.get(p.entityType);
    if (!def) continue;
    const cols = getTableColumns(def.table) as Record<string, AnyPgColumn>;
    if (!cols.isPrivate) continue;
    const [r] = await db.select({ p: cols.isPrivate }).from(def.table).where(eq(cols.id!, p.id));
    if (r?.p === true) return true;
  }
  return false;
}

/** Zámek nového nebo přesunutého záznamu: soukromý rodič ⇒ `true` (zděděno), jinak sdílený. Udržuje `private_record`. */
async function inheritedLock(
  db: Executor,
  deps: ModuleDeps,
  jobId: string,
  taskId: string | null,
): Promise<{ isPrivate: boolean; visibilitySource: "own" | "inherited" }> {
  const isPrivate = await hasPrivateParent(db, deps, [
    { entityType: "job", id: jobId },
    { entityType: "task", id: taskId },
  ]);
  return { isPrivate, visibilitySource: isPrivate ? "inherited" : "own" };
}

async function syncPrivateRecord(db: Executor, id: string, isPrivate: boolean): Promise<void> {
  if (isPrivate)
    await db
      .insert(schema.privateRecord)
      .values({ entityType: ENTITY, entityId: id })
      .onConflictDoNothing();
  else
    await db
      .delete(schema.privateRecord)
      .where(and(eq(schema.privateRecord.entityType, ENTITY), eq(schema.privateRecord.entityId, id)));
}

const fmtDate = (d: string) => d.split("-").reverse().join(". ");

async function auditEntry(
  ctx: Ctx,
  action: "create" | "update" | "delete",
  before: Row | null,
  after: Row,
  deps: ModuleDeps,
): Promise<void> {
  const job = (await loadJobTitle(ctx, deps, after.jobId)) ?? "Zakázka";
  const titles = await taskTitles(ctx, deps, [after.taskId, before?.taskId].filter((t): t is string => !!t));
  const changes: { field: string; old: unknown; new: unknown }[] = [];
  const diff = (field: string, o: unknown, n: unknown) => {
    if ((o ?? null) !== (n ?? null)) changes.push({ field, old: o ?? null, new: n ?? null });
  };
  diff("Datum", before?.date, after.date);
  diff(
    "Čas",
    before ? formatDuration(before.minutes) : null,
    action === "delete" ? null : formatDuration(after.minutes),
  );
  diff("Úkol", before?.taskId ? (titles[before.taskId] ?? "Úkol") : null, after.taskId ? (titles[after.taskId] ?? "Úkol") : null);
  diff("Poznámka", before?.note, after.note);
  if (action === "create") diff("Zakázka", null, job);
  await recordAudit(ctx, {
    action,
    entityType: ENTITY,
    entityId: after.id,
    summary: `${fmtDate(after.date)} · ${formatDuration(after.minutes)} h · ${job}`,
    entityTitle: after.date,
    changes: changes as never,
    context: { jobId: after.jobId },
  });
}

async function loadJobTitle(ctx: Ctx, deps: ModuleDeps, jobId: string): Promise<string | null> {
  try {
    return (await loadJob(ctx, deps, jobId)).title;
  } catch {
    return null;
  }
}

async function ownEntry(ctx: Ctx, id: string): Promise<Row> {
  const [row] = await ctx.db.select().from(timeEntry).where(myEntries(ctx, eq(timeEntry.id, id)));
  if (!row) throw new NotFoundError("Záznam hodin nenalezen.");
  return row;
}

/**
 * Založí nebo upraví vlastní záznam hodin. K úkolu stačí `taskId` (zakázka se vezme z úkolu; úkol bez zakázky ani úkol
 * jiné zakázky nejde použít). Za jeden den nejde zapsat víc než 24 hodin. Neviditelná zakázka se tváří jako neexistující.
 */
export async function saveEntry(ctx: Ctx, deps: ModuleDeps, input: SaveInput): Promise<SaveOutput> {
  const userId = me(ctx);
  const minutes = minutesOf(input, false);
  return inTx(ctx, async (c) => {
    const before = input.id ? await ownEntry(c, input.id) : null;

    let jobId = input.jobId ?? before?.jobId ?? null;
    let taskId = input.taskId === undefined ? (before?.taskId ?? null) : input.taskId;
    if (taskId) {
      const task = await loadTask(c, deps, taskId);
      if (!task.jobId)
        throw new UserError("Úkol nepatří k žádné zakázce. Čas jde zapsat jen u úkolů zakázky.");
      if (input.jobId && input.jobId !== task.jobId)
        throw new UserError("Úkol patří k jiné zakázce, než je vybraná.");
      jobId = task.jobId;
    }
    if (!jobId) throw new UserError("Vyberte zakázku.");
    await loadJob(c, deps, jobId);

    const others = await dayMinutesExcept(c.db, userId, input.date, before ? [before.id] : []);
    const limit = dayLimitError(others, minutes);
    if (limit) throw new UserError(limit);

    const note = input.note?.trim() || null;
    const lock = await inheritedLock(c.db, deps, jobId, taskId);
    if (before) {
      const [after] = await c.db
        .update(timeEntry)
        .set({
          jobId,
          taskId,
          date: input.date,
          minutes,
          note,
          ...lock,
          updatedBy: userId,
        })
        .where(eq(timeEntry.id, before.id))
        .returning();
      await syncPrivateRecord(c.db, before.id, lock.isPrivate);
      await auditEntry(c, "update", before, after!, deps);
      return {
        id: before.id,
        jobId,
        taskId,
        date: input.date,
        minutes,
        dayMinutes: others + minutes,
      };
    }
    const [created] = await c.db
      .insert(timeEntry)
      .values({ userId, jobId, taskId, date: input.date, minutes, note, ...lock, createdBy: userId, updatedBy: userId })
      .returning();
    await syncPrivateRecord(c.db, created!.id, lock.isPrivate);
    await auditEntry(c, "create", null, created!, deps);
    return {
      id: created!.id,
      jobId,
      taskId,
      date: input.date,
      minutes,
      dayMinutes: others + minutes,
    };
  });
}

/** Smaže (měkce) vlastní záznam hodin. */
export async function deleteEntry(ctx: Ctx, deps: ModuleDeps, id: string): Promise<{ id: string }> {
  return inTx(ctx, async (c) => {
    const before = await ownEntry(c, id);
    await c.db
      .update(timeEntry)
      .set({ deletedAt: new Date(), updatedBy: me(c) })
      .where(eq(timeEntry.id, id));
    await auditEntry(c, "delete", before, before, deps);
    return { id };
  });
}

/**
 * Upsert buňky týdenního výkazu: nastaví čas „bez úkolu“ v buňce zakázka × den. Prázdný čas nebo 0 buňku vymaže; víc
 * záznamů bez úkolu v buňce se sloučí do nejstaršího (poznámky se spojí). Záznamy u úkolů se nemění.
 */
export async function saveCell(
  ctx: Ctx,
  deps: ModuleDeps,
  input: CellSaveInput,
): Promise<CellSaveOutput> {
  const userId = me(ctx);
  const minutes = minutesOf(input, true);
  return inTx(ctx, async (c) => {
    await loadJob(c, deps, input.jobId);
    const existing = await c.db
      .select()
      .from(timeEntry)
      .where(
        myEntries(
          c,
          eq(timeEntry.jobId, input.jobId),
          eq(timeEntry.date, input.date),
          isNull(timeEntry.taskId),
        ),
      )
      .orderBy(asc(timeEntry.createdAt), asc(timeEntry.id));
    const plan = planCellSave(
      existing.map(
        (e): CellEntry => ({
          id: e.id,
          minutes: e.minutes,
          note: e.note,
          createdAt: e.createdAt.toISOString(),
        }),
      ),
      minutes,
    );
    const others = await dayMinutesExcept(
      c.db,
      userId,
      input.date,
      existing.map((e) => e.id),
    );
    if (plan.kind === "noop") return { minutes, dayMinutes: others + minutes };
    const limit = dayLimitError(others, minutes);
    if (limit) throw new UserError(limit);

    if (plan.kind === "insert") {
      const lock = await inheritedLock(c.db, deps, input.jobId, null);
      const [created] = await c.db
        .insert(timeEntry)
        .values({
          userId,
          jobId: input.jobId,
          taskId: null,
          date: input.date,
          minutes: plan.minutes,
          ...lock,
          createdBy: userId,
          updatedBy: userId,
        })
        .returning();
      await syncPrivateRecord(c.db, created!.id, lock.isPrivate);
      await auditEntry(c, "create", null, created!, deps);
      return { minutes, dayMinutes: others + minutes };
    }
    const byId = new Map(existing.map((e) => [e.id, e]));
    const remove = async (ids: readonly string[]) => {
      for (const id of ids) {
        const gone = byId.get(id)!;
        await c.db
          .update(timeEntry)
          .set({ deletedAt: new Date(), updatedBy: userId })
          .where(eq(timeEntry.id, id));
        await auditEntry(c, "delete", gone, gone, deps);
      }
    };
    if (plan.kind === "delete") {
      await remove(plan.deleteIds);
      return { minutes: 0, dayMinutes: others };
    }
    const before = byId.get(plan.id)!;
    const [after] = await c.db
      .update(timeEntry)
      .set({ minutes: plan.minutes, note: plan.note, updatedBy: userId })
      .where(eq(timeEntry.id, plan.id))
      .returning();
    await auditEntry(c, "update", before, after!, deps);
    await remove(plan.deleteIds);
    return { minutes, dayMinutes: others + minutes };
  });
}
