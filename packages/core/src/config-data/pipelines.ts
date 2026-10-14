import { and, asc, eq, getTableColumns, isNull, sql } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import { recordAudit } from "../audit/audit";
import { schema, type Executor } from "../db/client";
import { inTx } from "../rbac/context";
import { NotFoundError, UserError } from "../rbac/errors";
import { assertCan } from "../rbac/permissions";
import type { Ctx } from "../rbac/types";

export type StageKind = "open" | "won" | "lost" | "done";
export type StageDef = {
  name: string;
  color?: string;
  kind?: StageKind;
  /** Fáze životního cyklu (zakázky); `null` = stav bez fáze. */
  phase?: string | null;
  /** Pravděpodobnost výhry ve stavu v procentech (0–100), `null` = nezadáno (CRM váží hodnotu zakázky). */
  probabilityPct?: number | null;
  /** Počet dnů bez aktivity, po kterých záznam ve stavu „hnije“; `null` = nehlídá se. */
  rottingDays?: number | null;
};
export type PipelineDef = {
  entityType: string;
  key: string;
  name: string;
  stages: readonly StageDef[];
};

/** Počet záznamů, které stav používají. Modul ho registruje, aby šlo používaný stav chránit před smazáním. */
type UsageCheck = (db: Executor, stageId: string) => Promise<number>;
const g = globalThis as { __stageUsage?: Map<string, UsageCheck> }; // globálně: Next bundluje route handlery zvlášť
const usage = (g.__stageUsage ??= new Map<string, UsageCheck>());
export function registerStageUsage(entityType: string, check: UsageCheck) {
  usage.set(entityType, check);
}

/**
 * Pevné fáze, do kterých musí patřit stavy pipeline (zakázky: `inquiry`…`paused`). Modul je zaregistruje při
 * sestavení; správa stavů pak nedovolí, aby nějaká fáze zůstala bez stavu nebo aby stav dostal neznámou fázi.
 */
export type PipelinePhase = { key: string; label: string };
const gp = globalThis as { __pipelinePhases?: Map<string, readonly PipelinePhase[]> };
const phaseRegistry = (gp.__pipelinePhases ??= new Map<string, readonly PipelinePhase[]>());
export function setPipelinePhases(entityType: string, phases: readonly PipelinePhase[]) {
  phaseRegistry.set(entityType, phases);
}
export function getPipelinePhases(entityType: string): readonly PipelinePhase[] {
  return phaseRegistry.get(entityType) ?? [];
}

/** Každá z registrovaných fází musí mít aspoň jeden aktivní stav; jinak zakázku nešlo do fáze přesunout. */
function assertPhasesCovered(
  entityType: string,
  stages: readonly { name: string; phase: string | null }[],
) {
  const phases = getPipelinePhases(entityType);
  for (const p of phases) {
    if (!stages.some((s) => s.phase === p.key))
      throw new UserError(
        `Fáze „${p.label}“ musí mít aspoň jeden stav. Nejdřív jiný stav přiřaďte do této fáze.`,
      );
  }
}

/** Pravděpodobnost (0–100 %) a dny hnití (1–365) jsou celá čísla; `null` a `undefined` znamenají „nezadáno“. */
function assertStageNumbers(def: Pick<StageDef, "probabilityPct" | "rottingDays">) {
  const { probabilityPct: p, rottingDays: r } = def;
  if (p != null && !(Number.isInteger(p) && p >= 0 && p <= 100))
    throw new UserError("Pravděpodobnost musí být celé číslo od 0 do 100 %.");
  if (r != null && !(Number.isInteger(r) && r >= 1 && r <= 365))
    throw new UserError("Počet dnů do hnití musí být celé číslo od 1 do 365.");
}

function assertKnownPhase(entityType: string, phase: string | null | undefined) {
  const phases = getPipelinePhases(entityType);
  if (!phase || !phases.length) return;
  if (!phases.some((p) => p.key === phase)) throw new UserError("Neznámá fáze stavu.");
}

/** Stavy pipeline, které se mají kontrolovat po změně (aktivní, v pořadí). */
async function activeStages(db: Executor, pipelineId: string) {
  return db
    .select()
    .from(schema.pipelineStage)
    .where(
      and(eq(schema.pipelineStage.pipelineId, pipelineId), isNull(schema.pipelineStage.deletedAt)),
    )
    .orderBy(asc(schema.pipelineStage.position));
}

/**
 * Zaregistruje počítání použití stavů z popisů entit: každý atribut typu `status` s pipeline se spočítá
 * jako počet nesmazaných záznamů s tímto stavem. Moduly tak nemusí registrovat nic ručně.
 */
export function registerStageUsageFromEntities(
  defs: readonly {
    table: unknown;
    attributes: readonly {
      type: string;
      field?: string;
      pipeline?: { entityType: string; key: string };
    }[];
  }[],
) {
  const byPipeline = new Map<string, { table: PgTable; field: string }[]>();
  for (const d of defs) {
    const cols = getTableColumns(d.table as PgTable) as Record<string, AnyPgColumn>;
    for (const a of d.attributes) {
      if (a.type !== "status" || !a.pipeline || !a.field || !cols[a.field]) continue;
      const list = byPipeline.get(a.pipeline.entityType) ?? [];
      list.push({ table: d.table as PgTable, field: a.field });
      byPipeline.set(a.pipeline.entityType, list);
    }
  }
  for (const [entityType, targets] of byPipeline) {
    registerStageUsage(entityType, async (db, stageId) => {
      let total = 0;
      for (const t of targets) {
        const cols = getTableColumns(t.table) as Record<string, AnyPgColumn>;
        const where = cols.deletedAt
          ? and(eq(cols[t.field]!, stageId), isNull(cols.deletedAt))
          : eq(cols[t.field]!, stageId);
        const [row] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(t.table)
          .where(where);
        total += row?.n ?? 0;
      }
      return total;
    });
  }
}

/** Počet záznamů, které stav používají (0, když pro typ není nic zaregistrováno). */
export async function stageUsageCount(db: Executor, entityType: string, stageId: string) {
  return (await usage.get(entityType)?.(db, stageId)) ?? 0;
}

/** Všechny pipeline se stavy a počtem použití každého stavu (pro správu v administraci). */
export async function listPipelines(db: Executor) {
  const pipelines = await db
    .select()
    .from(schema.pipeline)
    .where(isNull(schema.pipeline.deletedAt))
    .orderBy(asc(schema.pipeline.name));
  const out = [];
  for (const p of pipelines) {
    const stages = await activeStages(db, p.id);
    out.push({
      ...p,
      stages: await Promise.all(
        stages.map(async (s) => ({ ...s, usage: await stageUsageCount(db, p.entityType, s.id) })),
      ),
    });
  }
  return out;
}

const plural = (n: number) =>
  n === 1 ? "1 záznam" : n >= 2 && n <= 4 ? `${n} záznamy` : `${n} záznamů`;

/** Založí pipeline z výchozí definice, pokud ještě neexistuje (seed klienta). Existující nemění. */
export async function ensurePipeline(executor: Executor, def: PipelineDef): Promise<string> {
  // advisory zámek: souběžný seed (např. dva procesy nebo testy) nesmí pipeline založit dvakrát
  return executor.transaction(async (db) => {
    await db.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`pipeline:${def.entityType}:${def.key}`}))`,
    );
    return createPipeline(db, def);
  });
}

async function createPipeline(db: Executor, def: PipelineDef): Promise<string> {
  const [existing] = await db
    .select({ id: schema.pipeline.id })
    .from(schema.pipeline)
    .where(
      and(
        eq(schema.pipeline.entityType, def.entityType),
        eq(schema.pipeline.key, def.key),
        isNull(schema.pipeline.deletedAt),
      ),
    );
  if (existing) return existing.id;
  const [p] = await db
    .insert(schema.pipeline)
    .values({ entityType: def.entityType, key: def.key, name: def.name })
    .returning({ id: schema.pipeline.id });
  await db.insert(schema.pipelineStage).values(
    def.stages.map((s, i) => ({
      pipelineId: p!.id,
      name: s.name,
      color: s.color ?? "gray",
      kind: s.kind ?? "open",
      phase: s.phase ?? null,
      probabilityPct: s.probabilityPct ?? null,
      rottingDays: s.rottingDays ?? null,
      position: i,
    })),
  );
  return p!.id;
}

/** Pipeline se stavy v pořadí. */
export async function getPipeline(db: Executor, entityType: string, key: string) {
  const [p] = await db
    .select()
    .from(schema.pipeline)
    .where(
      and(
        eq(schema.pipeline.entityType, entityType),
        eq(schema.pipeline.key, key),
        isNull(schema.pipeline.deletedAt),
      ),
    );
  if (!p) return null;
  const stages = await db
    .select()
    .from(schema.pipelineStage)
    .where(and(eq(schema.pipelineStage.pipelineId, p.id), isNull(schema.pipelineStage.deletedAt)))
    .orderBy(asc(schema.pipelineStage.position));
  return { ...p, stages };
}

export async function addStage(ctx: Ctx, pipelineId: string, def: StageDef) {
  assertCan(ctx, "settings.manage");
  if (!def.name.trim()) throw new UserError("Vyplňte název stavu.");
  return inTx(ctx, async (c) => {
    const [pl] = await c.db
      .select({ entityType: schema.pipeline.entityType })
      .from(schema.pipeline)
      .where(and(eq(schema.pipeline.id, pipelineId), isNull(schema.pipeline.deletedAt)));
    if (!pl) throw new NotFoundError("Pipeline nenalezena.");
    assertKnownPhase(pl.entityType, def.phase);
    assertStageNumbers(def);
    const dup = (await activeStages(c.db, pipelineId)).some(
      (s) => s.name.trim().toLowerCase() === def.name.trim().toLowerCase(),
    );
    if (dup) throw new UserError("Stav s tímto názvem už existuje.");
    const [max] = await c.db
      .select({ m: sql<number>`coalesce(max(${schema.pipelineStage.position}), -1)::int` })
      .from(schema.pipelineStage)
      .where(
        and(
          eq(schema.pipelineStage.pipelineId, pipelineId),
          isNull(schema.pipelineStage.deletedAt),
        ),
      );
    const [row] = await c.db
      .insert(schema.pipelineStage)
      .values({
        pipelineId,
        name: def.name.trim(),
        color: def.color ?? "gray",
        kind: def.kind ?? "open",
        phase: def.phase ?? null,
        probabilityPct: def.probabilityPct ?? null,
        rottingDays: def.rottingDays ?? null,
        position: (max?.m ?? -1) + 1,
        createdBy: c.actor.userId,
        updatedBy: c.actor.userId,
      })
      .returning();
    await recordAudit(c, {
      action: "create",
      entityType: "pipeline_stage",
      entityId: row!.id,
      summary: `Nový stav „${row!.name}“`,
      changes: [{ field: "name", old: null, new: row!.name }],
    });
    return row!;
  });
}

export async function updateStage(ctx: Ctx, stageId: string, patch: Partial<StageDef>) {
  assertCan(ctx, "settings.manage");
  await inTx(ctx, async (c) => {
    const [before] = await c.db
      .select()
      .from(schema.pipelineStage)
      .where(and(eq(schema.pipelineStage.id, stageId), isNull(schema.pipelineStage.deletedAt)));
    if (!before) throw new NotFoundError("Stav nenalezen.");
    const [pl] = await c.db
      .select({ entityType: schema.pipeline.entityType })
      .from(schema.pipeline)
      .where(eq(schema.pipeline.id, before.pipelineId));
    const entityType = pl?.entityType ?? "";
    if (patch.name !== undefined && !patch.name.trim()) throw new UserError("Vyplňte název stavu.");
    assertKnownPhase(entityType, patch.phase);
    assertStageNumbers(patch);
    if (patch.name !== undefined) {
      const dup = (await activeStages(c.db, before.pipelineId)).some(
        (s) => s.id !== stageId && s.name.trim().toLowerCase() === patch.name!.trim().toLowerCase(),
      );
      if (dup) throw new UserError("Stav s tímto názvem už existuje.");
    }
    const after = {
      name: patch.name?.trim() || before.name,
      color: patch.color ?? before.color,
      kind: patch.kind ?? before.kind,
      phase: patch.phase === undefined ? before.phase : patch.phase,
      probabilityPct:
        patch.probabilityPct === undefined ? before.probabilityPct : patch.probabilityPct,
      rottingDays: patch.rottingDays === undefined ? before.rottingDays : patch.rottingDays,
    };
    await c.db
      .update(schema.pipelineStage)
      .set({ ...after, updatedBy: c.actor.userId })
      .where(eq(schema.pipelineStage.id, stageId));
    if (after.phase !== before.phase)
      assertPhasesCovered(entityType, await activeStages(c.db, before.pipelineId));
    const changes = (["name", "color", "kind", "phase", "probabilityPct", "rottingDays"] as const)
      .filter((f) => after[f] !== before[f])
      .map((f) => ({ field: f, old: before[f], new: after[f] }));
    if (changes.length)
      await recordAudit(c, {
        action: "update",
        entityType: "pipeline_stage",
        entityId: stageId,
        changes,
      });
  });
}

/** Přeuspořádá stavy; `orderedIds` musí obsahovat všechny stavy pipeline právě jednou. */
export async function reorderStages(ctx: Ctx, pipelineId: string, orderedIds: readonly string[]) {
  assertCan(ctx, "settings.manage");
  await inTx(ctx, async (c) => {
    const current = await c.db
      .select({ id: schema.pipelineStage.id })
      .from(schema.pipelineStage)
      .where(
        and(
          eq(schema.pipelineStage.pipelineId, pipelineId),
          isNull(schema.pipelineStage.deletedAt),
        ),
      );
    const same =
      current.length === orderedIds.length &&
      new Set(orderedIds).size === orderedIds.length &&
      current.every((s) => orderedIds.includes(s.id));
    if (!same) throw new UserError("Pořadí musí obsahovat všechny stavy právě jednou.");
    for (const [i, id] of orderedIds.entries()) {
      await c.db
        .update(schema.pipelineStage)
        .set({ position: i, updatedBy: c.actor.userId })
        .where(eq(schema.pipelineStage.id, id));
    }
    await recordAudit(c, {
      action: "reorder",
      entityType: "pipeline",
      entityId: pipelineId,
      summary: "Změněno pořadí stavů",
    });
  });
}

/** Smaže (měkce) nepoužívaný stav; používaný se odmítne a doporučí se přesunout záznamy jinam. */
export async function deleteStage(ctx: Ctx, stageId: string) {
  assertCan(ctx, "settings.manage");
  await inTx(ctx, async (c) => {
    const [stage] = await c.db
      .select({ stage: schema.pipelineStage, entityType: schema.pipeline.entityType })
      .from(schema.pipelineStage)
      .innerJoin(schema.pipeline, eq(schema.pipelineStage.pipelineId, schema.pipeline.id))
      .where(and(eq(schema.pipelineStage.id, stageId), isNull(schema.pipelineStage.deletedAt)));
    if (!stage) throw new NotFoundError("Stav nenalezen.");
    const used = await usage.get(stage.entityType)?.(c.db, stageId);
    if (used)
      throw new UserError(
        `Stav „${stage.stage.name}“ používá ${plural(used)}. Nejdřív je přesuňte do jiného stavu.`,
      );
    const remaining = (await activeStages(c.db, stage.stage.pipelineId)).filter(
      (s) => s.id !== stageId,
    );
    if (!remaining.length) throw new UserError("Poslední stav pipeline smazat nejde.");
    assertPhasesCovered(stage.entityType, remaining);
    await c.db
      .update(schema.pipelineStage)
      .set({ deletedAt: new Date(), updatedBy: c.actor.userId })
      .where(eq(schema.pipelineStage.id, stageId));
    await recordAudit(c, {
      action: "delete",
      entityType: "pipeline_stage",
      entityId: stageId,
      summary: `Stav „${stage.stage.name}“ smazán`,
    });
  });
}

/** Vrátí smazaný stav na konec pipeline (zpět po omylu). */
export async function restoreStage(ctx: Ctx, stageId: string) {
  assertCan(ctx, "settings.manage");
  await inTx(ctx, async (c) => {
    const [stage] = await c.db
      .select()
      .from(schema.pipelineStage)
      .where(eq(schema.pipelineStage.id, stageId));
    if (!stage || !stage.deletedAt) throw new NotFoundError("Stav nenalezen.");
    const active = await activeStages(c.db, stage.pipelineId);
    if (active.some((s) => s.name.trim().toLowerCase() === stage.name.trim().toLowerCase()))
      throw new UserError("Stav s tímto názvem mezitím vznikl, obnovit ho nejde.");
    await c.db
      .update(schema.pipelineStage)
      .set({ deletedAt: null, position: active.length, updatedBy: c.actor.userId })
      .where(eq(schema.pipelineStage.id, stageId));
    await recordAudit(c, {
      action: "restore",
      entityType: "pipeline_stage",
      entityId: stageId,
      summary: `Stav „${stage.name}“ obnoven`,
    });
  });
}
