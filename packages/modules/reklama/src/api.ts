/*
  Veřejné funkce modulu „reklama“ pro jiné moduly (`@rebar/reklama/api`; smí je importovat jen modul, který má „reklama“
  v `dependsOn`) a pro UI (REK-B, `import type` a čisté výpočty). Podle D §2.4. Vedle přehledu výkonu jsou tu čisté
  funkce bez databáze (CPL, náklad na vyhraný obchod, období) a typy výstupů příkazů z `contract.ts`.
*/
import type { Ctx } from "@rebar/core/rbac";
import type { AdsOverviewOutput, Period } from "./contract";
import { metricsFor } from "./meta/queries";

export {
  REWRITE_DAYS,
  buildMetrics,
  cplMinor,
  ctrPct,
  fillDaily,
  periodFromPreset,
  ratioMinor,
  rewriteWindow,
  sumMetricsInputs,
} from "./meta/logic";
export type { MetricsInput, PeriodPreset } from "./meta/logic";
export type {
  AccountDetailOutput,
  AccountRow,
  AccountsListOutput,
  AdRow,
  AdSetRow,
  AdsOverviewOutput,
  CampaignDetailOutput,
  CampaignLead,
  CampaignRow,
  ConnectionStatus,
  ConnectionTestOutput,
  DailyPoint,
  LeadIngestPayload,
  MappingRow,
  MappingsOutput,
  MetricsOutput,
  Period,
  PerformanceMetrics,
  RecentLead,
  SeenForm,
  SyncSummary,
} from "./contract";

/**
 * Výkon reklamy klienta (kampaně jeho marketingových zakázek a reklamní účty klienta) nebo jedné zakázky za období:
 * útrata, leady Meta × OPSYS, CPL, vyhrané obchody a náklad na vyhraný obchod, graf po dnech a seznam kampaní.
 * Respektuje soukromé obchody aktéra; oprávnění `reklama.read` kontroluje volající.
 */
export function adsOverview(
  ctx: Ctx,
  scope: { companyId: string } | { jobId: string },
  period: Period,
): Promise<AdsOverviewOutput> {
  return metricsFor(ctx, { scope, period });
}
