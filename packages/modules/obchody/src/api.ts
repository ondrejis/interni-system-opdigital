import { NotImplementedError, type ServiceType } from "@rebar/core/contracts";
import type { ModuleDeps } from "@rebar/core/module-server";
import type { Ctx } from "@rebar/core/rbac";

/**
 * Veřejné funkce modulu „obchody“ pro jiné moduly (`@rebar/obchody/api`; smí je importovat jen modul s „obchody“
 * v `dependsOn`, dnes `reklama`). Podle D §2.4; těla doplní OBC-A.
 */

/** Vstup `createDealFromLead`: lead z Meta formuláře a mapování formuláře na pipeline. */
export type CreateDealFromLeadInput = {
  title: string;
  companyId: string;
  personId: string;
  source: "meta";
  meta: { campaignId?: string; adsetId?: string; adId?: string; leadgenId: string; formId: string };
  formMapping: { pipelineId: string; stageId: string; ownerId: string; services: ServiceType[] };
};

/**
 * Založí obchod z příchozího leadu (idempotentně podle `meta.leadgenId`): `created=false`, když obchod
 * pro stejný lead už existuje. Volá `reklama` z ingestu `leads`.
 */
export async function createDealFromLead(
  _ctx: Ctx,
  _deps: ModuleDeps,
  _input: CreateDealFromLeadInput,
): Promise<{ dealId: string; created: boolean }> {
  throw new NotImplementedError("obchody.api.createDealFromLead");
}
