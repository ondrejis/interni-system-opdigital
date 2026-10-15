import { and, eq, inArray, isNull } from "drizzle-orm";
import { recordAudit } from "@rebar/core/audit";
import {
  canSeePrivate,
  createRecord,
  deleteRecord,
  resolveEntity,
  setVisibility,
  updateRecord,
  type ResolvedEntity,
} from "@rebar/core/entities";
import type { ModuleDeps } from "@rebar/core/module-server";
import { inTx, NotFoundError, PermissionError, UserError, type Ctx } from "@rebar/core/rbac";
import { todayIso } from "@rebar/core/time";
import { task, taskAttendee } from "../schema";
import type {
  CompleteTaskResult,
  CreateTaskInput,
  NextTaskSuggestion,
  ParsedQuickTask,
  QuickAddInput,
  QuickAddResult,
  TaskAttendee,
  TaskDto,
  TaskStatus,
  UpdateTaskInput,
} from "../contract";
import { CLOSED_STATUSES } from "./constants";
import { emitTaskTouched } from "./events";
import { readColumns } from "./external";
import { snoozeTarget, suggestNextDue } from "./logic/due";
import { parseQuickTask } from "./logic/quick-parse";
import { getTaskDto } from "./queries";
import { visibleTasks } from "./scope";
import { listTaskTypes } from "./types";

/*
  Zápis úkolů a aktivit. Vše jde přes engine entit (`createRecord`/`updateRecord`/`deleteRecord`): oprávnění, rozsah
  „jen moje“, soukromí (zámek, dědění), audit, hledání a háčky (`hooks.ts`: pravidla úkolu a doménové události) tak platí
  stejně pro příkaz, seznam i inline editaci. Tady jsou jen převody vstupu, odvození vazeb a složené akce.
*/

type Values = Record<string, unknown>;

const resolveTask = (ctx: Ctx, deps: ModuleDeps): Promise<ResolvedEntity> => {
  const def = deps.registry.get("task");
  if (!def) throw new Error("Entita „task“ není v registru.");
  return resolveEntity(ctx.db, def);
};

/** Vstup příkazu → hodnoty atributů entity `task` (jen zadaná pole, `null` hodnotu maže). */
function toValues(i: {
  title?: string | undefined;
  description?: string | null | undefined;
  typeKey?: string | undefined;
  status?: TaskStatus | undefined;
  priority?: string | undefined;
  assigneeId?: string | null | undefined;
  dueDate?: string | null | undefined;
  dueTime?: string | null | undefined;
  durationMin?: number | null | undefined;
  allDay?: boolean | undefined;
  place?: string | null | undefined;
  estimateMin?: number | null | undefined;
  outcome?: string | null | undefined;
  parentId?: string | null | undefined;
  dealId?: string | null | undefined;
  companyId?: string | null | undefined;
  personId?: string | null | undefined;
  jobId?: string | null | undefined;
  jobPhaseId?: string | null | undefined;
  tags?: string[] | undefined;
  sendInvites?: boolean | undefined;
  sourceTemplateTask?: string | undefined;
}): Values {
  const out: Values = {};
  const set = (k: string, v: unknown) => {
    if (v !== undefined) out[k] = v;
  };
  set("title", i.title);
  set("description", i.description);
  set("type", i.typeKey);
  set("status", i.status);
  set("priority", i.priority);
  set("assignee", i.assigneeId);
  set("dueDate", i.dueDate);
  set("dueTime", i.dueTime);
  set("durationMin", i.durationMin);
  set("allDay", i.allDay);
  set("place", i.place);
  set("estimateMin", i.estimateMin);
  set("outcome", i.outcome);
  set("parent", i.parentId);
  set("deal", i.dealId);
  set("company", i.companyId);
  set("person", i.personId);
  set("job", i.jobId);
  set("jobPhase", i.jobPhaseId);
  set("tags", i.tags);
  set("sendInvites", i.sendInvites);
  set("sourceTemplateTask", i.sourceTemplateTask);
  return out;
}

/**
 * Doplní vazby, které plynou z jiných: obchod → organizace a kontakt, zakázka → organizace (jen když nejsou zadané
 * výslovně). Úkol tak patří i na kartu organizace a obchod/zakázka se sám nemusí opakovat.
 */
export async function deriveLinks(
  ctx: Ctx,
  deps: ModuleDeps,
  i: {
    dealId?: string | null | undefined;
    jobId?: string | null | undefined;
    companyId?: string | null | undefined;
    personId?: string | null | undefined;
  },
): Promise<{ companyId?: string | null; personId?: string | null }> {
  const out: { companyId?: string | null; personId?: string | null } = {};
  if (i.dealId) {
    const deal = (
      await readColumns(ctx.db, deps.registry, "deal", [i.dealId], ["companyId", "personId"])
    ).get(i.dealId);
    if (i.companyId === undefined && deal?.companyId) out.companyId = deal.companyId as string;
    if (i.personId === undefined && deal?.personId) out.personId = deal.personId as string;
  }
  if (i.jobId && (i.companyId ?? out.companyId) === undefined) {
    const job = (await readColumns(ctx.db, deps.registry, "job", [i.jobId], ["companyId"])).get(
      i.jobId,
    );
    if (job?.companyId) out.companyId = job.companyId as string;
  }
  return out;
}

/** Nahradí účastníky úkolu (přidá nové, odebere chybějící) a dá kalendáři vědět. */
export async function writeAttendees(
  ctx: Ctx,
  taskId: string,
  attendees: readonly TaskAttendee[],
): Promise<void> {
  const existing = await ctx.db
    .select()
    .from(taskAttendee)
    .where(and(eq(taskAttendee.taskId, taskId), isNull(taskAttendee.deletedAt)));
  const key = (a: { kind: string; ref: string }) => `${a.kind}:${a.ref.toLowerCase()}`;
  const wanted = new Map(attendees.map((a) => [key(a), a]));
  const have = new Map(existing.map((a) => [key(a), a]));
  const remove = existing.filter((a) => !wanted.has(key(a)));
  const add = [...wanted.entries()].filter(([k]) => !have.has(k)).map(([, a]) => a);
  if (!remove.length && !add.length) return;
  if (remove.length)
    await ctx.db
      .update(taskAttendee)
      .set({ deletedAt: new Date(), updatedBy: ctx.actor.userId })
      .where(
        inArray(
          taskAttendee.id,
          remove.map((a) => a.id),
        ),
      );
  if (add.length)
    await ctx.db.insert(taskAttendee).values(
      add.map((a) => ({
        taskId,
        kind: a.kind,
        ref: a.kind === "email" ? a.ref.toLowerCase() : a.ref,
        createdBy: ctx.actor.userId,
        updatedBy: ctx.actor.userId,
      })),
    );
  const [row] = await ctx.db.select().from(task).where(eq(task.id, taskId));
  await recordAudit(ctx, {
    action: "update",
    entityType: "task",
    entityId: taskId,
    summary: row?.title ?? "",
    changes: [
      {
        field: "Účastníci",
        old: remove.map((a) => a.ref),
        new: add.map((a) => a.ref),
      },
    ],
  });
  if (row) await emitTaskTouched(ctx, row as unknown as Record<string, unknown>);
}

/* ---------- vytvoření ---------- */

/** Vstup založení úkolu s polem, které nesmí poslat klient (původ z šablony zakázky). */
export type CreateTaskInternal = CreateTaskInput & { sourceTemplateTask?: string };

/** Založí úkol a vrátí jeho id (bez sestavení DTO: pro hromadné zakládání ze šablony). */
export async function createTaskId(
  ctx: Ctx,
  deps: ModuleDeps,
  input: CreateTaskInternal,
): Promise<string> {
  return inTx(ctx, async (c) => {
    const derived = await deriveLinks(c, deps, input);
    const values = toValues({
      ...input,
      ...derived,
      ...(input.done === true ? { status: "done" as const } : {}),
    });
    if (input.isPrivate !== undefined) values.isPrivate = input.isPrivate;
    const { row } = await createRecord(c, deps.registry, await resolveTask(c, deps), values);
    if (input.attendees?.length) await writeAttendees(c, row.id, input.attendees);
    return row.id;
  });
}

/** Založí úkol nebo aktivitu (`ukoly.create`); `done` ji rovnou uzavře (zalogovaný hovor). */
export async function createTask(
  ctx: Ctx,
  deps: ModuleDeps,
  input: CreateTaskInput,
  now: Date = new Date(),
): Promise<TaskDto> {
  return inTx(ctx, async (c) => getTaskDto(c, deps, await createTaskId(c, deps, input), now));
}

/** Změní zadaná pole úkolu (`null` vazbu nebo hodnotu odebere). Stav, řešitel a viditelnost mají vlastní příkazy. */
export async function updateTask(
  ctx: Ctx,
  deps: ModuleDeps,
  input: UpdateTaskInput,
  now: Date = new Date(),
): Promise<TaskDto> {
  const { id, attendees, ...rest } = input;
  return inTx(ctx, async (c) => {
    const derived = await deriveLinks(c, deps, rest);
    const patch = toValues({ ...rest, ...derived });
    if (Object.keys(patch).length)
      await updateRecord(c, deps.registry, await resolveTask(c, deps), id, patch);
    else await getTaskDto(c, deps, id, now); // jen ověří přístup
    if (attendees) await writeAttendees(c, id, attendees);
    return getTaskDto(c, deps, id, now);
  });
}

/** Změní stav (K řešení, Probíhá, Hotovo, Zrušeno, znovuotevření) bez nabídky výsledku. */
export async function setTaskStatus(
  ctx: Ctx,
  deps: ModuleDeps,
  input: { id: string; status: TaskStatus },
  now: Date = new Date(),
): Promise<TaskDto> {
  return inTx(ctx, async (c) => {
    await updateRecord(c, deps.registry, await resolveTask(c, deps), input.id, {
      status: input.status,
    });
    return getTaskDto(c, deps, input.id, now);
  });
}

/* ---------- dokončení ---------- */

/** Je typ „aktivita“, po jejímž dokončení se nabízí výsledek a další krok (hovor, schůzka, vlastní typ v kalendáři)? */
const isActivityType = (t: { key: string; isSystem: boolean; isCalendarEvent: boolean }) =>
  t.key === "call" || t.key === "meeting" || (!t.isSystem && t.isCalendarEvent);

/** Návrh další aktivity: stejný typ, název a vazby, termín nejbližší pracovní den po dokončení ve stejnou hodinu. */
export function nextSuggestion(t: TaskDto, now: Date): NextTaskSuggestion {
  const due = suggestNextDue(t, now);
  return {
    typeKey: t.typeKey,
    title: t.title,
    dueDate: due.dueDate,
    dueTime: due.dueTime,
    durationMin: t.durationMin,
    priority: t.priority,
    assigneeId: t.assigneeId,
    dealId: t.deal?.id ?? null,
    companyId: t.company?.id ?? null,
    personId: t.person?.id ?? null,
    jobId: t.job?.id ?? null,
    jobPhaseId: t.jobPhaseId,
  };
}

/**
 * Dokončí úkol (volitelně s výsledkem). U hovoru a schůzky vrátí jen **nabídku** zapsat výsledek a naplánovat další
 * aktivitu (UKO-07): nic dalšího se nevytvoří, dokud ho uživatel výslovně nepošle v `next`.
 */
export async function completeTask(
  ctx: Ctx,
  deps: ModuleDeps,
  input: {
    id: string;
    outcome?: string | null | undefined;
    next?: CreateTaskInput | null | undefined;
  },
  now: Date = new Date(),
): Promise<CompleteTaskResult> {
  return inTx(ctx, async (c) => {
    const before = await getTaskDto(c, deps, input.id, now);
    const patch: Values = {};
    if (before.status !== "done") patch.status = "done";
    if (input.outcome !== undefined && input.outcome !== before.outcome)
      patch.outcome = input.outcome;
    if (Object.keys(patch).length)
      await updateRecord(c, deps.registry, await resolveTask(c, deps), input.id, patch);
    const done = await getTaskDto(c, deps, input.id, now);
    const types = await listTaskTypes(c.db);
    const type = types.find((t) => t.key === done.typeKey);
    const offer =
      type && isActivityType(type)
        ? { outcome: !done.outcome, next: nextSuggestion(done, now) }
        : { outcome: false, next: null };
    const next = input.next ? await createTask(c, deps, input.next, now) : null;
    return { task: done, offer, next };
  });
}

/* ---------- termín, řešitel, smazání ---------- */

/** Nový termín (datum, čas, délka), nebo odložení o dny od dneška se stejnou hodinou. Hotový úkol se nepřeplánovává. */
export async function rescheduleTask(
  ctx: Ctx,
  deps: ModuleDeps,
  input: {
    id: string;
    dueDate?: string | undefined;
    dueTime?: string | null | undefined;
    durationMin?: number | null | undefined;
    allDay?: boolean | undefined;
    days?: number | undefined;
  },
  now: Date = new Date(),
): Promise<TaskDto> {
  return inTx(ctx, async (c) => {
    const before = await getTaskDto(c, deps, input.id, now);
    if ((CLOSED_STATUSES as readonly string[]).includes(before.status))
      throw new UserError("Hotový nebo zrušený úkol nejde přeplánovat, nejdřív ho znovu otevřete.");
    const patch: Values = {};
    if (input.days !== undefined && input.dueDate === undefined) {
      const t = snoozeTarget(before, input.days, now);
      patch.dueDate = t.dueDate;
      if (input.dueTime !== undefined) patch.dueTime = input.dueTime;
    } else {
      patch.dueDate = input.dueDate;
      if (input.dueTime !== undefined) patch.dueTime = input.dueTime;
    }
    if (input.durationMin !== undefined) patch.durationMin = input.durationMin;
    if (input.allDay !== undefined) patch.allDay = input.allDay;
    await updateRecord(c, deps.registry, await resolveTask(c, deps), input.id, patch);
    return getTaskDto(c, deps, input.id, now);
  });
}

/** Přiřadí řešitele; soukromý úkol nejde přiřadit uživateli bez práva na soukromé (`PrivateAssignmentError`, VID-06). */
export async function assignTask(
  ctx: Ctx,
  deps: ModuleDeps,
  input: { id: string; assigneeId: string | null },
  now: Date = new Date(),
): Promise<TaskDto> {
  return inTx(ctx, async (c) => {
    await updateRecord(c, deps.registry, await resolveTask(c, deps), input.id, {
      assignee: input.assigneeId,
    });
    return getTaskDto(c, deps, input.id, now);
  });
}

/** „Zveřejnit a přiřadit“ (VID-06): vlastník zveřejní soukromý úkol a přiřadí ho. Nadřazený soukromý záznam to zablokuje. */
export async function publishAndAssign(
  ctx: Ctx,
  deps: ModuleDeps,
  input: { id: string; assigneeId: string },
  now: Date = new Date(),
): Promise<TaskDto> {
  if (!canSeePrivate(ctx)) throw new PermissionError("Zveřejnit soukromý úkol smí jen vlastník.");
  return inTx(ctx, async (c) => {
    await setVisibility(c, deps.registry, "task", input.id, false);
    return assignTask(c, deps, input, now);
  });
}

/** Smaže úkol do koše (i s podúkoly, obnova vrátí celou dávku). */
export async function deleteTask(ctx: Ctx, deps: ModuleDeps, id: string): Promise<void> {
  await deleteRecord(ctx, await resolveTask(ctx, deps), id);
}

/** Nahradí účastníky úkolu (schůzky). */
export async function setAttendees(
  ctx: Ctx,
  deps: ModuleDeps,
  input: { id: string; attendees: TaskAttendee[] },
  now: Date = new Date(),
): Promise<TaskDto> {
  return inTx(ctx, async (c) => {
    const [row] = await c.db
      .select({ id: task.id })
      .from(task)
      .where(and(eq(task.id, input.id), visibleTasks(c)));
    if (!row) throw new NotFoundError("Úkol nenalezen.");
    // oprávnění k zápisu ověří engine na prázdné změně: změníme `updatedAt` přes `sendInvites` beze změny hodnoty
    const dto = await getTaskDto(c, deps, input.id, now);
    await updateRecord(c, deps.registry, await resolveTask(c, deps), input.id, {
      sendInvites: dto.sendInvites,
    });
    await writeAttendees(c, input.id, input.attendees);
    return getTaskDto(c, deps, input.id, now);
  });
}

/* ---------- rychlé zadání ---------- */

/** Náhled rozpoznání rychlého zadání proti typům z nastavení (bez uložení). */
export async function parseQuick(
  ctx: Ctx,
  _deps: ModuleDeps,
  text: string,
  now: Date = new Date(),
): Promise<ParsedQuickTask> {
  const types = await listTaskTypes(ctx.db);
  const parsed = parseQuickTask(text, now, types);
  const t = types.find((x) => x.key === parsed.typeKey) ?? types[0];
  return {
    ...parsed,
    type: {
      key: t?.key ?? parsed.typeKey,
      name: t?.name ?? parsed.typeKey,
      icon: t?.icon ?? null,
      color: t?.color ?? null,
      isCalendarEvent: t?.isCalendarEvent ?? false,
    },
    needsTitle: parsed.title.length === 0,
  };
}

/**
 * Rychlé přidání z jednoho řádku: rozbor („zavolat Novákovi zítra 10:00“ = Hovor zítra 10:00), výslovné hodnoty
 * z náhledu rozpoznání přebijí rozpoznané, zbytek jde přes `createTask`.
 */
export async function quickAdd(
  ctx: Ctx,
  deps: ModuleDeps,
  input: QuickAddInput,
  now: Date = new Date(),
): Promise<QuickAddResult> {
  const types = await listTaskTypes(ctx.db);
  const parsed = parseQuickTask(input.text, now, types);
  const o = input.override ?? {};
  const title = o.title ?? parsed.title;
  if (!title) throw new UserError("Napište, co je potřeba udělat (zbylo jen datum a čas).");
  const dueDate = o.dueDate !== undefined ? o.dueDate : parsed.dueDate;
  const created = await createTask(
    ctx,
    deps,
    {
      title,
      typeKey: o.typeKey ?? parsed.typeKey,
      dueDate,
      dueTime: dueDate ? (o.dueTime !== undefined ? o.dueTime : parsed.dueTime) : null,
      durationMin: o.durationMin !== undefined ? o.durationMin : parsed.durationMin,
      priority: o.priority ?? parsed.priority,
      ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
      ...(input.isPrivate !== undefined ? { isPrivate: input.isPrivate } : {}),
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
      ...(input.dealId !== undefined ? { dealId: input.dealId } : {}),
      ...(input.companyId !== undefined ? { companyId: input.companyId } : {}),
      ...(input.personId !== undefined ? { personId: input.personId } : {}),
      ...(input.jobId !== undefined ? { jobId: input.jobId } : {}),
      ...(input.jobPhaseId !== undefined ? { jobPhaseId: input.jobPhaseId } : {}),
    },
    now,
  );
  return { task: created, parsed };
}

/** Dnešní datum v Praze (pomůcka služeb a testů). */
export const today = (now: Date = new Date()) => todayIso("Europe/Prague", now);
