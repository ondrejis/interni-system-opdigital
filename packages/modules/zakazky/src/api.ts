import {
  type BillingModel,
  type JobStatus,
  type MarketingStage,
  type ServiceType,
} from "@rebar/core/contracts";
import type { ModuleDeps } from "@rebar/core/module-server";
import type { Ctx } from "@rebar/core/rbac";
import { createJobImpl, createJobsFromWonDealImpl } from "./core/create";
import { getJobBriefImpl, getJobBriefsImpl } from "./core/briefs";
import { setMarketingStageImpl } from "./core/marketing";
import { setCurrentPhaseImpl } from "./core/phases";
import { completeJobImpl } from "./core/status";
import { listTemplatesImpl } from "./templates/list";
import type { CompleteReason } from "./shared";
import type { CreatedJob, CreateJobInput, JobFromDealRow } from "./contract";

export type { CreateJobInput, JobFromDealRow, CreatedJob } from "./contract";

/**
 * Veřejné funkce modulu „zakázky“ pro jiné moduly (`@rebar/zakazky/api`; smí je importovat jen modul se „zakazky“
 * v `dependsOn`: obchody, finance, hodiny). Podle D §2.4. Funkce běží v transakci volajícího (`ctx.db`), pokud
 * v ní je; jinak si ji otevřou. Soukromé zakázky aktérovi bez oprávnění `private.read` nikdy nevracejí.
 */

/** Stručný popis zakázky pro jiné moduly (bez soukromých údajů navíc). */
export type JobBrief = {
  id: string;
  number: string;
  title: string;
  type: ServiceType;
  companyId: string | null;
  ownerId: string | null;
  status: JobStatus;
  isPrivate: boolean;
  startDate: string | null;
  billingModel: BillingModel;
  marketingStage: MarketingStage | null;
};

/** Šablona zakázky ve stručném výpisu pro výběr v dialozích. */
export type TemplateBrief = {
  id: string;
  name: string;
  type: ServiceType;
  isDefault: boolean;
  defaultBilling: BillingModel;
};

/**
 * Založí zakázky z vyhraného obchodu v jedné transakci: pro každý řádek zakázku s fázemi ze šablony, členy, úkoly
 * (služba `tasks`), plánovanými platbami a rozdělením (služba `finance`), službou klienta (služba `clients`)
 * a událostí `project.created` (pro Disk). Cena: u jediného řádku se předvyplní hodnotou obchodu (R-39). Soukromý
 * obchod dává soukromé zakázky. Vrací zakázky v pořadí řádků; prázdné `rows` nic nezaloží.
 */
export async function createJobsFromWonDeal(
  ctx: Ctx,
  deps: ModuleDeps,
  input: {
    dealId: string;
    companyId: string;
    rows: JobFromDealRow[];
    dealValueMinor?: number | null;
  },
): Promise<{ jobs: CreatedJob[] }> {
  return createJobsFromWonDealImpl(ctx, deps, input);
}

/**
 * Ruční založení zakázky (z šablony nebo bez ní); uvnitř vytvoří fáze, členy, úkoly a platby, přidá klientovi službu
 * a vyšle `project.created`.
 */
export async function createJob(
  ctx: Ctx,
  deps: ModuleDeps,
  input: CreateJobInput,
): Promise<{ id: string; number: string }> {
  return createJobImpl(ctx, deps, input);
}

/**
 * Přepne aktuální fázi zakázky; dřívější fáze se dokončí (volitelně i jejich otevřené úkoly), pozdější se vrátí do
 * stavu Nezahájená. Vyšle `project.phase_changed` a za každou nově dokončenou fázi `project.phase_completed`.
 */
export async function setCurrentPhase(
  ctx: Ctx,
  deps: ModuleDeps,
  input: { jobId: string; phaseId: string; completeOpenTasks?: boolean },
): Promise<{ completedPhaseIds: string[] }> {
  const out = await setCurrentPhaseImpl(ctx, deps, input);
  return { completedPhaseIds: out.completedPhaseIds };
}

/**
 * Dokončí nebo zruší zakázku (`finished` a `retainer_ended` = Dokončená, `cancelled` = Zrušená); nezablokuje, jen
 * vrací, co zůstalo otevřené (úkoly, neuhrazené platby, další živá zakázka klienta). Vyšle `project.completed`.
 */
export async function completeJob(
  ctx: Ctx,
  deps: ModuleDeps,
  input: { jobId: string; reason: CompleteReason },
): Promise<{ openTasks: number; unpaidPayments: number; clientHasOtherActiveJob: boolean }> {
  const out = await completeJobImpl(ctx, deps, input);
  return {
    openTasks: out.openTasks,
    unpaidPayments: out.unpaidPayments,
    clientHasOtherActiveJob: out.clientHasOtherActiveJob,
  };
}

/**
 * Nastaví fázi marketingové zakázky (volá `finance` po vyhodnocení úvodní fáze a po rozhodnutí klienta). Stav `retainer`
 * přesune zakázku do fáze s rolí `retainer` (dřívější fáze se dokončí); `ended` jen zapíše stav, zakázku pak
 * ukončí volající přes `completeJob({ reason: "retainer_ended" })`.
 */
export async function setMarketingStage(
  ctx: Ctx,
  jobId: string,
  stage: MarketingStage,
): Promise<void> {
  return setMarketingStageImpl(ctx, jobId, stage);
}

/** Stručný popis zakázky, nebo `null`, když neexistuje nebo ji aktér nesmí vidět. */
export async function getJobBrief(ctx: Ctx, jobId: string): Promise<JobBrief | null> {
  return getJobBriefImpl(ctx, jobId);
}

/** Stručné popisy více zakázek najednou (neviditelné a neexistující se vynechají). */
export async function getJobBriefs(ctx: Ctx, jobIds: string[]): Promise<JobBrief[]> {
  return getJobBriefsImpl(ctx, jobIds);
}

/** Šablony zakázek (volitelně jen pro jeden typ); archivované se nevracejí. */
export async function listTemplates(ctx: Ctx, type?: ServiceType): Promise<TemplateBrief[]> {
  return listTemplatesImpl(ctx, type);
}
