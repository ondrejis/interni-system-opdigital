import { and, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { writeSystemFields, type EntityRegistry } from "@rebar/core/entities";
import type { TaskSnap } from "@rebar/core/contracts";
import { emitDomain } from "@rebar/core/events";
import type { DomainEventHandler } from "@rebar/core/events";
import { NotFoundError, type Ctx } from "@rebar/core/rbac";
import { zonedToUtc } from "@rebar/core/time";
import { task } from "../schema";
import { OPEN_STATUSES } from "./constants";
import { normalizeTime } from "./logic/due";

/** Řádek úkolu z databáze. */
export type TaskRow = typeof task.$inferSelect;

/** Surový řádek (z enginu nebo hooku): jen pole, která události potřebují. */
type RawTask = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** Snímek úkolu pro události a webhooky (nikdy celý řádek). */
export function snapOf(raw: RawTask): TaskSnap {
  return {
    id: String(raw.id),
    title: String(raw.title ?? ""),
    typeKey: String(raw.typeKey ?? "task"),
    status: (raw.status as TaskSnap["status"]) ?? "todo",
    assigneeId: str(raw.assigneeId),
    dueDate: str(raw.dueDate),
    dueTime: normalizeTime(str(raw.dueTime)),
    dealId: str(raw.dealId),
    jobId: str(raw.jobId),
    companyId: str(raw.companyId),
  };
}

/** Pole úkolu, jejichž změna vyvolá `task.changed` (kalendář a systémová pole obchodu je potřebují znát). */
const WATCHED = [
  "title",
  "typeKey",
  "status",
  "assigneeId",
  "dueDate",
  "dueTime",
  "durationMin",
  "allDay",
  "place",
  "description",
  "dealId",
  "jobId",
  "companyId",
  "personId",
  "parentId",
  "sendInvites",
  "isPrivate",
] as const;

const same = (a: unknown, b: unknown) => {
  const norm = (v: unknown) => (v === undefined || v === "" ? null : v);
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
};

/** Liší se řádky v něčem, co sledují ostatní moduly? */
export function watchedChanged(before: RawTask, after: RawTask): boolean {
  return WATCHED.some((k) => {
    const norm = (r: RawTask) => (k === "dueTime" ? normalizeTime(str(r[k])) : r[k]);
    return !same(norm(before), norm(after));
  });
}

const entityOf = (raw: RawTask) => ({
  type: "task",
  id: String(raw.id),
  isPrivate: raw.isPrivate === true,
});

/** Úkol vznikl: `task.created` (webhook) a `task.changed` bez předchozího stavu (kalendář). */
export async function emitTaskCreated(ctx: Ctx, raw: RawTask): Promise<void> {
  const snap = snapOf(raw);
  await emitDomain(ctx, "task.created", { task: snap }, { entity: entityOf(raw) });
  await emitDomain(
    ctx,
    "task.changed",
    { taskId: snap.id, before: null, after: snap },
    { entity: entityOf(raw) },
  );
  if (snap.status === "done")
    await emitDomain(ctx, "task.completed", { task: snap }, { entity: entityOf(raw) });
}

/** Úkol se změnil: `task.completed` při přechodu do „Hotovo“, `task.changed` při změně sledovaných polí. */
export async function emitTaskUpdated(ctx: Ctx, before: RawTask, after: RawTask): Promise<void> {
  const b = snapOf(before);
  const a = snapOf(after);
  if (b.status !== "done" && a.status === "done")
    await emitDomain(ctx, "task.completed", { task: a }, { entity: entityOf(after) });
  if (watchedChanged(before, after))
    await emitDomain(
      ctx,
      "task.changed",
      { taskId: a.id, before: b, after: a },
      { entity: entityOf(after), previous: { before: b } },
    );
}

/** Změna, kterou `task.changed` jinak nevidí (účastníci): kalendář si úkol načte znovu. */
export async function emitTaskTouched(ctx: Ctx, raw: RawTask): Promise<void> {
  const snap = snapOf(raw);
  await emitDomain(
    ctx,
    "task.changed",
    { taskId: snap.id, before: snap, after: snap },
    { entity: entityOf(raw) },
  );
}

/** Úkol se maže (do koše): `task.changed` bez nového stavu (kalendář smaže událost, obchod přepočítá aktivity). */
export async function emitTaskDeleted(ctx: Ctx, raw: RawTask): Promise<void> {
  const snap = snapOf(raw);
  await emitDomain(
    ctx,
    "task.changed",
    { taskId: snap.id, before: snap, after: null },
    { entity: entityOf(raw) },
  );
}

/* ---------- systémová pole obchodu a organizace ---------- */

const dueInstant = (date: string, time: string | null): Date => zonedToUtc(date, time ?? "00:00");

/**
 * Přepočítá „další“ a „poslední aktivitu“ obchodu (OBCH-14): další = nejbližší otevřený úkol s termínem, poslední =
 * nejnovější dokončený. Počítají se jen sdílené úkoly (soukromý úkol u sdíleného obchodu by jinak prozradil partnerovi
 * termín), nezávisle na tom, kdo změnu způsobil. Chybí-li entita `deal` (modul není zapnutý) nebo obchod, nic se neděje.
 */
export async function refreshDealActivity(
  ctx: Ctx,
  registry: EntityRegistry,
  dealId: string,
  opts: { excludeTaskId?: string | null } = {},
): Promise<void> {
  if (!registry.get("deal")) return;
  const ex = opts.excludeTaskId;
  const shared = and(
    eq(task.dealId, dealId),
    isNull(task.deletedAt),
    eq(task.isPrivate, false),
    // úkol, který se právě maže (i s podúkoly), se už nepočítá
    ex ? and(ne(task.id, ex), or(isNull(task.parentId), ne(task.parentId, ex))) : undefined,
  );
  const [next] = await ctx.db
    .select({ id: task.id, dueDate: task.dueDate, dueTime: task.dueTime })
    .from(task)
    .where(and(shared, inArray(task.status, [...OPEN_STATUSES]), sql`${task.dueDate} is not null`))
    .orderBy(task.dueDate, sql`${task.dueTime} asc nulls last`, task.createdAt)
    .limit(1);
  const [last] = await ctx.db
    .select({ at: task.completedAt })
    .from(task)
    .where(and(shared, eq(task.status, "done"), sql`${task.completedAt} is not null`))
    .orderBy(desc(task.completedAt))
    .limit(1);
  try {
    await writeSystemFields(
      ctx,
      registry,
      "deal",
      dealId,
      {
        nextActivityAt: next ? dueInstant(next.dueDate!, normalizeTime(next.dueTime)) : null,
        lastActivityAt: last?.at ?? null,
        nextTaskId: next?.id ?? null,
      },
      { actorLabel: "Úkoly" },
    );
  } catch (e) {
    if (!(e instanceof NotFoundError)) throw e; // smazaný obchod aktivitu nezablokuje
  }
}

/** Přepočítá `last_activity_at` organizace: nejnovější dokončený sdílený úkol s vazbou na ni. */
export async function refreshCompanyActivity(
  ctx: Ctx,
  registry: EntityRegistry,
  companyId: string,
  opts: { excludeTaskId?: string | null } = {},
): Promise<void> {
  if (!registry.get("company")) return;
  const ex = opts.excludeTaskId;
  const [last] = await ctx.db
    .select({ at: task.completedAt })
    .from(task)
    .where(
      and(
        eq(task.companyId, companyId),
        isNull(task.deletedAt),
        eq(task.isPrivate, false),
        eq(task.status, "done"),
        sql`${task.completedAt} is not null`,
        ex ? and(ne(task.id, ex), or(isNull(task.parentId), ne(task.parentId, ex))) : undefined,
      ),
    )
    .orderBy(desc(task.completedAt))
    .limit(1);
  try {
    await writeSystemFields(
      ctx,
      registry,
      "company",
      companyId,
      { lastActivityAt: last?.at ?? null },
      { actorLabel: "Úkoly" },
    );
  } catch (e) {
    if (!(e instanceof NotFoundError)) throw e;
  }
}

const unique = (xs: (string | null | undefined)[]): string[] => [
  ...new Set(xs.filter((x): x is string => !!x)),
];

/**
 * Obsluha `task.changed` (vlastní událost modulu): po každé změně úkolu přepočítá systémová pole obchodů a organizací,
 * kterých se změna týká (před i po, kdyby se vazba přesunula). Běží v transakci změny.
 */
export const onTaskChanged: DomainEventHandler<"task.changed"> = async (ctx, event, deps) => {
  const { before, after, taskId } = event.data;
  const opts = { excludeTaskId: after === null ? taskId : null };
  for (const dealId of unique([before?.dealId, after?.dealId]))
    await refreshDealActivity(ctx, deps.registry, dealId, opts);
  for (const companyId of unique([before?.companyId, after?.companyId]))
    await refreshCompanyActivity(ctx, deps.registry, companyId, opts);
};

/** Změna zámku úkolu (zveřejnění, zamčení) mění, co se počítá do aktivity obchodu: přepočítá se. */
export const onVisibilityChanged: DomainEventHandler<"visibility.changed"> = async (
  ctx,
  event,
  deps,
) => {
  const { entityType, id } = event.data;
  // zámek obchodu nebo organizace se kaskádou přenese na jejich úkoly: přepočítá se, co z nich zůstává veřejné
  if (entityType === "deal") return refreshDealActivity(ctx, deps.registry, id);
  if (entityType === "company") return refreshCompanyActivity(ctx, deps.registry, id);
  if (entityType !== "task") return;
  const [row] = await ctx.db
    .select({ dealId: task.dealId, companyId: task.companyId })
    .from(task)
    .where(eq(task.id, id));
  if (!row) return;
  if (row.dealId) await refreshDealActivity(ctx, deps.registry, row.dealId);
  if (row.companyId) await refreshCompanyActivity(ctx, deps.registry, row.companyId);
};
