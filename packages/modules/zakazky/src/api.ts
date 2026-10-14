import {
  NotImplementedError,
  type BillingModel,
  type JobStatus,
  type MarketingStage,
  type RetainerSetup,
  type ServiceType,
  type SplitRuleInput,
} from "@rebar/core/contracts";
import type { ModuleDeps } from "@rebar/core/module-server";
import type { Ctx } from "@rebar/core/rbac";

/**
 * Veřejné funkce modulu „zakázky“ pro jiné moduly (`@rebar/zakazky/api`; smí je importovat jen modul se „zakazky“
 * v `dependsOn`: obchody, finance, hodiny). Podle D §2.4; těla doplní ZAK-A, dokud neexistují, vyhazují
 * `NotImplementedError`.
 */

/** Jedna zakázka zakládaná z vyhraného obchodu (řádek dialogu „Založit zakázky“). */
export type JobFromDealRow = {
  type: ServiceType;
  templateId: string | null;
  title: string;
  startDate: string;
  ownerId: string;
  memberIds: string[];
  billingModel?: BillingModel;
  split?: SplitRuleInput[];
  retainer?: RetainerSetup;
};

/** Vstup ručního založení zakázky (z šablony nebo bez ní). */
export type CreateJobInput = {
  title: string;
  type: ServiceType;
  companyId: string;
  ownerId: string;
  memberIds?: string[];
  templateId?: string | null;
  startDate?: string;
  dueDate?: string | null;
  billingModel?: BillingModel;
  split?: SplitRuleInput[];
  retainer?: RetainerSetup;
  dealId?: string | null;
  description?: string | null;
  isPrivate?: boolean;
};

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

/** Založí zakázky z vyhraného obchodu v jedné transakci (fáze, členové, služby `tasks`/`finance`/`clients`, `project.created`). */
export async function createJobsFromWonDeal(
  _ctx: Ctx,
  _deps: ModuleDeps,
  _input: {
    dealId: string;
    companyId: string;
    rows: JobFromDealRow[];
    dealValueMinor?: number | null;
  },
): Promise<{ jobs: { id: string; number: string; type: ServiceType }[] }> {
  throw new NotImplementedError("zakazky.api.createJobsFromWonDeal");
}

/** Ruční založení zakázky (z šablony); uvnitř vytvoří fáze, členy, úkoly a platby a vyšle `project.created`. */
export async function createJob(
  _ctx: Ctx,
  _deps: ModuleDeps,
  _input: CreateJobInput,
): Promise<{ id: string; number: string }> {
  throw new NotImplementedError("zakazky.api.createJob");
}

/** Přepne aktuální fázi zakázky; předchozí fáze se uzavřou (volitelně i jejich otevřené úkoly). */
export async function setCurrentPhase(
  _ctx: Ctx,
  _deps: ModuleDeps,
  _input: { jobId: string; phaseId: string; completeOpenTasks?: boolean },
): Promise<{ completedPhaseIds: string[] }> {
  throw new NotImplementedError("zakazky.api.setCurrentPhase");
}

/** Dokončí nebo zruší zakázku; vrací, co zůstalo otevřené (úkoly, neuhrazené platby, další aktivní zakázka klienta). */
export async function completeJob(
  _ctx: Ctx,
  _deps: ModuleDeps,
  _input: { jobId: string; reason: "finished" | "retainer_ended" | "cancelled" },
): Promise<{ openTasks: number; unpaidPayments: number; clientHasOtherActiveJob: boolean }> {
  throw new NotImplementedError("zakazky.api.completeJob");
}

/** Nastaví fázi marketingové zakázky (volá finance po vyhodnocení úvodní fáze a po rozhodnutí klienta). */
export async function setMarketingStage(
  _ctx: Ctx,
  _jobId: string,
  _stage: MarketingStage,
): Promise<void> {
  throw new NotImplementedError("zakazky.api.setMarketingStage");
}

/** Stručný popis zakázky, nebo `null`, když neexistuje nebo ji aktér nesmí vidět. */
export async function getJobBrief(_ctx: Ctx, _jobId: string): Promise<JobBrief | null> {
  throw new NotImplementedError("zakazky.api.getJobBrief");
}

/** Šablony zakázek (volitelně jen pro jeden typ). */
export async function listTemplates(
  _ctx: Ctx,
  _type?: ServiceType,
): Promise<
  {
    id: string;
    name: string;
    type: ServiceType;
    isDefault: boolean;
    defaultBilling: BillingModel;
  }[]
> {
  throw new NotImplementedError("zakazky.api.listTemplates");
}
