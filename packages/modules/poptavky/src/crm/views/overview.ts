import { and, asc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { getPipeline } from "@rebar/core/config-data";
import { scopedEntity, tryScopedEntity } from "@rebar/core/dashboards";
import { schema } from "@rebar/core/db";
import type { AttentionItem, ModuleDeps, WidgetData } from "@rebar/core/module-server";
import { can } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { formatMinor } from "@rebar/core/shared";
import { todayIso } from "@rebar/core/time";
import { job } from "@rebar/zakazky/schema";
import { inquiry } from "../../schema";
import { daysInStage } from "../logic";
import { dealAttentionKind, type DealAttentionKind } from "./logic";
import { openDealWhere } from "./scope";

/** Kolik položek jedné skupiny se na přehledu ukáže zvlášť; zbytek jde do souhrnné položky. */
const MAX_ITEMS = 8;

const crmHref = (id: string) => `/crm?record=${id}`;

/**
 * „Vyžaduje pozornost“: obchody, kde je obchodník odpovědný (zakázky ve fázi poptávka a nabídka), které mají aktivity
 * po termínu, zhnily, nemají další aktivitu nebo jim uplynulo předpokládané uzavření. Každý obchod je nejvýš jednou
 * (podle nejvyšší priority). Nabídky, na které už upozorňuje modul Zakázky („čeká na odpověď déle než 14 dní“), se
 * v kategoriích zhnilý, bez aktivity a uplynulý termín nezdvojují.
 */
export async function dealAttention(ctx: Ctx, deps: ModuleDeps): Promise<AttentionItem[]> {
  if (!can(ctx, "poptavky.read") || !ctx.actor.userId) return [];
  const scope = await tryScopedEntity(ctx, deps, "job");
  if (!scope) return [];
  const today = todayIso();
  const rows = await ctx.db
    .select({
      id: job.id,
      number: job.number,
      title: job.title,
      phase: job.phase,
      stageName: schema.pipelineStage.name,
      overdue: job.crmOverdueActivities,
      open: job.crmOpenActivities,
      rotting: job.crmRotting,
      expected: job.expectedCloseDate,
      stageEntered: job.crmStageEnteredAt,
      phaseChangedAt: job.phaseChangedAt,
    })
    .from(job)
    .leftJoin(schema.pipelineStage, eq(schema.pipelineStage.id, job.stageId))
    .where(and(scope.where, openDealWhere({ managerId: ctx.actor.userId })))
    .orderBy(asc(job.crmStageEnteredAt))
    .limit(500);

  const staleOfferCutoff = Date.now() - 14 * 86_400_000;
  const groups: Record<DealAttentionKind, AttentionItem[]> = {
    overdue_activity: [],
    rotting: [],
    no_activity: [],
    close_passed: [],
  };
  for (const r of rows) {
    const kind = dealAttentionKind(
      {
        overdueActivities: r.overdue,
        rotting: r.rotting,
        openActivities: r.open,
        expectedCloseDate: r.expected,
      },
      today,
    );
    if (!kind) continue;
    // nabídku bez odpovědi déle než 14 dní hlásí už Zakázky
    if (
      kind !== "overdue_activity" &&
      r.phase === "offer" &&
      r.phaseChangedAt &&
      r.phaseChangedAt.getTime() < staleOfferCutoff
    )
      continue;
    const label = `Zakázka ${r.number} „${r.title}“`;
    const base = { id: `crm-${kind}-${r.id}`, module: "poptavky", href: crmHref(r.id) };
    if (kind === "overdue_activity")
      groups[kind].push({
        ...base,
        severity: "danger",
        title: `${label}: aktivity po termínu (${r.overdue})`,
        detail: "Dokončete je, nebo naplánujte nový termín.",
      });
    else if (kind === "rotting")
      groups[kind].push({
        ...base,
        severity: "warning",
        title: `${label} hnije`,
        detail: `Ve stavu „${r.stageName ?? ""}“ je ${daysInStage(r.stageEntered)} dní bez pohybu. Ozvěte se zákazníkovi.`,
      });
    else if (kind === "no_activity")
      groups[kind].push({
        ...base,
        severity: "warning",
        title: `${label} nemá další aktivitu`,
        detail: "Naplánujte další krok, ať obchod nezapadne.",
      });
    else
      groups[kind].push({
        ...base,
        severity: "info",
        title: `${label}: uplynulo předpokládané uzavření`,
        detail: `Předpokládané uzavření bylo ${r.expected}. Posuňte termín, nebo obchod uzavřete.`,
      });
  }
  const out: AttentionItem[] = [];
  const names: Record<DealAttentionKind, string> = {
    overdue_activity: "s aktivitami po termínu",
    rotting: "zhnilých",
    no_activity: "bez další aktivity",
    close_passed: "po předpokládaném uzavření",
  };
  for (const kind of Object.keys(groups) as DealAttentionKind[]) {
    const items = groups[kind];
    out.push(...items.slice(0, MAX_ITEMS));
    if (items.length > MAX_ITEMS)
      out.push({
        id: `crm-${kind}-more`,
        module: "poptavky",
        severity: items[0]!.severity,
        title: `Dalších ${items.length - MAX_ITEMS} obchodů ${names[kind]}`,
        href: "/crm",
      });
  }
  return out;
}

/** Poptávky ve schránce, které čekají na zpracování déle než den (jinak je vidět nová poptávka sama). */
const WAITING_DAYS = 1;

/**
 * „Vyžaduje pozornost“ schránky poptávek, sjednocené: jedna položka na poptávku, buď uplynul termín dalšího kroku, nebo
 * nová poptávka čeká déle než den na zpracování (kvalifikaci nebo zamítnutí). Nahrazuje původní samostatnou položku.
 */
export async function inboxAttention(ctx: Ctx, deps: ModuleDeps): Promise<AttentionItem[]> {
  if (!can(ctx, "poptavky.read")) return [];
  const scope = await scopedEntity(ctx, deps, "inquiry");
  const pipeline = await getPipeline(ctx.db, "inquiry", "default");
  const open = (pipeline?.stages ?? []).filter((s) => s.kind === "open").map((s) => s.id);
  if (!open.length) return [];
  const today = todayIso();
  const cutoff = new Date(Date.now() - WAITING_DAYS * 86_400_000);
  const rows = await ctx.db
    .select({
      id: inquiry.id,
      title: inquiry.title,
      nextStep: inquiry.nextStep,
      nextStepAt: inquiry.nextStepAt,
      createdAt: inquiry.createdAt,
    })
    .from(inquiry)
    .where(
      and(
        scope.where,
        inArray(inquiry.stageId, open),
        isNull(inquiry.convertedJobId),
        or(lt(inquiry.nextStepAt, today), lt(inquiry.createdAt, cutoff)),
      ),
    )
    .orderBy(asc(inquiry.createdAt))
    .limit(10);
  return rows.map((r): AttentionItem => {
    const overdue = !!r.nextStepAt && r.nextStepAt < today;
    return overdue
      ? {
          id: `inquiry-overdue-${r.id}`,
          module: "poptavky",
          severity: "warning",
          title: `Poptávka „${r.title}“: termín kroku uplynul`,
          detail: r.nextStep ? r.nextStep : "Doplňte další krok.",
          href: `/poptavky/${r.id}`,
        }
      : {
          id: `inquiry-waiting-${r.id}`,
          module: "poptavky",
          severity: "info",
          title: `Poptávka „${r.title}“ čeká na zpracování`,
          detail: "Kvalifikujte ji, nebo zamítněte.",
          href: `/poptavky/${r.id}`,
        };
  });
}

/** Dlaždice přehledu: otevřená a vážená hodnota obchodů (s ekonomikou), jinak počet otevřených obchodů. */
export async function dealTiles(ctx: Ctx, deps: ModuleDeps): Promise<WidgetData[]> {
  if (!can(ctx, "poptavky.read")) return [];
  const scope = await tryScopedEntity(ctx, deps, "job");
  if (!scope) return [];
  const money = scope.entity.byKey.has("value") && scope.entity.byKey.has("crmWeighted");
  const [r] = await ctx.db
    .select({
      n: sql<number>`count(*)::int`,
      value: money ? sql<number>`coalesce(sum(${job.valueMinor}), 0)::float8` : sql<number>`0`,
      weighted: money
        ? sql<number>`coalesce(sum(${job.crmWeightedMinor}), 0)::float8`
        : sql<number>`0`,
    })
    .from(job)
    .where(and(scope.where, openDealWhere()));
  const count = r?.n ?? 0;
  if (!money)
    return [
      {
        id: "crm-open-deals",
        module: "poptavky",
        title: "Otevřené obchody",
        value: String(count),
        hint: "poptávka a nabídka",
        href: "/crm",
        order: 21,
      },
    ];
  return [
    {
      id: "crm-open-value",
      module: "poptavky",
      title: "Otevřená hodnota obchodů",
      value: formatMinor(Number(r?.value ?? 0)),
      hint: `${count} otevřených obchodů`,
      href: "/crm",
      order: 21,
    },
    {
      id: "crm-weighted-value",
      module: "poptavky",
      title: "Vážená hodnota obchodů",
      value: formatMinor(Number(r?.weighted ?? 0)),
      hint: "podle pravděpodobnosti stavů",
      href: "/crm",
      order: 22,
    },
  ];
}
