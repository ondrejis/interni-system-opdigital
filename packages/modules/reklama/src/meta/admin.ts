import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { z } from "zod";
import { auditChange, recordAudit } from "@rebar/core/audit";
import { schema } from "@rebar/core/db";
import { createCredentialStore } from "@rebar/core/integrations";
import type { ModuleDeps } from "@rebar/core/module-server";
import { inTx, NotFoundError, UserError, type Ctx } from "@rebar/core/rbac";
import type {
  ConnectionStatus,
  ConnectionTestOutput,
  MappingRow,
  MappingsOutput,
  RecentLead,
  SeenForm,
  accountSetOwnerInput,
  mappingSaveInput,
} from "../contract";
import { adAccount, adCampaign, leadFormMapping } from "../schema";
import { getMetaClient, markCredentialFailure, type MetaCredentialData } from "./connection";
import { defaultLeadTarget } from "./ingest";
import { LEAD_SOURCE } from "./logic";
import { loadJobs } from "./queries";

/*
  Zápisy a čtení správy reklamy: vlastník účtu (REK-06), přiřazení kampaně zakázce, mapování formulářů (REK-04, R-44),
  napojení na Meta (token) a přehled příchozích leadů včetně selhaných (REK-05). Každá změna jde do historie (audit).
*/

/** Nastaví, komu účet patří: agentuře, nebo klientovi (pak je povinný klient). */
export async function setAccountOwner(
  ctx: Ctx,
  input: z.output<typeof accountSetOwnerInput>,
): Promise<void> {
  await inTx(ctx, async (c) => {
    const [before] = await c.db.select().from(adAccount).where(eq(adAccount.id, input.accountId));
    if (!before || before.deletedAt) throw new NotFoundError();
    const companyId = input.ownerKind === "agency" ? null : (input.companyId ?? null);
    if (companyId) {
      const rows = (await c.db.execute(
        sql`select 1 as ok from company where id = ${companyId}::uuid and deleted_at is null`,
      )) as unknown as unknown[];
      if (!rows.length) throw new UserError("Vybraný klient neexistuje.");
    }
    await c.db
      .update(adAccount)
      .set({ ownerKind: input.ownerKind, companyId, updatedBy: c.actor.userId })
      .where(eq(adAccount.id, before.id));
    await auditChange(c, {
      entityType: "ad_account",
      entityId: before.id,
      entityTitle: before.name,
      before: { ownerKind: before.ownerKind, companyId: before.companyId },
      after: { ownerKind: input.ownerKind, companyId },
      summary: "Změněn vlastník reklamního účtu",
    });
  });
}

/** Zapne nebo vypne synchronizaci účtu. */
export async function setAccountActive(
  ctx: Ctx,
  input: { accountId: string; active: boolean },
): Promise<void> {
  await inTx(ctx, async (c) => {
    const [before] = await c.db.select().from(adAccount).where(eq(adAccount.id, input.accountId));
    if (!before || before.deletedAt) throw new NotFoundError();
    await c.db
      .update(adAccount)
      .set({ active: input.active, updatedBy: c.actor.userId })
      .where(eq(adAccount.id, before.id));
    await auditChange(c, {
      entityType: "ad_account",
      entityId: before.id,
      entityTitle: before.name,
      before: { active: before.active },
      after: { active: input.active },
    });
  });
}

/**
 * Přiřadí kampaň marketingové zakázce (nebo přiřazení zruší, `jobId = null`). Zakázka musí existovat, být viditelná
 * aktérovi a mít typ `marketing`; je-li účet klientův, musí zakázka patřit témuž klientovi (čísla pak sedí u zakázky
 * i na kartě klienta).
 */
export async function assignCampaignJob(
  ctx: Ctx,
  input: { campaignId: string; jobId: string | null },
): Promise<void> {
  await inTx(ctx, async (c) => {
    const [row] = await c.db
      .select({ campaign: adCampaign, account: adAccount })
      .from(adCampaign)
      .innerJoin(adAccount, eq(adAccount.id, adCampaign.accountId))
      .where(and(eq(adCampaign.id, input.campaignId), isNull(adCampaign.deletedAt)));
    if (!row) throw new NotFoundError();
    if (input.jobId) {
      const job = (await loadJobs(c, [input.jobId])).get(input.jobId);
      if (!job) throw new UserError("Zakázka neexistuje.");
      if (job.type !== "marketing")
        throw new UserError("Kampaň jde přiřadit jen marketingové zakázce.");
      if (row.account.ownerKind === "client" && row.account.companyId && job.companyId !== row.account.companyId)
        throw new UserError("Zakázka patří jinému klientovi, než kterému patří reklamní účet.");
    }
    await c.db
      .update(adCampaign)
      .set({ jobId: input.jobId, updatedBy: c.actor.userId })
      .where(eq(adCampaign.id, row.campaign.id));
    await auditChange(c, {
      entityType: "ad_campaign",
      entityId: row.campaign.id,
      entityTitle: row.campaign.name,
      before: { jobId: row.campaign.jobId },
      after: { jobId: input.jobId },
      summary: input.jobId ? "Kampaň přiřazena zakázce" : "Přiřazení kampaně zakázce zrušeno",
      context: input.jobId ? { jobId: input.jobId } : { jobId: row.campaign.jobId },
    });
  });
}

/* ---------- mapování formulářů ---------- */

const toMapping = (m: typeof leadFormMapping.$inferSelect): MappingRow => ({
  id: m.id,
  metaFormId: m.metaFormId,
  name: m.name,
  pipelineId: m.pipelineId,
  stageId: m.stageId,
  ownerId: m.ownerId,
  defaultServices: m.defaultServices,
});

/** Formuláře, ze kterých už přišel lead (podle `inbound_event`), s počtem leadů a příznakem „namapováno“. */
async function seenForms(ctx: Ctx, mapped: ReadonlySet<string>): Promise<SeenForm[]> {
  const rows = (await ctx.db.execute(sql`
    select payload->>'formId' as "formId",
           max(payload->>'formName') as "name",
           count(*)::int as "leads"
      from inbound_event
     where source = ${LEAD_SOURCE} and payload ? 'formId'
     group by payload->>'formId'
     order by max(received_at) desc
     limit 100`)) as unknown as { formId: string; name: string | null; leads: number }[];
  return rows.map((r) => ({ ...r, mapped: mapped.has(r.formId) }));
}

/** Mapování formulářů, formuláře bez mapování a výchozí cíl nemapovaných (R-44). */
export async function listMappings(ctx: Ctx): Promise<MappingsOutput> {
  const rows = await ctx.db
    .select()
    .from(leadFormMapping)
    .where(isNull(leadFormMapping.deletedAt))
    .orderBy(leadFormMapping.name);
  const target = await defaultLeadTarget(ctx.db);
  return {
    mappings: rows.map(toMapping),
    seenForms: await seenForms(ctx, new Set(rows.map((r) => r.metaFormId))),
    fallback: {
      pipelineId: target?.pipelineId ?? null,
      stageId: target?.stageId ?? null,
      ownerId: target?.ownerId ?? null,
    },
  };
}

/** Uloží mapování (nové, nebo úpravu); fáze musí patřit do vybrané pipeline obchodů, vlastník musí být aktivní. */
export async function saveMapping(
  ctx: Ctx,
  input: z.output<typeof mappingSaveInput>,
): Promise<MappingRow> {
  return inTx(ctx, async (c) => {
    const [stage] = await c.db
      .select({ pipelineId: schema.pipelineStage.pipelineId, entityType: schema.pipeline.entityType })
      .from(schema.pipelineStage)
      .innerJoin(schema.pipeline, eq(schema.pipeline.id, schema.pipelineStage.pipelineId))
      .where(and(eq(schema.pipelineStage.id, input.stageId), isNull(schema.pipelineStage.deletedAt)));
    if (!stage || stage.pipelineId !== input.pipelineId || stage.entityType !== "deal")
      throw new UserError("Fáze nepatří do vybrané pipeline obchodů.");
    const [owner] = await c.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(and(eq(schema.user.id, input.ownerId), eq(schema.user.active, true)));
    if (!owner) throw new UserError("Vlastník leadů musí být aktivní uživatel.");

    const values = {
      metaFormId: input.metaFormId,
      name: input.name,
      pipelineId: input.pipelineId,
      stageId: input.stageId,
      ownerId: input.ownerId,
      defaultServices: input.defaultServices,
    };
    const [clash] = await c.db
      .select({ id: leadFormMapping.id })
      .from(leadFormMapping)
      .where(and(eq(leadFormMapping.metaFormId, input.metaFormId), isNull(leadFormMapping.deletedAt)));
    if (clash && clash.id !== input.id)
      throw new UserError("Tento formulář už má mapování, upravte existující.");

    if (input.id) {
      const [before] = await c.db
        .select()
        .from(leadFormMapping)
        .where(and(eq(leadFormMapping.id, input.id), isNull(leadFormMapping.deletedAt)));
      if (!before) throw new NotFoundError();
      const [row] = await c.db
        .update(leadFormMapping)
        .set({ ...values, updatedBy: c.actor.userId })
        .where(eq(leadFormMapping.id, input.id))
        .returning();
      await auditChange(c, {
        entityType: "lead_form_mapping",
        entityId: before.id,
        entityTitle: input.name,
        before: { ...toMapping(before) },
        after: { ...toMapping(row!) },
        summary: "Změněno mapování formuláře",
      });
      return toMapping(row!);
    }
    const [row] = await c.db
      .insert(leadFormMapping)
      .values({ ...values, createdBy: c.actor.userId, updatedBy: c.actor.userId })
      .returning();
    await recordAudit(c, {
      action: "create",
      entityType: "lead_form_mapping",
      entityId: row!.id,
      entityTitle: input.name,
      summary: "Založeno mapování formuláře",
    });
    return toMapping(row!);
  });
}

/** Smaže mapování (formulář pak padá do výchozí pipeline, první fáze a vlastníka Ondřej). */
export async function deleteMapping(ctx: Ctx, id: string): Promise<void> {
  await inTx(ctx, async (c) => {
    const [row] = await c.db
      .update(leadFormMapping)
      .set({ deletedAt: new Date(), deletedBy: c.actor.userId })
      .where(and(eq(leadFormMapping.id, id), isNull(leadFormMapping.deletedAt)))
      .returning();
    if (!row) throw new NotFoundError();
    await recordAudit(c, {
      action: "delete",
      entityType: "lead_form_mapping",
      entityId: row.id,
      entityTitle: row.name,
      summary: "Smazáno mapování formuláře",
    });
  });
}

/* ---------- napojení ---------- */

/** Stav napojení na Meta (bez obsahu tajemství). */
export async function connectionStatus(
  ctx: Ctx,
  deps: Pick<ModuleDeps, "cipher">,
): Promise<ConnectionStatus> {
  const info = (await createCredentialStore(deps.cipher).list(ctx)).find(
    (c) => c.provider === "meta" && c.userId === null,
  );
  return info
    ? { connected: true, status: info.status, updatedAt: info.updatedAt }
    : { connected: false, status: null, updatedAt: null };
}

/** Uloží přístupový token Meta (šifrovaně); starý přepíše. Token se nikde nevrací ani nelogují. */
export async function saveConnection(
  ctx: Ctx,
  deps: Pick<ModuleDeps, "cipher">,
  accessToken: string,
): Promise<void> {
  const data: MetaCredentialData = { accessToken };
  await createCredentialStore(deps.cipher).save(ctx, { provider: "meta", data });
}

/** Odpojí Meta (smaže token); načtená data zůstanou. */
export async function removeConnection(ctx: Ctx, deps: Pick<ModuleDeps, "cipher">): Promise<void> {
  await createCredentialStore(deps.cipher).remove(ctx, "meta");
}

/** Vyzkouší token: načte účty z Meta (nic neukládá). Chyba se vrací jako výsledek, ne výjimka. */
export async function testConnection(
  ctx: Ctx,
  deps: Pick<ModuleDeps, "cipher">,
): Promise<ConnectionTestOutput> {
  try {
    const client = await getMetaClient(ctx.db, deps);
    const accounts = await client.listAdAccounts();
    await createCredentialStore(deps.cipher).setStatus(ctx.db, "meta", null, "ok");
    return { ok: true, accounts: accounts.length, message: null };
  } catch (err) {
    await markCredentialFailure(ctx.db, deps, err);
    return {
      ok: false,
      accounts: 0,
      message: err instanceof Error ? err.message : "Spojení s Meta se nepodařilo.",
    };
  }
}

/** Poslední příchozí leady včetně selhaných s důvodem (REK-05). */
export async function recentLeads(ctx: Ctx, limit: number): Promise<RecentLead[]> {
  const rows = await ctx.db
    .select({
      id: schema.inboundEvent.id,
      externalId: schema.inboundEvent.externalId,
      status: schema.inboundEvent.status,
      error: schema.inboundEvent.error,
      receivedAt: schema.inboundEvent.receivedAt,
      entityId: schema.inboundEvent.entityId,
    })
    .from(schema.inboundEvent)
    .where(eq(schema.inboundEvent.source, LEAD_SOURCE))
    .orderBy(desc(schema.inboundEvent.receivedAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    leadgenId: r.externalId,
    status: r.status,
    error: r.error,
    receivedAt: r.receivedAt.toISOString(),
    dealId: r.entityId,
  }));
}
