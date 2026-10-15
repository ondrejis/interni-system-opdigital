import { and, eq, inArray, isNull } from "drizzle-orm";
import type { DealSnap, ServiceType } from "@rebar/core/contracts";
import { getPipeline } from "@rebar/core/config-data";
import { schema, type Executor } from "@rebar/core/db";
import { NotFoundError, UserError } from "@rebar/core/rbac";
import { deal } from "../schema";
import { DEAL_PIPELINE } from "../shared";
import type { StageView } from "../contract";

/** Surový řádek tabulky `deal`. */
export type DealRow = typeof deal.$inferSelect;

/** Fáze pipeline tak, jak ji čte modul (řádek `pipeline_stage`). */
export type StageRow = typeof schema.pipelineStage.$inferSelect;

/** Fáze jako pohled pro UI. */
export function stageView(s: StageRow): StageView {
  return {
    id: s.id,
    name: s.name,
    color: s.color,
    position: s.position,
    probabilityPct: s.probabilityPct ?? null,
    rottingDays: s.rottingDays ?? null,
  };
}

/** Výchozí pipeline obchodů se stavy v pořadí; chybí-li (seed neběžel), srozumitelná chyba. */
export async function dealPipeline(db: Executor) {
  const pl = await getPipeline(db, DEAL_PIPELINE.entityType, DEAL_PIPELINE.key);
  if (!pl) throw new UserError("Pipeline obchodů není založená (spusťte db:seed).");
  return pl;
}

/** Fáze podle id (jen aktivní, jen z pipeline obchodů); jinak `null`. */
export async function loadStage(db: Executor, stageId: string): Promise<StageRow | null> {
  const [row] = await db
    .select({ stage: schema.pipelineStage })
    .from(schema.pipelineStage)
    .innerJoin(schema.pipeline, eq(schema.pipeline.id, schema.pipelineStage.pipelineId))
    .where(
      and(
        eq(schema.pipelineStage.id, stageId),
        isNull(schema.pipelineStage.deletedAt),
        eq(schema.pipeline.entityType, DEAL_PIPELINE.entityType),
        isNull(schema.pipeline.deletedAt),
      ),
    );
  return row?.stage ?? null;
}

/** Fáze (i smazané) podle id pro historii a zobrazení. */
export async function stagesById(db: Executor, ids: readonly string[]) {
  if (!ids.length) return new Map<string, StageRow>();
  const rows = await db
    .select()
    .from(schema.pipelineStage)
    .where(inArray(schema.pipelineStage.id, [...ids]));
  return new Map(rows.map((r) => [r.id, r] as const));
}

/** První fáze výchozí pipeline (kam padá nový obchod). */
export async function firstStage(db: Executor): Promise<StageRow> {
  const pl = await dealPipeline(db);
  const first = [...pl.stages].sort((a, b) => a.position - b.position)[0];
  if (!first) throw new UserError("Pipeline obchodů nemá žádnou fázi.");
  return first;
}

/** Nesmazaný řádek obchodu podle id, nebo `NotFoundError`. Přístup (rozsah, soukromí) ověřuje volající. */
export async function loadDeal(db: Executor, id: string): Promise<DealRow> {
  const [row] = await db
    .select()
    .from(deal)
    .where(and(eq(deal.id, id), isNull(deal.deletedAt)));
  if (!row) throw new NotFoundError("Obchod nenalezen.");
  return row;
}

/** Jména uživatelů podle id (prázdné id se vynechá). */
export async function userNames(db: Executor, ids: readonly (string | null)[]) {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  if (!list.length) return new Map<string, string>();
  const rows = await db
    .select({ id: schema.user.id, name: schema.user.name })
    .from(schema.user)
    .where(inArray(schema.user.id, list));
  return new Map(rows.map((r) => [r.id, r.name] as const));
}

/** Snímek obchodu do událostí a webhooků (nikdy celý řádek). */
export function dealSnap(r: DealRow): DealSnap {
  return {
    id: r.id,
    title: r.title,
    companyId: r.companyId,
    personId: r.personId,
    stageId: r.stageId,
    result: r.result,
    valueMinor: r.valueMinor,
    services: r.services as ServiceType[],
    ownerId: r.ownerId,
    source: r.source,
  };
}

/** Pořadí fází podle pozice (pro stabilní výpisy). */
export const byPosition = <T extends { position: number }>(rows: readonly T[]): T[] =>
  [...rows].sort((a, b) => a.position - b.position);
