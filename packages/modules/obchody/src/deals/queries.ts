import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { getLookup } from "@rebar/core/config-data";
import { scopedEntity } from "@rebar/core/dashboards";
import { schema } from "@rebar/core/db";
import { assertEntityAccess, privateScope, recordTitles } from "@rebar/core/entities";
import type { ModuleDeps } from "@rebar/core/module-server";
import type { Ctx } from "@rebar/core/rbac";
import { company } from "@rebar/kontakty/schema";
import type { ServiceType } from "@rebar/core/contracts";
import type {
  BoardColumn,
  BoardInput,
  BoardResult,
  DealCard,
  DealDetail,
  LostReasonView,
  ParticipantView,
  StageView,
  WinPreview,
} from "../contract";
import { deal, dealParticipant } from "../schema";
import { LOST_REASON_LOOKUP, type DealSource } from "../shared";
import {
  dealPipeline,
  loadDeal,
  stageView,
  userNames,
  type DealRow,
  type StageRow,
} from "./common";
import { stageHistory } from "./history";
import {
  columnSummary,
  dealHighlight,
  effectiveProbabilityPct,
  type HighlightInput,
} from "./logic";

/** Porovnání bez ohledu na velikost písmen a diakritiku (hledání na boardu). */
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const iso = (d: Date | null) => d?.toISOString() ?? null;

function highlightInputOf(r: DealRow, stage: StageRow | undefined): HighlightInput {
  return {
    result: r.result,
    stageEnteredAt: r.stageEnteredAt,
    nextActivityAt: r.nextActivityAt,
    lastActivityAt: r.lastActivityAt,
    rottingDays: stage?.rottingDays ?? null,
    source: r.source,
    firstOpenedAt: r.firstOpenedAt,
  };
}

/**
 * Board (OBCH-05, 06, 07): sloupce = fáze výchozí pipeline, v nich otevřené obchody, které aktér smí vidět (rozsah „jen
 * moje“ a soukromé záznamy řeší jádro), s počtem, součtem a váženým součtem (hodnota × pravděpodobnost fáze) a se
 * zvýrazněním (bez další aktivity, hnití, neotevřený lead). V sloupci jsou nejdřív neotevřené leady, potom nejnovější.
 */
export async function board(
  ctx: Ctx,
  deps: ModuleDeps,
  input: BoardInput,
  now: Date = new Date(),
): Promise<BoardResult> {
  const pipeline = await dealPipeline(ctx.db);
  const scope = await scopedEntity(ctx, deps, "deal");
  const owner = input.owner === "me" ? ctx.actor.userId : input.owner;
  const rows = await ctx.db
    .select()
    .from(deal)
    .where(
      and(scope.where, eq(deal.result, "open"), owner ? eq(deal.ownerId, owner) : undefined),
    )
    .orderBy(desc(deal.createdAt));
  const companies = await recordTitles(
    ctx,
    deps.registry,
    "company",
    rows.map((r) => r.companyId).filter((x): x is string => !!x),
  );
  const persons = await recordTitles(
    ctx,
    deps.registry,
    "person",
    rows.map((r) => r.personId).filter((x): x is string => !!x),
  );
  const users = await userNames(
    ctx.db,
    rows.map((r) => r.ownerId),
  );
  const needle = input.search?.trim() ? fold(input.search.trim()) : null;

  const stages = [...pipeline.stages].sort((a, b) => a.position - b.position);
  const byStage = new Map(stages.map((s) => [s.id, s] as const));
  const columns: BoardColumn[] = stages.map((stage) => ({
    stage: stageView(stage),
    count: 0,
    totalMinor: 0,
    weightedMinor: 0,
    cards: [],
  }));
  const colOf = new Map(columns.map((c) => [c.stage.id, c] as const));
  for (const r of rows) {
    const col = colOf.get(r.stageId);
    if (!col) continue; // obchod v jiné pipeline než výchozí na tomto boardu není
    const companyName = r.companyId ? (companies[r.companyId] ?? null) : null;
    if (needle && !fold(`${r.title} ${companyName ?? ""}`).includes(needle)) continue;
    const card: DealCard = {
      id: r.id,
      title: r.title,
      companyId: r.companyId,
      companyName,
      personId: r.personId,
      personName: r.personId ? (persons[r.personId] ?? null) : null,
      stageId: r.stageId,
      valueMinor: r.valueMinor,
      weightedMinor: r.weightedMinor,
      services: r.services as ServiceType[],
      ownerId: r.ownerId,
      ownerName: r.ownerId ? (users.get(r.ownerId) ?? null) : null,
      expectedCloseDate: r.expectedCloseDate,
      nextActivityAt: iso(r.nextActivityAt),
      source: r.source as DealSource,
      isPrivate: r.isPrivate,
      highlight: dealHighlight(highlightInputOf(r, byStage.get(r.stageId)), now),
      updatedAt: r.updatedAt.toISOString(),
    };
    col.cards.push(card);
  }
  for (const col of columns) {
    col.cards.sort(
      (a, b) =>
        Number(b.highlight.unopenedLead) - Number(a.highlight.unopenedLead) ||
        0, // zbytek zůstává v pořadí od nejnovějšího
    );
    const sum = columnSummary(
      col.cards.map((c) => ({
        valueMinor: c.valueMinor,
        probabilityPct: effectiveProbabilityPct("open", col.stage.probabilityPct),
      })),
    );
    col.count = sum.count;
    col.totalMinor = sum.totalMinor;
    col.weightedMinor = sum.weightedMinor;
  }
  return {
    pipeline: { id: pipeline.id, key: pipeline.key, name: pipeline.name },
    columns,
    totals: {
      count: columns.reduce((n, c) => n + c.count, 0),
      totalMinor: columns.reduce((n, c) => n + c.totalMinor, 0),
      weightedMinor: columns.reduce((n, c) => n + c.weightedMinor, 0),
    },
    noNextActivity: columns.reduce(
      (n, c) => n + c.cards.filter((x) => x.highlight.noNextActivity).length,
      0,
    ),
  };
}

/** Pipeline, do které patří fáze (kvůli pásu fází u obchodu z jiné než výchozí pipeline). */
async function stagesOfPipelineOf(ctx: Ctx, stageId: string): Promise<StageRow[]> {
  const [s] = await ctx.db
    .select({ pipelineId: schema.pipelineStage.pipelineId })
    .from(schema.pipelineStage)
    .where(eq(schema.pipelineStage.id, stageId));
  if (!s) return [];
  return ctx.db
    .select()
    .from(schema.pipelineStage)
    .where(
      and(
        eq(schema.pipelineStage.pipelineId, s.pipelineId),
        isNull(schema.pipelineStage.deletedAt),
      ),
    )
    .orderBy(asc(schema.pipelineStage.position));
}

/** Účastníci (další kontakty) obchodu se jmény. */
export async function listParticipants(
  ctx: Ctx,
  deps: ModuleDeps,
  dealId: string,
): Promise<ParticipantView[]> {
  const rows = await ctx.db
    .select()
    .from(dealParticipant)
    .where(and(eq(dealParticipant.dealId, dealId), isNull(dealParticipant.deletedAt)))
    .orderBy(asc(dealParticipant.createdAt));
  const names = await recordTitles(
    ctx,
    deps.registry,
    "person",
    rows.map((r) => r.personId),
  );
  return rows.map((r) => ({ id: r.id, personId: r.personId, personName: names[r.personId] ?? null }));
}

/**
 * Detail obchodu pro hlavičku, pás fází (s dny v každé fázi), blok „Další aktivita“ a časovou osu změn fází.
 * Soukromý nebo cizí obchod (rozsah „jen moje“) se tváří jako neexistující.
 */
export async function detail(
  ctx: Ctx,
  deps: ModuleDeps,
  dealId: string,
  now: Date = new Date(),
): Promise<DealDetail> {
  await assertEntityAccess(ctx, "deal", dealId, "read");
  const r = await loadDeal(ctx.db, dealId);
  const stages = await stagesOfPipelineOf(ctx, r.stageId);
  const current = stages.find((s) => s.id === r.stageId);
  const history = await stageHistory(ctx, dealId, now);
  const daysByStage = new Map<string, number>();
  for (const h of history)
    daysByStage.set(h.toStageId, (daysByStage.get(h.toStageId) ?? 0) + h.days);
  const [companyTitles, personTitles, users, reasons, participants] = await Promise.all([
    recordTitles(ctx, deps.registry, "company", r.companyId ? [r.companyId] : []),
    recordTitles(ctx, deps.registry, "person", r.personId ? [r.personId] : []),
    userNames(ctx.db, [r.ownerId]),
    getLookup(ctx.db, LOST_REASON_LOOKUP, { includeInactive: true }),
    listParticipants(ctx, deps, dealId),
  ]);
  return {
    deal: {
      id: r.id,
      title: r.title,
      companyId: r.companyId,
      companyName: r.companyId ? (companyTitles[r.companyId] ?? null) : null,
      personId: r.personId,
      personName: r.personId ? (personTitles[r.personId] ?? null) : null,
      stageId: r.stageId,
      stageEnteredAt: r.stageEnteredAt.toISOString(),
      result: r.result,
      valueMinor: r.valueMinor,
      weightedMinor: r.weightedMinor,
      probabilityPct: effectiveProbabilityPct(r.result, current?.probabilityPct),
      services: r.services as ServiceType[],
      expectedCloseDate: r.expectedCloseDate,
      ownerId: r.ownerId,
      ownerName: r.ownerId ? (users.get(r.ownerId) ?? null) : null,
      source: r.source as DealSource,
      sourceDetail: r.sourceDetail,
      metaCampaignId: r.metaCampaignId,
      metaAdsetId: r.metaAdsetId,
      metaAdId: r.metaAdId,
      wonAt: iso(r.wonAt),
      lostAt: iso(r.lostAt),
      lostReason: r.lostReason,
      lostReasonLabel: reasons.find((x) => x.value === r.lostReason)?.label ?? r.lostReason,
      lostNote: r.lostNote,
      firstOpenedAt: iso(r.firstOpenedAt),
      nextActivityAt: iso(r.nextActivityAt),
      lastActivityAt: iso(r.lastActivityAt),
      nextTaskId: r.nextTaskId,
      isPrivate: r.isPrivate,
      tags: r.tags,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    },
    stages: stages.map((s): StageView & { daysIn: number } => ({
      ...stageView(s),
      daysIn: daysByStage.get(s.id) ?? 0,
    })),
    highlight: dealHighlight(highlightInputOf(r, current), now),
    history,
    participants,
  };
}

/** Historie fází obchodu (OBCH-09). */
export async function history(ctx: Ctx, dealId: string, now: Date = new Date()) {
  await assertEntityAccess(ctx, "deal", dealId, "read");
  return stageHistory(ctx, dealId, now);
}

/** Důvody prohry z číselníku (výchozí jen aktivní; správa v Nastavení ukazuje i neaktivní). */
export async function lostReasons(
  ctx: Ctx,
  input: { includeInactive: boolean },
): Promise<LostReasonView[]> {
  const items = await getLookup(ctx.db, LOST_REASON_LOOKUP, {
    includeInactive: input.includeInactive,
  });
  return items.map((i) => ({
    id: i.id,
    value: i.value,
    label: i.label,
    color: i.color,
    active: i.active,
    position: i.position,
  }));
}

/** Údaje obchodu pro dialog „Založit zakázky“ po výhře (předvyplní `JobsFromDealDialog`). */
export async function winPreview(ctx: Ctx, dealId: string): Promise<WinPreview> {
  await assertEntityAccess(ctx, "deal", dealId, "read");
  const r = await loadDeal(ctx.db, dealId);
  let companyName: string | null = null;
  let clientStatus: string | null = null;
  if (r.companyId) {
    const [c] = await ctx.db
      .select({ name: company.name, status: company.clientStatus })
      .from(company)
      .where(and(eq(company.id, r.companyId), isNull(company.deletedAt), privateScope(ctx, company)));
    companyName = c?.name ?? null;
    clientStatus = c?.status ?? null;
  }
  return {
    dealId: r.id,
    title: r.title,
    companyId: r.companyId,
    companyName,
    services: r.services as ServiceType[],
    valueMinor: r.valueMinor,
    ownerId: r.ownerId,
    result: r.result,
    clientStatus,
  };
}
