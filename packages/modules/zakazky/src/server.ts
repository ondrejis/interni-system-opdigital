import { defineModuleServer, mergeServers } from "@rebar/core/module-server";
import { area as lifecycle } from "./lifecycle";
import { area as templates } from "./templates";
import { commands } from "./commands";
import { deleteBlockers } from "./delete-blockers";
import { and, eq, or, sql } from "drizzle-orm";
import { defineEntity } from "@rebar/core/entities";
import { nextNumber } from "@rebar/core/numbering";
import { PHASE_CHOICES } from "./lifecycle/phases";
import {
  JOB_PIPELINE,
  afterJobCreate,
  afterJobUpdate,
  beforeJobUpdate,
  prepareCreate,
} from "./lifecycle/transitions";
import { job, jobMember } from "./schema";

export { JOB_PIPELINE } from "./lifecycle/transitions";

/** Číselník důvodů prohry (seed v manifestu). */
export const LOST_REASON_LOOKUP = "job.lost_reason";
/** Číselník zdrojů obchodu (odkud zakázka přišla; seed v manifestu). */
export const SOURCE_LOOKUP = "job.source";
const FINANCE = "zakazky.finance";

const COLOR_CHOICES = [
  ["gray", "Šedá"],
  ["blue", "Modrá"],
  ["green", "Zelená"],
  ["orange", "Oranžová"],
  ["red", "Červená"],
  ["purple", "Fialová"],
  ["pink", "Růžová"],
  ["teal", "Tyrkysová"],
  ["yellow", "Žlutá"],
  ["indigo", "Indigo"],
].map(([value, label]) => ({ value: value!, label: label!, color: value! }));

/** Zakázka. Vedoucí a členové týmu ji vidí i při oprávnění „jen moje“. */
export const jobEntity = defineEntity({
  key: "job",
  listPath: "/zakazky",
  module: "zakazky",
  label: { one: "Zakázka", many: "Zakázky" },
  table: job,
  titleKey: "title",
  statusKey: "stage",
  permissions: { read: "zakazky.read", write: "zakazky.write" },
  ownerColumns: [job.managerId],
  scope: (ctx) => {
    const me = ctx.actor.userId;
    if (!me) return sql`false`;
    return or(
      eq(job.managerId, me),
      sql`exists (select 1 from ${jobMember} where ${jobMember.jobId} = ${job.id} and ${jobMember.userId} = ${me})`,
    )!;
  },
  owners: async (db, id) => {
    const [row] = await db
      .select({ manager: job.managerId })
      .from(job)
      .where(and(eq(job.id, id), sql`${job.deletedAt} is null`));
    if (!row) return null;
    const members = await db
      .select({ userId: jobMember.userId })
      .from(jobMember)
      .where(eq(jobMember.jobId, id));
    return [row.manager, ...members.map((m) => m.userId)];
  },
  ownerDefaults: (ctx) => ({ manager: ctx.actor.userId }),
  beforeCreate: async (ctx, values) => {
    const out = await prepareCreate(ctx, values);
    // číslo zakázky je unikátní i mezi smazanými; obsazené číslo (import, ruční zápis) se v řadě přeskočí
    out.number = await nextNumber(ctx.db, "zakazky.cislo", new Date(), {
      isTaken: async (n) =>
        (await ctx.db.select({ id: job.id }).from(job).where(eq(job.number, n)).limit(1)).length >
        0,
    });
    return out;
  },
  beforeUpdate: beforeJobUpdate,
  afterCreate: afterJobCreate,
  afterUpdate: afterJobUpdate,
  attributes: [
    {
      key: "number",
      label: "Číslo",
      type: "text",
      field: "number",
      readonly: true,
      width: 120,
      defaultVisible: true,
    },
    {
      key: "title",
      label: "Název",
      type: "text",
      field: "title",
      required: true,
      width: 280,
      defaultVisible: true,
    },
    {
      key: "company",
      label: "Zákazník",
      type: "record",
      field: "companyId",
      record: { entityType: "company" },
      required: true,
      width: 220,
      defaultVisible: true,
    },
    {
      key: "phase",
      label: "Fáze",
      type: "select",
      field: "phase",
      choices: PHASE_CHOICES,
      readonly: true,
      width: 130,
      defaultVisible: true,
    },
    {
      key: "stage",
      label: "Stav",
      type: "status",
      field: "stageId",
      pipeline: JOB_PIPELINE,
      required: true,
      width: 150,
      defaultVisible: true,
    },
    {
      key: "manager",
      label: "Odpovědný",
      type: "user",
      field: "managerId",
      width: 160,
      defaultVisible: true,
    },
    {
      key: "endDate",
      label: "Termín",
      type: "date",
      field: "endDate",
      width: 120,
      defaultVisible: true,
    },
    {
      key: "value",
      label: "Hodnota",
      min: 0,
      type: "currency",
      field: "valueMinor",
      permission: FINANCE,
      aggregate: ["sum"],
      width: 170,
      defaultVisible: true,
    },
    {
      key: "startDate",
      label: "Zahájení",
      type: "date",
      field: "startDate",
      width: 120,
    },
    {
      key: "person",
      label: "Kontaktní osoba",
      type: "record",
      field: "personId",
      record: { entityType: "person" },
      width: 200,
    },
    { key: "address", label: "Adresa stavby", type: "text", field: "address", width: 240 },
    {
      key: "warrantyMonths",
      label: "Délka záruky (měsíce)",
      min: 0,
      max: 600,
      type: "number",
      field: "warrantyMonths",
      width: 160,
    },
    { key: "warrantyUntil", label: "Záruka do", type: "date", field: "warrantyUntil", width: 130 },
    {
      key: "color",
      label: "Barva",
      type: "select",
      field: "color",
      choices: COLOR_CHOICES,
      width: 120,
    },
    {
      key: "lostReason",
      label: "Důvod prohry",
      type: "select",
      field: "lostReason",
      lookup: LOST_REASON_LOOKUP,
      width: 170,
    },
    {
      key: "pausedFrom",
      label: "Pozastaveno z fáze",
      type: "select",
      field: "pausedFrom",
      choices: PHASE_CHOICES,
      readonly: true,
      width: 150,
    },
    { key: "wonAt", label: "Vyhráno", type: "date", field: "wonAt", readonly: true, width: 120 },
    {
      key: "handoverAt",
      label: "Předáno",
      type: "date",
      field: "handoverAt",
      readonly: true,
      width: 120,
    },
    {
      key: "closedAt",
      label: "Uzavřeno",
      type: "date",
      field: "closedAt",
      readonly: true,
      width: 120,
    },
    {
      key: "sourceInquiry",
      label: "Vzniklo z poptávky",
      type: "record",
      field: "sourceInquiryId",
      record: { entityType: "inquiry" },
      width: 200,
    },
    { key: "description", label: "Popis", type: "longtext", field: "description", width: 300 },
    /* ---------- CRM: obchodní údaje zakázky (docs/CRM.md) ---------- */
    {
      key: "expectedCloseDate",
      label: "Očekávané uzavření",
      type: "date",
      field: "expectedCloseDate",
      width: 150,
    },
    {
      key: "crmWeighted",
      label: "Vážená hodnota",
      type: "currency",
      field: "crmWeightedMinor",
      readonly: true,
      permission: FINANCE,
      aggregate: ["sum"],
      width: 150,
    },
    {
      key: "crmProbabilityPct",
      label: "Pravděpodobnost výhry (ručně)",
      type: "number",
      field: "crmProbabilityPct",
      unit: "percent",
      min: 0,
      max: 100,
      width: 170,
    },
    {
      key: "crmSource",
      label: "Zdroj obchodu",
      type: "select",
      field: "crmSource",
      lookup: SOURCE_LOOKUP,
      width: 150,
    },
    {
      key: "crmSourceChannel",
      label: "Kanál",
      type: "text",
      field: "crmSourceChannel",
      width: 150,
    },
    { key: "crmCampaign", label: "Kampaň", type: "text", field: "crmCampaign", width: 170 },
    { key: "siteCity", label: "Město stavby", type: "text", field: "siteCity", width: 160 },
    {
      key: "crmStageEnteredAt",
      label: "Ve stavu od",
      type: "date",
      field: "crmStageEnteredAt",
      readonly: true,
      width: 130,
    },
    {
      key: "crmNextActivityAt",
      label: "Další aktivita",
      type: "date",
      field: "crmNextActivityAt",
      readonly: true,
      width: 140,
    },
    {
      key: "crmLastActivityAt",
      label: "Poslední aktivita",
      type: "date",
      field: "crmLastActivityAt",
      readonly: true,
      width: 140,
    },
    {
      key: "crmOpenActivities",
      label: "Otevřené aktivity",
      type: "number",
      field: "crmOpenActivities",
      readonly: true,
      width: 130,
    },
    {
      key: "crmOverdueActivities",
      label: "Aktivity po termínu",
      type: "number",
      field: "crmOverdueActivities",
      readonly: true,
      width: 140,
    },
    {
      key: "crmRotting",
      label: "Hnije",
      type: "checkbox",
      field: "crmRotting",
      readonly: true,
      width: 90,
    },
    {
      key: "crmArchivedAt",
      label: "Archivováno",
      type: "date",
      field: "crmArchivedAt",
      readonly: true,
      width: 130,
    },
    {
      key: "crmLostNote",
      label: "Poznámka k prohře",
      type: "longtext",
      field: "crmLostNote",
      width: 260,
    },
    // údaje o stáří záznamu pro filtry čištění dat v CRM (starší než N dní, tento týden…)
    {
      key: "createdAt",
      label: "Vytvořeno",
      type: "date",
      field: "createdAt",
      readonly: true,
      width: 130,
    },
    {
      key: "updatedAt",
      label: "Poslední úprava",
      type: "date",
      field: "updatedAt",
      readonly: true,
      width: 140,
    },
    {
      key: "phaseChangedAt",
      label: "Ve fázi od",
      type: "date",
      field: "phaseChangedAt",
      readonly: true,
      width: 130,
    },
  ],
  search: (r) => ({
    title: `${r.number} ${r.title}`,
    ...(r.address ? { subtitle: String(r.address) } : {}),
    extra: String(r.number),
  }),
  url: (id) => `/zakazky/${id}`,
});

export const entities = [jobEntity];
export { job, jobMember };
export * as lifecycleApi from "./lifecycle/api";
export * as templatesApi from "./templates/api";
export * from "./commands";

/** Základ modulu (zakázka, tým, legacy příkazy) a oblasti ADR 015, každá ve své složce se svým vlastníkem. */
export const server = mergeServers(
  defineModuleServer({ entities, commands, deleteBlockers }),
  lifecycle,
  templates,
);
