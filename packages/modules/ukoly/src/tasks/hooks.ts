import { and, count, eq, isNull } from "drizzle-orm";
import { assertAssignable } from "@rebar/core/entities";
import type { EntityDef } from "@rebar/core/entities";
import { UserError, type Ctx } from "@rebar/core/rbac";
import { task, taskType } from "../schema";
import { CLOSED_STATUSES, SYSTEM_TYPE_KEYS } from "./constants";
import { emitTaskCreated, emitTaskDeleted, emitTaskUpdated } from "./events";

/*
  Háčky entity `task` a `task_type` (engine je volá při každém zápisu, ať jde o příkaz modulu, seznam nebo
  inline editaci): pravidla úkolu (podúkol jen o jedné úrovni, čas jen s datem, dokončení), kontrola soukromí
  řešitele a doménové události (`task.created`, `task.completed`, `task.changed`). Všechny běží v transakci zápisu.
*/

type Raw = Record<string, unknown>;
const isClosed = (s: unknown) => (CLOSED_STATUSES as readonly string[]).includes(String(s));

/** Typ úkolu musí existovat (nesmazaný). */
export async function assertTypeExists(ctx: Ctx, key: string): Promise<void> {
  const [t] = await ctx.db
    .select({ id: taskType.id })
    .from(taskType)
    .where(and(eq(taskType.key, key), isNull(taskType.deletedAt)));
  if (!t) throw new UserError("Typ úkolu neexistuje.");
}

/** Rodič podúkolu: musí existovat a nesmí být sám podúkolem (jedna úroveň, UKO-03). */
async function loadParent(ctx: Ctx, parentId: string): Promise<Raw> {
  const [p] = await ctx.db
    .select()
    .from(task)
    .where(and(eq(task.id, parentId), isNull(task.deletedAt)));
  if (!p) throw new UserError("Nadřazený úkol neexistuje.");
  if (p.parentId) throw new UserError("Podúkol může mít jen jednu úroveň.");
  return p as Raw;
}

const LINK_KEYS = [
  ["deal", "dealId"],
  ["company", "companyId"],
  ["person", "personId"],
  ["job", "jobId"],
  ["jobPhase", "jobPhaseId"],
] as const;

/** Před založením: výchozí typ, řešitel a vazby od nadřazeného úkolu, čas jen s datem. Hodnoty jsou pod klíči atributů. */
export async function taskBeforeCreate(ctx: Ctx, values: Raw): Promise<Raw> {
  const out: Raw = { ...values };
  const typeKey = (out.type as string | undefined) ?? "task";
  await assertTypeExists(ctx, typeKey);
  out.type = typeKey;
  if (out.assignee === undefined && ctx.actor.userId) out.assignee = ctx.actor.userId;
  if (typeof out.parent === "string") {
    const parent = await loadParent(ctx, out.parent);
    for (const [attr, col] of LINK_KEYS) if (!out[attr]) out[attr] = parent[col] ?? null;
  }
  if (!out.dueDate) {
    out.dueTime = null;
    out.allDay = false;
  } else if (out.allDay === true) out.dueTime = null;
  return out;
}

/** Po založení: dokončený úkol má čas dokončení, soukromý úkol nejde přiřadit tomu, kdo soukromé nevidí, události. */
export async function taskAfterCreate(ctx: Ctx, created: Raw): Promise<void> {
  if (isClosed(created.status) && !created.completedAt) {
    const at = new Date();
    await ctx.db
      .update(task)
      .set({ completedAt: at })
      .where(eq(task.id, String(created.id)));
    created.completedAt = at;
  }
  const assignee = created.assigneeId as string | null;
  if (created.isPrivate === true && assignee && assignee !== ctx.actor.userId)
    await assertAssignable(ctx, "task", String(created.id), assignee);
  await emitTaskCreated(ctx, created);
}

/** Před změnou: kontroly a odvozená pole (čas dokončení, odebrání času s datem, jedna úroveň podúkolů, soukromí řešitele). */
export async function taskBeforeUpdate(ctx: Ctx, before: Raw, changes: Raw): Promise<Raw | void> {
  const extra: Raw = {};
  if (typeof changes.typeKey === "string" && changes.typeKey !== before.typeKey)
    await assertTypeExists(ctx, changes.typeKey);

  if ("parentId" in changes && changes.parentId) {
    const parentId = String(changes.parentId);
    if (parentId === before.id) throw new UserError("Úkol nemůže být podúkolem sám sebe.");
    await loadParent(ctx, parentId);
    const [kids] = await ctx.db
      .select({ n: count() })
      .from(task)
      .where(and(eq(task.parentId, String(before.id)), isNull(task.deletedAt)));
    if ((kids?.n ?? 0) > 0)
      throw new UserError("Úkol, který má podúkoly, nemůže být sám podúkolem (jedna úroveň).");
  }

  if ("status" in changes && changes.status !== before.status) {
    if (isClosed(changes.status)) extra.completedAt = new Date();
    else extra.completedAt = null;
  }

  const dueDate = "dueDate" in changes ? changes.dueDate : before.dueDate;
  const allDay = "allDay" in changes ? changes.allDay : before.allDay;
  if (!dueDate) {
    if (changes.dueTime) throw new UserError("Čas lze zadat jen spolu s datem.");
    extra.dueTime = null;
    extra.allDay = false;
  } else if (allDay === true) extra.dueTime = null;

  const newAssignee = "assigneeId" in changes ? (changes.assigneeId as string | null) : null;
  if (newAssignee && newAssignee !== before.assigneeId && newAssignee !== ctx.actor.userId)
    if (before.isPrivate === true)
      await assertAssignable(ctx, "task", String(before.id), newAssignee);

  return extra;
}

/** Po změně: události podle toho, co se změnilo. */
export async function taskAfterUpdate(ctx: Ctx, before: Raw, after: Raw): Promise<void> {
  await emitTaskUpdated(ctx, before, after);
}

/** Před smazáním: kalendář a aktivity obchodu se dozvědí, že úkol (i s podúkoly) zmizí. */
export async function taskBeforeDelete(ctx: Ctx, raw: Raw): Promise<void> {
  await emitTaskDeleted(ctx, raw);
}

/* ---------- typ úkolu ---------- */

/** Klíč typu se po založení nemění (úkoly ho používají jako odkaz). */
export async function typeBeforeUpdate(_ctx: Ctx, before: Raw, changes: Raw): Promise<Raw | void> {
  if ("key" in changes && changes.key !== before.key)
    throw new UserError("Klíč typu se po založení nemění.");
}

/** Systémový typ ani typ, který úkoly používají, se nesmaže. */
export async function typeBeforeDelete(ctx: Ctx, raw: Raw): Promise<void> {
  if (raw.isSystem === true || (SYSTEM_TYPE_KEYS as readonly string[]).includes(String(raw.key)))
    throw new UserError(`Typ „${String(raw.name)}“ je systémový a nejde smazat.`);
  const [used] = await ctx.db
    .select({ n: count() })
    .from(task)
    .where(and(eq(task.typeKey, String(raw.key)), isNull(task.deletedAt)));
  if ((used?.n ?? 0) > 0)
    throw new UserError(
      `Typ „${String(raw.name)}“ používá ${used!.n} úkolů. Nejdřív jim změňte typ.`,
    );
}

/** Pro odkazy z entit: typ definice (zabrání cyklickému importu při skládání entit). */
export type TaskEntityHooks = Pick<
  EntityDef,
  "beforeCreate" | "afterCreate" | "beforeUpdate" | "afterUpdate" | "beforeDelete"
>;

/** Háčky entity `task`. */
export const taskHooks: TaskEntityHooks = {
  beforeCreate: taskBeforeCreate,
  afterCreate: taskAfterCreate,
  beforeUpdate: taskBeforeUpdate,
  afterUpdate: taskAfterUpdate,
  beforeDelete: taskBeforeDelete,
};

/** Háčky entity `task_type`. */
export const typeHooks: Pick<EntityDef, "beforeUpdate" | "beforeDelete"> = {
  beforeUpdate: typeBeforeUpdate,
  beforeDelete: typeBeforeDelete,
};
