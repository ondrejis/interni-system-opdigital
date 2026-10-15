import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { ServiceType } from "@rebar/core/contracts";
import { getPipeline } from "@rebar/core/config-data";
import { schema, type Executor } from "@rebar/core/db";
import { defineIngest, type ModuleDeps } from "@rebar/core/module-server";
import { sourceCtx, type Ctx } from "@rebar/core/rbac";
import { upsertContactFromLead } from "@rebar/kontakty/api";
import { createDealFromLead } from "@rebar/obchody/api";
import { leadIngestPayload, type LeadIngestPayload } from "../contract";
import { adCampaign, leadFormMapping } from "../schema";
import { LEAD_SOURCE, leadDealTitle, parseLead } from "./logic";

/*
  Příjem leadů z Meta formulářů (REK-01…05, R-15, R-44, AS-08): `POST /api/ingest/leads` (podepsané n8n, ověření podpisu,
  idempotenci přes `leadgenId` a záznam do `inbound_event` včetně selhání dělá jádro, C2). Tady je jen obsah:
  rozbor těla, mapování formuláře na pipeline/fázi/vlastníka, kontakt a firma (`kontakty/api`, bez stavu klienta) a obchod
  (`obchody/api#createDealFromLead`, idempotentní podle `leadgenId`). Vše běží v jedné transakci s označením „zpracováno“:
  selže-li cokoli, nezůstane po leadu nic kromě záznamu `failed` s důvodem a n8n (nebo správce) ho zopakuje.
*/

const SERVICES: readonly ServiceType[] = ["web", "marketing", "systemy"];

/** Kam lead padá: pipeline, fáze, vlastník a služby (mapování formuláře, nebo výchozí podle R-44). */
export type LeadTarget = {
  pipelineId: string;
  stageId: string;
  ownerId: string;
  services: ServiceType[];
  mapped: boolean;
};

/**
 * Výchozí cíl nemapovaného formuláře (R-44): pipeline „Obchody“, její první fáze a vlastník Ondřej (uživatel s rolí
 * `owner`, jinak první se systémovou rolí). `null`, když pipeline nebo vlastník chybí.
 */
export async function defaultLeadTarget(
  db: Executor,
): Promise<Omit<LeadTarget, "services" | "mapped"> | null> {
  const pipeline = await getPipeline(db, "deal", "default");
  const stage = pipeline?.stages[0];
  // vlastník agentury: uživatel s rolí `owner`, jinak první s jakoukoli systémovou rolí (`private.read` se do rolí nezapisuje, vidí ho jen vlastník)
  const [owner] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .innerJoin(schema.role, eq(schema.role.id, schema.user.roleId))
    .where(
      and(
        eq(schema.role.isSystem, true),
        eq(schema.user.active, true),
        isNull(schema.user.deletedAt),
      ),
    )
    .orderBy(sql`(${schema.role.key} = 'owner') desc`, asc(schema.user.createdAt))
    .limit(1);
  if (!pipeline || !stage || !owner) return null;
  return { pipelineId: pipeline.id, stageId: stage.id, ownerId: owner.id };
}

/**
 * Cíl leadu: mapování formuláře (pokud je úplné a fáze i vlastník ještě existují), jinak výchozí (R-44). Neúplné nebo
 * zastaralé mapování lead nezahodí, jen padá do výchozí fáze.
 */
export async function resolveLeadTarget(db: Executor, formId: string): Promise<LeadTarget | null> {
  const [m] = await db
    .select()
    .from(leadFormMapping)
    .where(and(eq(leadFormMapping.metaFormId, formId), isNull(leadFormMapping.deletedAt)));
  const services = (m?.defaultServices ?? []).filter((s): s is ServiceType =>
    (SERVICES as readonly string[]).includes(s),
  );
  if (m?.pipelineId && m.stageId && m.ownerId) {
    const [ok] = await db
      .select({ id: schema.pipelineStage.id })
      .from(schema.pipelineStage)
      .where(
        and(
          eq(schema.pipelineStage.id, m.stageId),
          eq(schema.pipelineStage.pipelineId, m.pipelineId),
          isNull(schema.pipelineStage.deletedAt),
        ),
      );
    const [owner] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(and(eq(schema.user.id, m.ownerId), eq(schema.user.active, true)));
    if (ok && owner)
      return {
        pipelineId: m.pipelineId,
        stageId: m.stageId,
        ownerId: m.ownerId,
        services,
        mapped: true,
      };
  }
  const fallback = await defaultLeadTarget(db);
  return fallback ? { ...fallback, services, mapped: false } : null;
}

/**
 * Zpracuje lead: kontakt a firma, obchod ve zvolené fázi. Idempotentní (opakované zavolání vrátí stejný obchod).
 * Vyhazuje `UserError`/chybu, když nejde určit, kam lead patří, nebo selže zápis (ingest to zapíše jako `failed`).
 */
export async function processLead(
  ctx: Ctx,
  deps: ModuleDeps,
  body: LeadIngestPayload,
): Promise<{ dealId: string; created: boolean; personId: string; companyId: string | null }> {
  const c = sourceCtx(ctx.db, "n8n", "Meta lead", ctx.requestId);
  const lead = parseLead(body);
  const target = await resolveLeadTarget(c.db, body.formId);
  if (!target)
    throw new Error(
      "Nejde určit pipeline, fázi a vlastníka leadu (chybí výchozí pipeline obchodů nebo uživatel s rolí owner).",
    );

  let campaignName = body.campaignName ?? undefined;
  if (!campaignName && body.campaignId) {
    const [camp] = await c.db
      .select({ name: adCampaign.name })
      .from(adCampaign)
      .where(eq(adCampaign.metaId, body.campaignId));
    campaignName = camp?.name;
  }

  const contact = await upsertContactFromLead(c, {
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    companyName: lead.companyName,
    ico: lead.ico,
  });
  const made = await createDealFromLead(c, deps, {
    title: leadDealTitle(lead.name, { formName: body.formName, campaignName }),
    // lead bez firmy: obchod má jen kontakt
    companyId: contact.companyId,
    personId: contact.personId,
    source: "meta",
    meta: {
      leadgenId: body.leadgenId,
      formId: body.formId,
      ...(body.campaignId ? { campaignId: body.campaignId } : {}),
      ...(campaignName ? { campaignName } : {}),
      ...(body.adsetId ? { adsetId: body.adsetId } : {}),
      ...(body.adId ? { adId: body.adId } : {}),
    },
    formMapping: {
      pipelineId: target.pipelineId,
      stageId: target.stageId,
      ownerId: target.ownerId,
      services: target.services,
    },
  });
  return { ...made, personId: contact.personId, companyId: contact.companyId };
}

/** Příchozí zdroj `leads` (n8n → `/api/ingest/leads`). Idempotence podle `leadgenId`. */
export const leadsIngest = defineIngest({
  source: LEAD_SOURCE,
  schema: leadIngestPayload,
  externalId: (b) => b.leadgenId,
  async handle(ctx, body, deps) {
    const r = await processLead(ctx, deps, body);
    return { entity: { type: "deal", id: r.dealId } };
  },
});
