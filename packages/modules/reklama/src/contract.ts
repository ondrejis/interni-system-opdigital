import { z } from "zod";
import { AD_LEVELS, AD_OWNER_KINDS } from "./schema";

/*
  Kontrakt příkazů modulu „reklama“ (REK-A, M1): zod vstupy všech příkazů `reklama.*`, tvary výstupů (typy) a schéma
  příchozího leadu z n8n (`POST /api/ingest/leads`). Čte ho UI (REK-B, jen `import type` a zod vstupy) i ostatní moduly
  (typy přes `api.ts`). Peníze jsou v haléřích (měna účtu, u agentury CZK), data `YYYY-MM-DD`, časy ISO 8601, id UUID.
  Metriky: CPL = útrata / leady Meta; CPL OPSYS = útrata / obchody se zdrojem Meta; náklad na vyhraný obchod = útrata /
  vyhrané obchody z leadů kampaně (REK-10). Čisté výpočty jsou v `meta/logic.ts` (export z `api.ts`).
*/

const id = z.uuid();
const isoDate = z.iso.date();

/* ---------- společné hodnoty ---------- */

export const adOwnerKind = z.enum(AD_OWNER_KINDS);
export const adLevel = z.enum(AD_LEVELS);

/** Období (včetně obou konců). Předvolby 7, 30, 90 dní a měsíc skládá UI přes `periodFromPreset` z `api.ts`. */
export const period = z
  .object({ from: isoDate, to: isoDate })
  .refine((p) => p.from <= p.to, { message: "Začátek období musí být před koncem." });
export type Period = z.output<typeof period>;

/** Čísla výkonu za období (útrata, zobrazení, kliky, leady Meta × OPSYS, vyhrané obchody). */
export type PerformanceMetrics = {
  spendMinor: number;
  impressions: number;
  clicks: number;
  /** Prokliky v procentech zobrazení; `null` bez zobrazení. */
  ctrPct: number | null;
  /** Leady podle Mety (denní statistiky). */
  leadsMeta: number;
  /** Obchody se zdrojem Meta v OPSYS (lead, který opravdu dorazil). */
  leadsOpsys: number;
  /** Rozdíl `leadsMeta - leadsOpsys`: ztracené leady (kladné = Meta jich napočítala víc). */
  leadsLost: number;
  /** Útrata / leady Meta (haléře); `null` bez leadů. */
  cplMinor: number | null;
  /** Útrata / leady OPSYS (haléře); `null` bez leadů. */
  cplOpsysMinor: number | null;
  wonDeals: number;
  /** Útrata / vyhrané obchody (haléře); `null` bez výher. */
  costPerWonMinor: number | null;
};

/** Jeden den grafu útraty a leadů. */
export type DailyPoint = {
  date: string;
  spendMinor: number;
  impressions: number;
  clicks: number;
  leadsMeta: number;
  leadsOpsys: number;
};

/* ---------- účty ---------- */

export const accountsListInput = z.object({ includeInactive: z.boolean().optional() });
/** Řádek seznamu účtů (REK-11): název, komu patří, poslední synchronizace, útrata tento měsíc. */
export type AccountRow = {
  id: string;
  metaId: string;
  name: string;
  ownerKind: (typeof AD_OWNER_KINDS)[number];
  companyId: string | null;
  companyName: string | null;
  currency: string | null;
  timezone: string | null;
  active: boolean;
  lastSyncAt: string | null;
  /** Text poslední chyby synchronizace; `null` = poslední běh dopadl dobře. */
  lastSyncError: string | null;
  campaignCount: number;
  spendThisMonthMinor: number;
};
export type AccountsListOutput = { accounts: AccountRow[]; connected: boolean };

export const accountSetOwnerInput = z
  .object({ accountId: id, ownerKind: adOwnerKind, companyId: id.nullish() })
  .refine((v) => v.ownerKind === "agency" || !!v.companyId, {
    message: "U účtu klienta vyberte klienta.",
    path: ["companyId"],
  });
export const accountSetActiveInput = z.object({ accountId: id, active: z.boolean() });

export const accountDetailInput = z.object({ accountId: id, period });
/** Kampaň s výkonem za období (řádek tabulky u účtu, REK-08). */
export type CampaignRow = {
  id: string;
  metaId: string;
  accountId: string;
  name: string;
  objective: string | null;
  status: string | null;
  jobId: string | null;
  jobTitle: string | null;
  metrics: PerformanceMetrics;
};
export type AccountDetailOutput = {
  account: AccountRow;
  campaigns: CampaignRow[];
  totals: PerformanceMetrics;
  daily: DailyPoint[];
};

/* ---------- kampaně ---------- */

export const campaignDetailInput = z.object({ campaignId: id, period });
/** Reklama s výkonem. */
export type AdRow = {
  id: string;
  metaId: string;
  name: string;
  status: string | null;
  creativeUrl: string | null;
  metrics: PerformanceMetrics;
};
/** Sada reklam s výkonem a reklamami. */
export type AdSetRow = {
  id: string;
  metaId: string;
  name: string;
  status: string | null;
  metrics: PerformanceMetrics;
  ads: AdRow[];
};
/** Lead (obchod se zdrojem Meta) patřící ke kampani. */
export type CampaignLead = {
  dealId: string;
  title: string;
  createdAt: string;
  result: "open" | "won" | "lost";
  stageId: string;
  companyId: string | null;
};
export type CampaignDetailOutput = {
  campaign: CampaignRow;
  account: { id: string; name: string; currency: string | null };
  adSets: AdSetRow[];
  totals: PerformanceMetrics;
  daily: DailyPoint[];
  leads: CampaignLead[];
};

export const campaignAssignJobInput = z.object({ campaignId: id, jobId: id.nullable() });

/* ---------- metriky pro karty a widgety ---------- */

/** Rozsah výběru kampaní: účet, klient (kampaně jeho zakázek a účty klienta), zakázka, nebo všechno. */
export const metricsScope = z.object({
  accountId: id.optional(),
  companyId: id.optional(),
  jobId: id.optional(),
});
export const metricsInput = z.object({ scope: metricsScope.optional(), period });
export type MetricsOutput = { totals: PerformanceMetrics; daily: DailyPoint[]; currency: string };

export const forClientInput = z.object({ companyId: id, period });
export const forJobInput = z.object({ jobId: id, period });
/** Záložka „Reklama“ na kartě klienta a v detailu marketingové zakázky. */
export type AdsOverviewOutput = {
  totals: PerformanceMetrics;
  daily: DailyPoint[];
  campaigns: CampaignRow[];
  currency: string;
};

/* ---------- synchronizace ---------- */

export const syncInput = z.object({ accountId: id.optional() });
/** Výsledek synchronizace (ruční obnova i denní úloha). */
export type SyncSummary = {
  accounts: number;
  campaigns: number;
  adSets: number;
  ads: number;
  insightRows: number;
  /** Od kdy se statistiky přepsaly (posledních 7 dní). */
  rewrittenFrom: string;
  errors: { accountId: string | null; message: string }[];
};

/* ---------- napojení (token) ---------- */

export const connectionSaveInput = z.object({ accessToken: z.string().trim().min(10).max(2000) });
/** Stav napojení na Meta; token se nikdy nevrací. */
export type ConnectionStatus = {
  connected: boolean;
  status: "ok" | "reauth" | "error" | null;
  updatedAt: string | null;
};
export type ConnectionTestOutput = { ok: boolean; accounts: number; message: string | null };

/* ---------- mapování formulářů ---------- */

export const mappingSaveInput = z.object({
  id: id.optional(),
  metaFormId: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1, "Vyplňte název formuláře.").max(160),
  pipelineId: id,
  stageId: id,
  ownerId: id,
  defaultServices: z.array(z.enum(["web", "marketing", "systemy"])).max(3).default([]),
});
export const mappingDeleteInput = z.object({ id });
/** Mapování formuláře na pipeline, fázi a vlastníka. */
export type MappingRow = {
  id: string;
  metaFormId: string;
  name: string;
  pipelineId: string | null;
  stageId: string | null;
  ownerId: string | null;
  defaultServices: string[];
};
/** Formulář, ze kterého už přišel lead (nabídka při zakládání mapování), s počtem leadů a zda je namapovaný. */
export type SeenForm = { formId: string; name: string | null; leads: number; mapped: boolean };
export type MappingsOutput = {
  mappings: MappingRow[];
  seenForms: SeenForm[];
  /** Co se použije u nemapovaného formuláře (R-44): výchozí pipeline, první fáze, vlastník Ondřej. */
  fallback: { pipelineId: string | null; stageId: string | null; ownerId: string | null };
};

export const recentLeadsInput = z.object({ limit: z.number().int().min(1).max(100).default(30) });
/** Poslední příchozí leady včetně selhaných (REK-05). */
export type RecentLead = {
  id: string;
  leadgenId: string;
  status: "received" | "processed" | "failed";
  error: string | null;
  receivedAt: string;
  dealId: string | null;
};

/* ---------- příchozí lead z n8n ---------- */

const metaId = z.union([z.string(), z.number()]).transform((v) => String(v).trim());
const optId = metaId.optional().nullable();
const optText = z.string().trim().max(500).optional().nullable();

/**
 * Tělo `POST /api/ingest/leads` (n8n po události Meta „leadgen“ a stažení leadu z Graph API). Povinné je `leadgenId`
 * (idempotence) a `formId`; údaje o člověku buď ve tvaru Meta `fieldData` (`[{name, values}]`), nebo plochou mapou
 * `fields`, nebo přímo (`email`, `phone`…). Nepoznaná pole se ignorují, celé tělo se ale ukládá do `inbound_event`.
 */
export const leadIngestPayload = z.object({
  leadgenId: metaId.pipe(z.string().min(1).max(100)),
  formId: metaId.pipe(z.string().min(1).max(100)),
  formName: optText,
  pageId: optId,
  createdTime: z.union([z.string(), z.number()]).optional().nullable(),
  campaignId: optId,
  campaignName: optText,
  adsetId: optId,
  adsetName: optText,
  adId: optId,
  adName: optText,
  fieldData: z
    .array(
      z.object({
        name: z.string(),
        values: z.union([z.array(z.union([z.string(), z.number()])), z.string(), z.number()]),
      }),
    )
    .max(100)
    .optional(),
  fields: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).optional(),
  fullName: optText,
  firstName: optText,
  lastName: optText,
  email: optText,
  phone: optText,
  companyName: optText,
  ico: optText,
});
export type LeadIngestPayload = z.output<typeof leadIngestPayload>;
