import { and, eq, isNull, sql } from "drizzle-orm";
import {
  addLookupItem,
  addStage,
  deleteStage,
  getLookup,
  reorderLookupItems,
  reorderStages,
  stageUsageCount,
  updateLookupItem,
  updateStage,
} from "@rebar/core/config-data";
import { schema } from "@rebar/core/db";
import { NotFoundError, UserError, type Ctx } from "@rebar/core/rbac";
import type { PipelineAdminView } from "../contract";
import { LOST_REASON_LOOKUP } from "../shared";
import { dealPipeline, loadStage, stageView } from "./common";

/*
  Správa pipeline obchodů pro Nastavení → Stavy (oprávnění `obchody.pipelines`, ne obecné `settings.manage`): fáze,
  pravděpodobnosti, dny do zvýraznění a důvody prohry. Zápis dělá jádro (kontroly, audit); modul jen ověří vlastní
  oprávnění a že jde o pipeline obchodů, a dočasně přidá aktérovi nastavovací oprávnění jádra.
*/

/** Kontext s oprávněním jádra potřebným pro zápis nastavení; skutečný aktér (do historie) zůstává. */
function elevated(ctx: Ctx): Ctx {
  const permissions = new Map(ctx.actor.permissions);
  for (const k of ["settings.manage", "settings.pipelines"]) permissions.set(k, "all");
  return { ...ctx, actor: { ...ctx.actor, permissions } };
}

async function assertDealStage(ctx: Ctx, stageId: string) {
  if (!(await loadStage(ctx.db, stageId))) throw new NotFoundError("Fáze nenalezena.");
}

/** Pipeline obchodů: fáze s počtem obchodů v každé a všechny důvody prohry včetně neaktivních. */
export async function getPipelineAdmin(ctx: Ctx): Promise<PipelineAdminView> {
  const pl = await dealPipeline(ctx.db);
  const stages = await Promise.all(
    [...pl.stages]
      .sort((a, b) => a.position - b.position)
      .map(async (s) => ({ ...stageView(s), usage: await stageUsageCount(ctx.db, "deal", s.id) })),
  );
  const items = await getLookup(ctx.db, LOST_REASON_LOOKUP, { includeInactive: true });
  return {
    pipeline: { id: pl.id, key: pl.key, name: pl.name },
    stages,
    lostReasons: items.map((i) => ({
      id: i.id,
      value: i.value,
      label: i.label,
      color: i.color,
      active: i.active,
      position: i.position,
    })),
  };
}

/** Přidá fázi na konec pipeline. */
export async function addDealStage(
  ctx: Ctx,
  input: {
    name: string;
    color?: string | undefined;
    probabilityPct?: number | null | undefined;
    rottingDays?: number | null | undefined;
  },
) {
  const pl = await dealPipeline(ctx.db);
  const row = await addStage(elevated(ctx), pl.id, {
    name: input.name,
    ...(input.color ? { color: input.color } : {}),
    probabilityPct: input.probabilityPct ?? null,
    rottingDays: input.rottingDays ?? null,
    kind: "open",
  });
  return { stageId: row.id };
}

/**
 * Změní fázi (název, barva, pravděpodobnost, dny do zvýraznění). Změna pravděpodobnosti přepočte uloženou váženou
 * hodnotu otevřených obchodů ve fázi.
 */
export async function updateDealStage(
  ctx: Ctx,
  input: {
    stageId: string;
    name?: string | undefined;
    color?: string | undefined;
    probabilityPct?: number | null | undefined;
    rottingDays?: number | null | undefined;
  },
) {
  await assertDealStage(ctx, input.stageId);
  const { stageId, ...patch } = input;
  await updateStage(elevated(ctx), stageId, patch);
  if (patch.probabilityPct !== undefined) await recomputeStageWeights(ctx, stageId);
  return { stageId };
}

/** Smaže nepoužívanou fázi (používanou jádro odmítne větou, kam obchody přesunout). */
export async function deleteDealStage(ctx: Ctx, stageId: string) {
  await assertDealStage(ctx, stageId);
  await deleteStage(elevated(ctx), stageId);
  return { stageId };
}

/** Nové pořadí fází (všechny právě jednou). */
export async function reorderDealStages(ctx: Ctx, stageIds: readonly string[]) {
  const pl = await dealPipeline(ctx.db);
  await reorderStages(elevated(ctx), pl.id, stageIds);
  return { ok: true as const };
}

/** Přidá důvod prohry; bez klíče se odvodí z názvu. */
export async function addLostReason(
  ctx: Ctx,
  input: { value?: string | undefined; label: string; color?: string | null | undefined },
) {
  const value =
    input.value ??
    (input.label
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) ||
      "duvod");
  const row = await addLookupItem(elevated(ctx), LOST_REASON_LOOKUP, {
    value,
    label: input.label,
    ...(input.color ? { color: input.color } : {}),
  });
  return { itemId: row.id, value: row.value };
}

/** Přejmenuje, přebarví nebo (de)aktivuje důvod prohry (mazání není: obchody se na hodnotu odkazují). */
export async function updateLostReason(
  ctx: Ctx,
  input: {
    itemId: string;
    label?: string | undefined;
    color?: string | null | undefined;
    active?: boolean | undefined;
  },
) {
  const [item] = await ctx.db
    .select({ id: schema.lookupItem.id })
    .from(schema.lookupItem)
    .innerJoin(schema.lookupList, eq(schema.lookupList.id, schema.lookupItem.listId))
    .where(
      and(
        eq(schema.lookupItem.id, input.itemId),
        eq(schema.lookupList.key, LOST_REASON_LOOKUP),
        isNull(schema.lookupItem.deletedAt),
      ),
    );
  if (!item) throw new NotFoundError("Důvod prohry nenalezen.");
  const { itemId, ...patch } = input;
  if (patch.active === false) {
    const active = await getLookup(ctx.db, LOST_REASON_LOOKUP);
    if (active.length <= 1 && active[0]?.id === itemId)
      throw new UserError("Poslední důvod prohry nejde vypnout.");
  }
  await updateLookupItem(elevated(ctx), itemId, patch);
  return { itemId };
}

/** Nové pořadí důvodů prohry (všechny právě jednou, i neaktivní). */
export async function reorderLostReasons(ctx: Ctx, itemIds: readonly string[]) {
  await reorderLookupItems(elevated(ctx), LOST_REASON_LOOKUP, itemIds);
  return { ok: true as const };
}

/** Přepočítá uloženou váženou hodnotu otevřených obchodů ve fázi (po změně pravděpodobnosti). */
async function recomputeStageWeights(ctx: Ctx, stageId: string) {
  const stage = await loadStage(ctx.db, stageId);
  const pct = stage?.probabilityPct ?? 0;
  await ctx.db.execute(
    sql`update deal set weighted_minor = round(value_minor::numeric * ${pct} / 100)::bigint
        where stage_id = ${stageId} and result = 'open' and value_minor is not null and deleted_at is null`,
  );
}
