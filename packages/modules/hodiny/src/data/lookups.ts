import { getTableColumns, inArray } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { NotImplementedError, type ServiceMap } from "@rebar/core/contracts";
import { schema } from "@rebar/core/db";
import {
  aggregateRecords,
  getRecord,
  resolveEntity,
  visibleRecordTitles,
} from "@rebar/core/entities";
import type { ModuleDeps } from "@rebar/core/module-server";
import { NotFoundError, UserError, can, scopeOf, type Ctx } from "@rebar/core/rbac";
import type { JobRef } from "../contract";

/*
  Čtení cizích modulů bez importu jejich kódu: zakázky a úkoly přes registr entit (oprávnění, rozsah „jen moje“ a zámek
  hlídá engine), odhad úkolů ze služby `tasks` a podíly na příjmech ze služby `finance` (obojí volitelné, D §2.3).
*/

type Cols = Record<string, AnyPgColumn>;

/**
 * Zakázky podle id, které aktér smí vidět (ostatní se vynechají). Popisky: číslo, název, stav a zámek. Modul Zakázky
 * není zapnutý ⇒ prázdná mapa.
 */
export async function jobRefs(
  ctx: Ctx,
  deps: ModuleDeps,
  ids: readonly string[],
): Promise<Map<string, JobRef>> {
  const out = new Map<string, JobRef>();
  const def = deps.registry.get("job");
  if (!def || !ids.length) return out;
  const titles = await visibleRecordTitles(ctx, deps.registry, "job", [...new Set(ids)]);
  const visible = Object.keys(titles);
  if (!visible.length) return out;
  const cols = getTableColumns(def.table) as Cols;
  const rows = await ctx.db
    .select({
      id: cols.id!,
      number: cols.number ?? cols.id!,
      status: cols.status ?? cols.id!,
      isPrivate: cols.isPrivate ?? cols.id!,
    })
    .from(def.table)
    .where(inArray(cols.id!, visible));
  for (const r of rows) {
    const id = String(r.id);
    out.set(id, {
      id,
      number: cols.number ? String(r.number) : null,
      title: titles[id] ?? "Zakázka",
      status: cols.status ? String(r.status) : null,
      isPrivate: cols.isPrivate ? r.isPrivate === true : false,
    });
  }
  return out;
}

/** Jedna zakázka, kterou aktér smí vidět; jinak `NotFoundError` (neexistující i cizí se tváří stejně). */
export async function loadJob(ctx: Ctx, deps: ModuleDeps, id: string): Promise<JobRef> {
  const job = (await jobRefs(ctx, deps, [id])).get(id);
  if (!job) throw new NotFoundError("Zakázka nenalezena.");
  return job;
}

/** Co o úkolu potřebují hodiny: název, zakázka a odhad. */
export type TaskInfo = {
  id: string;
  title: string;
  jobId: string | null;
  estimateMin: number | null;
};

/** Úkol, který aktér smí vidět (přes registr entit); bez modulu Úkoly nebo bez přístupu `NotFoundError`. */
export async function loadTask(ctx: Ctx, deps: ModuleDeps, id: string): Promise<TaskInfo> {
  const def = deps.registry.get("task");
  if (!def) throw new UserError("Modul Úkoly není zapnutý, čas jde zapsat jen k zakázce.");
  const { row } = await getRecord(ctx, deps.registry, await resolveEntity(ctx.db, def), id);
  return {
    id,
    title: String(row.title ?? "Úkol"),
    jobId: typeof row.job === "string" ? row.job : null,
    estimateMin: typeof row.estimateMin === "number" ? row.estimateMin : null,
  };
}

/** Názvy úkolů podle id, jen těch, které aktér smí vidět. */
export async function taskTitles(
  ctx: Ctx,
  deps: ModuleDeps,
  ids: readonly string[],
): Promise<Record<string, string>> {
  const unique = [...new Set(ids)];
  return unique.length ? visibleRecordTitles(ctx, deps.registry, "task", unique) : {};
}

/** Jména lidí (zkratka, jinak celé jméno) podle id uživatelů. */
export async function userNames(ctx: Ctx, ids: readonly string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return {};
  const rows = await ctx.db
    .select({ id: schema.user.id, name: schema.user.name })
    .from(schema.user)
    .where(inArray(schema.user.id, unique));
  return Object.fromEntries(rows.map((r) => [r.id, r.name]));
}

/**
 * Rozšíření služby `tasks`, o které žádá modul Hodiny (kontrakt `ServiceMap` je zmrazený; žádost je v
 * `docs/opsys/ZADOSTI.md`): součet odhadů úkolů zakázky. Dokud ho služba nenabízí, čte se odhad přes registr entit.
 */
export type TasksEstimateExtension = {
  estimateByJob(ctx: Ctx, jobId: string): Promise<{ estimateMin: number; tasks: number }>;
};

/**
 * Součet odhadů úkolů zakázky (bez zrušených) v minutách a počet úkolů v součtu. `null`, když modul Úkoly není zapnutý
 * nebo na úkoly aktér nemá oprávnění. Úkoly bez odhadu přispívají nulou.
 */
export async function estimateOf(
  ctx: Ctx,
  deps: ModuleDeps,
  jobId: string,
): Promise<{ estimateMin: number; tasks: number } | null> {
  const service = deps.services.optional("tasks") as
    (ServiceMap["tasks"] & Partial<TasksEstimateExtension>) | undefined;
  try {
    if (service?.estimateByJob) return await service.estimateByJob(ctx, jobId);
    const def = deps.registry.get("task");
    if (!def || !scopeOf(ctx, def.permissions.read)) return null;
    const result = await aggregateRecords(ctx, deps.registry, await resolveEntity(ctx.db, def), {
      fn: "sum",
      attr: "estimateMin",
      equals: [{ attr: "job", value: jobId }],
      filters: { op: "and", conditions: [{ attr: "status", op: "is_not", value: "canceled" }] },
    });
    return { estimateMin: Math.round(result.total.value ?? 0), tasks: result.total.count };
  } catch (e) {
    if (e instanceof NotImplementedError) return null;
    throw e;
  }
}

/**
 * Podíl každého člověka na příjmech zakázky v haléřích (`finance.allocatedByUser`), nebo `null`, když modul Finance
 * není zapnutý, ještě není hotový, nebo aktér nesmí vidět peníze (`finance.read`).
 */
export async function incomeByUser(
  ctx: Ctx,
  deps: ModuleDeps,
  jobId: string,
): Promise<Record<string, number> | null> {
  if (!can(ctx, "finance.read")) return null;
  const finance = deps.services.optional("finance");
  if (!finance) return null;
  try {
    return await finance.allocatedByUser(ctx, jobId);
  } catch (e) {
    if (e instanceof NotImplementedError) return null;
    throw e;
  }
}
