"use server";

import {
  addLookupItem,
  addStage,
  deleteStage,
  deleteVatRate,
  reorderLookupItems,
  reorderStages,
  restoreStage,
  restoreVatRate,
  saveVatRate,
  setDefaultVatCode,
  updateLookupItem,
  updateStage,
} from "@rebar/core/config-data";
import {
  createFieldDef,
  deleteFieldDef,
  fieldInput,
  reorderFieldDefs,
  restoreFieldDef,
  updateFieldDef,
} from "@rebar/core/custom-fields";
import { reindexEntity, resolveEntity } from "@rebar/core/entities";
import { updateSeriesPattern } from "@rebar/core/numbering";
import { UserError, type Ctx } from "@rebar/core/rbac";
import { z } from "zod";
import { defineAction } from "./request";
import { getServices } from "./services";

/*
  Server actions pro konfiguraci v Nastavení: stavy a pipeline, číselníky, vlastní pole, číselné řady a sazby DPH.
  Oprávnění `settings.manage` kontroluje samotná služba v jádru; `permission` tady jen zkrátí zbytečné zpracování.
  Každá změna se zapisuje do auditu (v jádru).
*/

const id = z.uuid();
const color = z.string().max(20);
const PERM = "settings.manage";
const PIPELINES = [PERM, "settings.pipelines"] as const;
const FIELDS = [PERM, "settings.custom_fields"] as const;

/* ---------- stavy a pipeline ---------- */

const stageKind = z.enum(["open", "won", "lost", "done"]);

export const addStageAction = defineAction({
  permission: PIPELINES,
  input: z.object({
    pipelineId: id,
    name: z.string().max(80),
    color: color.optional(),
    kind: stageKind.optional(),
    phase: z.string().max(40).nullish(),
    probabilityPct: z.number().int().min(0).max(100).nullish(),
    rottingDays: z.number().int().min(1).max(365).nullish(),
  }),
  handler: async (ctx, i) => {
    const row = await addStage(ctx, i.pipelineId, {
      name: i.name,
      ...(i.color ? { color: i.color } : {}),
      ...(i.kind ? { kind: i.kind } : {}),
      phase: i.phase ?? null,
      probabilityPct: i.probabilityPct ?? null,
      rottingDays: i.rottingDays ?? null,
    });
    return { id: row.id };
  },
});

export const updateStageAction = defineAction({
  permission: PIPELINES,
  input: z.object({
    id,
    name: z.string().max(80).optional(),
    color: color.optional(),
    kind: stageKind.optional(),
    phase: z.string().max(40).nullable().optional(),
    probabilityPct: z.number().int().min(0).max(100).nullable().optional(),
    rottingDays: z.number().int().min(1).max(365).nullable().optional(),
  }),
  handler: async (ctx, { id: stageId, ...patch }) => {
    await updateStage(ctx, stageId, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.color !== undefined ? { color: patch.color } : {}),
      ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
      ...(patch.phase !== undefined ? { phase: patch.phase } : {}),
      ...(patch.probabilityPct !== undefined ? { probabilityPct: patch.probabilityPct } : {}),
      ...(patch.rottingDays !== undefined ? { rottingDays: patch.rottingDays } : {}),
    });
    return { id: stageId };
  },
});

export const reorderStagesAction = defineAction({
  permission: PIPELINES,
  input: z.object({ pipelineId: id, ids: z.array(id).min(1).max(100) }),
  handler: (ctx, i) => reorderStages(ctx, i.pipelineId, i.ids),
});

export const deleteStageAction = defineAction({
  permission: PIPELINES,
  input: z.object({ id }),
  handler: (ctx, i) => deleteStage(ctx, i.id),
});

export const restoreStageAction = defineAction({
  permission: PIPELINES,
  input: z.object({ id }),
  handler: (ctx, i) => restoreStage(ctx, i.id),
});

/* ---------- číselníky ---------- */

export const addLookupItemAction = defineAction({
  permission: PERM,
  input: z.object({
    key: z.string().max(80),
    value: z.string().max(60),
    label: z.string().max(80),
    color: color.optional(),
  }),
  handler: async (ctx, i) => {
    const row = await addLookupItem(ctx, i.key, {
      value: i.value,
      label: i.label,
      ...(i.color ? { color: i.color } : {}),
    });
    return { id: row.id };
  },
});

export const updateLookupItemAction = defineAction({
  permission: PERM,
  input: z.object({
    id,
    label: z.string().max(80).optional(),
    color: color.nullable().optional(),
    active: z.boolean().optional(),
  }),
  handler: async (ctx, { id: itemId, ...patch }) => {
    await updateLookupItem(ctx, itemId, {
      ...(patch.label !== undefined ? { label: patch.label } : {}),
      ...(patch.color !== undefined ? { color: patch.color } : {}),
      ...(patch.active !== undefined ? { active: patch.active } : {}),
    });
    return { id: itemId };
  },
});

export const reorderLookupItemsAction = defineAction({
  permission: PERM,
  input: z.object({ key: z.string().max(80), ids: z.array(id).min(1).max(500) }),
  handler: (ctx, i) => reorderLookupItems(ctx, i.key, i.ids),
});

/* ---------- vlastní pole ---------- */

/** Typ záznamu musí existovat v registru entit zapnutých modulů a mít sloupec pro vlastní pole. */
function assertCustomizable(entityType: string) {
  const def = getServices().registry.get(entityType);
  if (!def) throw new UserError("Neznámý typ záznamu.");
  return def;
}

/** Po změně definice se znovu zaindexuje hledání (nový popisek možnosti, skryté nebo smazané pole). */
async function reindex(ctx: Ctx, entityType: string) {
  const def = getServices().registry.get(entityType);
  if (def) await reindexEntity(ctx.db, await resolveEntity(ctx.db, def));
}

export const createFieldAction = defineAction({
  permission: FIELDS,
  input: fieldInput,
  handler: async (ctx, i) => {
    assertCustomizable(i.entityType);
    if (i.options.entityType && !getServices().registry.get(i.options.entityType))
      throw new UserError("Neznámý typ odkazovaného záznamu.");
    const row = await createFieldDef(ctx, i);
    return { id: row.id };
  },
});

export const updateFieldAction = defineAction({
  permission: FIELDS,
  input: z.object({
    id,
    entityType: z.string().max(40),
    label: z.string().max(80).optional(),
    options: fieldInput.shape.options.optional(),
    required: z.boolean().optional(),
    showInTable: z.boolean().optional(),
    showInForm: z.boolean().optional(),
  }),
  handler: async (ctx, { id: fieldId, entityType, ...patch }) => {
    await updateFieldDef(ctx, fieldId, {
      ...(patch.label !== undefined ? { label: patch.label } : {}),
      ...(patch.options !== undefined ? { options: patch.options } : {}),
      ...(patch.required !== undefined ? { required: patch.required } : {}),
      ...(patch.showInTable !== undefined ? { showInTable: patch.showInTable } : {}),
      ...(patch.showInForm !== undefined ? { showInForm: patch.showInForm } : {}),
    });
    await reindex(ctx, entityType);
    return { id: fieldId };
  },
});

export const deleteFieldAction = defineAction({
  permission: FIELDS,
  input: z.object({ id, entityType: z.string().max(40) }),
  handler: async (ctx, i) => {
    await deleteFieldDef(ctx, i.id);
    await reindex(ctx, i.entityType);
  },
});

export const restoreFieldAction = defineAction({
  permission: FIELDS,
  input: z.object({ id, entityType: z.string().max(40) }),
  handler: async (ctx, i) => {
    await restoreFieldDef(ctx, i.id);
    await reindex(ctx, i.entityType);
  },
});

export const reorderFieldsAction = defineAction({
  permission: FIELDS,
  input: z.object({ entityType: z.string().max(40), ids: z.array(id).min(1).max(200) }),
  handler: (ctx, i) => reorderFieldDefs(ctx, i.entityType, i.ids),
});

/* ---------- číselné řady ---------- */

export const updateSeriesPatternAction = defineAction({
  permission: PERM,
  input: z.object({ key: z.string().max(80), pattern: z.string().max(80) }),
  handler: (ctx, i) => updateSeriesPattern(ctx, i.key, i.pattern.trim()),
});

/* ---------- sazby DPH ---------- */

export const saveVatRateAction = defineAction({
  permission: PERM,
  input: z.object({
    code: z.string().max(40),
    label: z.string().max(80),
    rateBp: z.number().int().min(0).max(10_000),
    validFrom: z.string().max(10),
    validTo: z.string().max(10).nullish(),
  }),
  handler: async (ctx, i) => {
    const row = await saveVatRate(ctx, i);
    return { id: row.id };
  },
});

export const deleteVatRateAction = defineAction({
  permission: PERM,
  input: z.object({ id }),
  handler: (ctx, i) => deleteVatRate(ctx, i.id),
});

export const restoreVatRateAction = defineAction({
  permission: PERM,
  input: z.object({ id }),
  handler: (ctx, i) => restoreVatRate(ctx, i.id),
});

export const setDefaultVatAction = defineAction({
  permission: PERM,
  input: z.object({ code: z.string().max(40) }),
  handler: (ctx, i) => setDefaultVatCode(ctx, i.code),
});
