import { and, eq, isNull } from "drizzle-orm";
import { recordAudit } from "@rebar/core/audit";
import { getPipeline } from "@rebar/core/config-data";
import { schema, type Executor } from "@rebar/core/db";
import {
  phaseHooksFor,
  stageHooksFor,
  type PhaseTransition,
  type StageChange,
} from "@rebar/core/entities";
import { emitEvent } from "@rebar/core/module-server";
import { UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { todayIso } from "@rebar/core/time";
import { recomputeJobSummary } from "../costs/api";
import { job } from "../schema";
import { runJobChangeHooks } from "./change-hooks";
import { recordStageEntry } from "./history";
import {
  PHASES,
  allowedNext,
  isPhaseKey,
  isPriceLocked,
  transitionProblem,
  type PhaseKey,
} from "./phases";

/** Stav pipeline zakázek se svou fází. */
export type StageInfo = { id: string; name: string; kind: string; phase: PhaseKey | null };

export const JOB_PIPELINE = { entityType: "job", key: "default" } as const;

const asPhase = (v: unknown): PhaseKey | null => (isPhaseKey(v) ? v : null);

/** Stavy pipeline zakázek v pořadí. */
export async function jobStages(db: Executor): Promise<StageInfo[]> {
  const pipeline = await getPipeline(db, JOB_PIPELINE.entityType, JOB_PIPELINE.key);
  return (pipeline?.stages ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.kind,
    phase: asPhase(s.phase),
  }));
}

export async function stageById(db: Executor, id: string): Promise<StageInfo | null> {
  const [s] = await db
    .select()
    .from(schema.pipelineStage)
    .where(and(eq(schema.pipelineStage.id, id), isNull(schema.pipelineStage.deletedAt)));
  return s ? { id: s.id, name: s.name, kind: s.kind, phase: asPhase(s.phase) } : null;
}

/** První stav fáze (podle pořadí v pipeline); `null`, když pipeline pro fázi žádný nemá. */
export async function firstStageOfPhase(db: Executor, phase: PhaseKey): Promise<StageInfo | null> {
  return (await jobStages(db)).find((s) => s.phase === phase) ?? null;
}

/** Fáze, ve které je zakázka (po pozastavení se počítá původní fáze). */
export const effectivePhase = (row: { phase?: unknown; pausedFrom?: unknown }): PhaseKey => {
  const p = asPhase(row.phase) ?? "inquiry";
  return p === "paused" ? (asPhase(row.pausedFrom) ?? "preparation") : p;
};

/**
 * Nastavení fáze a stavu při zakládání zakázky. Zadaný stav určuje fázi; bez stavu se vezme první stav fáze
 * `inquiry` (ručně lze zakázku založit i rovnou v jiném stavu). Kontroly přechodu se při vzniku nepouštějí.
 */
export async function prepareCreate(ctx: Ctx, values: Record<string, unknown>) {
  const out = { ...values };
  const stages = await jobStages(ctx.db);
  // neplatný stav nechá projít k validaci atributu (srozumitelná chyba), fáze se pak nenastavuje
  let stage = stages.find((s) => s.id === out.stage);
  if (!stage && !out.stage)
    stage =
      stages.find((s) => s.phase === "inquiry") ??
      stages.find((s) => s.kind === "open") ??
      stages[0];
  if (stage) out.stage = stage.id;
  out.phase = stage?.phase ?? "inquiry";
  if (out.phase === "paused")
    throw new UserError("Zakázku nejde založit rovnou jako pozastavenou.");
  return out;
}

const lostWithoutReason = "Vyplňte důvod prohry.";

/** Kontroly změny stavu (i uvnitř jedné fáze), např. pravidla kvality polí „povinné od stavu“. */
async function checkStageChange(
  ctx: Ctx,
  merged: Record<string, unknown>,
  change: StageChange,
): Promise<void> {
  for (const h of stageHooksFor("job")) {
    const why = await h.checkStage?.(ctx, merged, change);
    if (why) throw new UserError(why);
  }
}

/**
 * Kontrola a odvozené sloupce při změně zakázky (`beforeUpdate` entity). Změna stavu, který patří do jiné fáze,
 * je přechod: ověří se, že je povolený, spustí se kontroly (`check`) a akce (`run`) hooků a nastaví se fáze
 * s odvozenými daty. Vrací sloupce, které entita přidá ke změně.
 */
export async function beforeJobUpdate(
  ctx: Ctx,
  before: Record<string, unknown>,
  changes: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const from = asPhase(before.phase) ?? "inquiry";
  const stageChanging = "stageId" in changes && changes.stageId !== before.stageId;
  const target = stageChanging ? await stageById(ctx.db, String(changes.stageId)) : null;
  const to = target?.phase ?? from;
  const moving = stageChanging && to !== from;

  if (from === "closed" && !moving)
    throw new UserError(
      "Zakázka je uzavřená a zamčená. Chcete-li ji upravit, znovu ji otevřete (přechod do fáze Záruka).",
    );

  if (
    "valueMinor" in changes &&
    changes.valueMinor !== before.valueMinor &&
    isPriceLocked(from, asPhase(before.pausedFrom))
  )
    throw new UserError(
      "Původní smluvní cena je od zahájení realizace zamčená. Mění se jen schválenými změnami (vícepráce a méněpráce).",
    );

  const merged = { ...before, ...changes };
  const stageChange: StageChange | null =
    stageChanging && target
      ? {
          fromStageId: String(before.stageId),
          toStageId: target.id,
          fromPhase: from,
          toPhase: to,
        }
      : null;

  if (!moving) {
    if (stageChange) await checkStageChange(ctx, merged, stageChange);
    return {};
  }

  const problem = transitionProblem(from, to, asPhase(before.pausedFrom));
  if (problem) throw new UserError(problem);

  if (to === "lost" && !String(merged.lostReason ?? "").trim())
    throw new UserError(lostWithoutReason);

  const transition: PhaseTransition = { from, to };
  const hooks = phaseHooksFor("job", transition);
  for (const h of hooks) {
    const why = await h.check?.(ctx, merged, transition);
    if (why) throw new UserError(why);
  }
  if (stageChange) await checkStageChange(ctx, merged, stageChange);
  for (const h of hooks) await h.run?.(ctx, merged, transition);

  const today = todayIso();
  const out: Record<string, unknown> = { phase: to, phaseChangedAt: new Date() };
  out.pausedFrom = to === "paused" ? from : null;
  if (to === "preparation" && (from === "inquiry" || from === "offer") && !before.wonAt)
    out.wonAt = today;
  if (to === "handover") out.handoverAt = today;
  else if (from === "handover" && to === "execution") out.handoverAt = null;
  if (to === "closed") out.closedAt = today;
  else if (from === "closed") out.closedAt = null;
  if (from === "lost") {
    out.lostReason = null;
    out.crmLostNote = null;
  }
  return out;
}

/** Údaje zakázky, jejichž změna vyžaduje přepočet odvozených hodnot CRM (vážená hodnota, hnití…). */
const CRM_TRACKED = [
  "stageId",
  "phase",
  "valueMinor",
  "sumContractMinor",
  "crmProbabilityPct",
  "crmArchivedAt",
] as const;

/**
 * Po zápisu změny: při změně stavu historie stavů a `afterStage` hooky; při změně fáze `after` hooky a záznam
 * do auditu (časová osa zakázky); nakonec `afterChange` hooky (přepočet CRM).
 */
export async function afterJobUpdate(
  ctx: Ctx,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Promise<void> {
  const from = asPhase(before.phase);
  const to = asPhase(after.phase);
  const stageMoved = before.stageId !== after.stageId;
  const id = String(after.id);
  let row = after;
  if (stageMoved) {
    // ruční pravděpodobnost zadaná touž úpravou jako stav se ponechá, dřívější přestává platit
    const keepProbability = before.crmProbabilityPct !== after.crmProbabilityPct;
    const enteredAt = await recordStageEntry(
      ctx,
      id,
      { id: String(after.stageId), phase: to },
      { keepProbability },
    );
    row = {
      ...after,
      crmStageEnteredAt: enteredAt,
      ...(keepProbability ? {} : { crmProbabilityPct: null }),
    };
  }
  const phaseMoved = !!from && !!to && from !== to;
  // změna původní ceny mění cenu zakázky v seznamu (`sum_contract_minor`), proto se souhrn přepočte i bez změny fáze
  if (!phaseMoved && before.valueMinor !== after.valueMinor) await recomputeJobSummary(ctx, id);
  if (phaseMoved) {
    const transition: PhaseTransition = { from, to };
    await recordAudit(ctx, {
      action: "phase",
      entityType: "job",
      entityId: id,
      summary: `Fáze: ${PHASES[from].label} → ${PHASES[to].label}`,
      changes: [{ field: "Fáze", old: PHASES[from].label, new: PHASES[to].label }],
    });
    for (const h of phaseHooksFor("job", transition)) await h.after?.(ctx, row, transition);
  }
  if (stageMoved) {
    const change: StageChange = {
      fromStageId: String(before.stageId),
      toStageId: String(after.stageId),
      fromPhase: from,
      toPhase: to,
    };
    for (const h of stageHooksFor("job")) await h.afterStage?.(ctx, row, change);
  }
  // fáze rozhoduje, zda seznam ukazuje cenu nabídky nebo smluvní cenu (`listPriceMinor`)
  if (phaseMoved) await recomputeJobSummary(ctx, id);
  if (CRM_TRACKED.some((k) => before[k] !== row[k])) await runJobChangeHooks(ctx, before, row);
}

/** Po založení zakázky: historie stavů, `after` hooky pro vstup do fáze (`from` je prázdné) a stavu. */
export async function afterJobCreate(ctx: Ctx, created: Record<string, unknown>): Promise<void> {
  const id = String(created.id);
  const to = asPhase(created.phase);
  const enteredAt = await recordStageEntry(
    ctx,
    id,
    { id: String(created.stageId), phase: to },
    { keepProbability: true },
  );
  const row = { ...created, crmStageEnteredAt: enteredAt };
  if (to) {
    const transition: PhaseTransition = { from: "", to };
    await ctx.db.update(job).set({ phaseChangedAt: new Date() }).where(eq(job.id, id));
    for (const h of phaseHooksFor("job", transition)) await h.after?.(ctx, row, transition);
    await recomputeJobSummary(ctx, id);
  }
  const change: StageChange = {
    fromStageId: null,
    toStageId: String(created.stageId),
    fromPhase: null,
    toPhase: to,
  };
  for (const h of stageHooksFor("job")) await h.afterStage?.(ctx, row, change);
  await runJobChangeHooks(ctx, {}, row);
  await emitEvent("zakazky.created", { id });
}

export type PhaseOption = {
  to: PhaseKey;
  label: string;
  allowed: boolean;
  /** Proč přechod nejde (nesplněné kontroly); prázdné, když jde. */
  problems: string[];
  /** Přechod vyžaduje důvod (prohráno). */
  needsReason: boolean;
};

/**
 * Pro každou fázi, do které zakázka může jít, vrátí nesplněné kontroly (stejné, jaké pustí přechod).
 * Fáze, do kterých se z aktuální nedá přejít, se nevrací.
 */
export async function previewTransitions(
  ctx: Ctx,
  row: Record<string, unknown>,
): Promise<PhaseOption[]> {
  const from = asPhase(row.phase) ?? "inquiry";
  const out: PhaseOption[] = [];
  for (const to of allowedNext(from, asPhase(row.pausedFrom))) {
    const transition: PhaseTransition = { from, to };
    const problems: string[] = [];
    if (!(await firstStageOfPhase(ctx.db, to)))
      problems.push(`V nastavení chybí stav pro fázi „${PHASES[to].label}“.`);
    for (const h of phaseHooksFor("job", transition)) {
      const why = await h.check?.(ctx, row, transition);
      if (why) problems.push(why);
    }
    out.push({
      to,
      label: PHASES[to].label,
      allowed: problems.length === 0,
      problems,
      needsReason: to === "lost",
    });
  }
  return out;
}

/** Stav pro přechod do fáze: zadaný stav, který do fáze patří, jinak první stav fáze. */
export async function stageForTransition(
  db: Executor,
  to: PhaseKey,
  stageId?: string,
): Promise<StageInfo> {
  if (stageId) {
    const s = await stageById(db, stageId);
    if (!s || s.phase !== to) throw new UserError("Zvolený stav nepatří do cílové fáze.");
    return s;
  }
  const first = await firstStageOfPhase(db, to);
  if (!first)
    throw new UserError(
      `V nastavení zakázek chybí stav pro fázi „${PHASES[to].label}“. Doplňte ho v administraci.`,
    );
  return first;
}
