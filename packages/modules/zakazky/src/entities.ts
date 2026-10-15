import { and, eq, or, sql } from "drizzle-orm";
import { defineEntity, type AttributeDef, type Choice } from "@rebar/core/entities";
import { emitEvent } from "@rebar/core/module-server";
import { nextNumber } from "@rebar/core/numbering";
import { job, jobMember, jobPhase, jobTemplate } from "./schema";
import { afterGenericCreate } from "./core/after-create";
import { JOB_SERIES } from "./series";
import {
  BILLING_MODEL_LABELS,
  JOB_STATUS_COLORS,
  JOB_STATUS_LABELS,
  JOB_TYPE_LABELS,
  MARKETING_STAGE_LABELS,
} from "./shared";

export { JOB_SERIES } from "./series";
export {
  BILLING_MODEL_LABELS,
  JOB_STATUS_LABELS,
  JOB_TYPE_LABELS,
  MARKETING_STAGE_LABELS,
} from "./shared";

const choices = <K extends string>(
  labels: Record<K, string>,
  colors?: Record<K, string>,
): Choice[] =>
  (Object.keys(labels) as K[]).map((value) => ({
    value,
    label: labels[value],
    ...(colors ? { color: colors[value] } : {}),
  }));

/**
 * Zakázka. Rozsah „jen moje“: vlastník nebo člen týmu. Číslo se přiděluje při založení z řady `zakazky.cislo`.
 * `drive_*` píše modul Disk, `marketing_stage` modul Finance (přes `setMarketingStage`), aktuální fázi mění jen příkazy.
 */
export const jobEntity = defineEntity({
  key: "job",
  listPath: "/zakazky",
  module: "zakazky",
  label: { one: "Zakázka", many: "Zakázky" },
  table: job,
  titleKey: "title",
  permissions: {
    read: "zakazky.read",
    write: "zakazky.write",
    create: "zakazky.create",
    delete: "zakazky.delete",
    export: "zakazky.export",
  },
  ownerColumns: [job.ownerId],
  scope: (ctx) => {
    const me = ctx.actor.userId;
    if (!me) return sql`false`;
    return or(
      eq(job.ownerId, me),
      sql`exists (select 1 from ${jobMember} where ${jobMember.jobId} = ${job.id} and ${jobMember.userId} = ${me} and ${jobMember.deletedAt} is null)`,
    )!;
  },
  owners: async (db, id) => {
    const [row] = await db
      .select({ owner: job.ownerId })
      .from(job)
      .where(and(eq(job.id, id), sql`${job.deletedAt} is null`));
    if (!row) return null;
    const members = await db
      .select({ userId: jobMember.userId })
      .from(jobMember)
      .where(and(eq(jobMember.jobId, id), sql`${jobMember.deletedAt} is null`));
    return [row.owner, ...members.map((m) => m.userId)];
  },
  ownerDefaults: (ctx) => ({ owner: ctx.actor.userId }),
  beforeCreate: async (ctx, values) => {
    // číslo zakázky je unikátní i mezi smazanými; obsazené číslo (import, ruční zápis) se v řadě přeskočí
    const number = await nextNumber(ctx.db, JOB_SERIES, new Date(), {
      isTaken: async (n) =>
        (await ctx.db.select({ id: job.id }).from(job).where(eq(job.number, n)).limit(1)).length >
        0,
    });
    return { ...values, number };
  },
  // zakázka založená obecným formulářem dostane fáze z výchozí šablony a `project.created`; plnohodnotné založení
  // (úkoly, platby, klient) je příkaz `zakazky.create`. Událost `zakazky.created` je pro rozšíření klienta.
  afterCreate: async (ctx, created) => {
    await afterGenericCreate(ctx, created);
    await emitEvent("zakazky.created", { id: String(created.id) });
  },
  visibility: { ownLock: true },
  systemFields: ["driveFolderId", "driveStatus"],
  children: [
    { entityType: "job_phase", column: "jobId", table: jobPhase },
    { entityType: "task", column: "jobId" },
    { entityType: "note", column: "jobId" },
    { entityType: "time_entry", column: "jobId" },
    { entityType: "payment", column: "jobId" },
  ],
  quickFilters: [
    {
      key: "mine",
      label: "Moje",
      filter: { op: "and", conditions: [{ attr: "owner", op: "is_me" }] },
    },
    {
      key: "active",
      label: "Aktivní",
      filter: { op: "and", conditions: [{ attr: "status", op: "is", value: "active" }] },
    },
  ],
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
      label: "Klient",
      type: "record",
      field: "companyId",
      record: { entityType: "company" },
      required: true,
      width: 220,
      defaultVisible: true,
    },
    {
      key: "type",
      label: "Typ",
      type: "select",
      field: "type",
      choices: choices(JOB_TYPE_LABELS, { web: "blue", marketing: "orange", systemy: "purple" }),
      required: true,
      default: "web",
      width: 120,
      defaultVisible: true,
    },
    {
      key: "status",
      label: "Stav",
      type: "select",
      field: "status",
      choices: choices(JOB_STATUS_LABELS, JOB_STATUS_COLORS),
      // stav se mění příkazy (`zakazky.setStatus`/`complete`): datum dokončení, upozornění a událost `project.completed`
      readonly: true,
      default: "planned",
      width: 130,
      defaultVisible: true,
    },
    {
      key: "owner",
      label: "Vlastník",
      type: "user",
      field: "ownerId",
      width: 160,
      defaultVisible: true,
    },
    {
      key: "startDate",
      label: "Začátek",
      type: "date",
      field: "startDate",
      width: 120,
      defaultVisible: true,
    },
    {
      key: "dueDate",
      label: "Termín",
      type: "date",
      field: "dueDate",
      width: 120,
      defaultVisible: true,
    },
    {
      key: "price",
      label: "Cena",
      type: "currency",
      field: "priceMinor",
      min: 0,
      permission: "finance.read",
      aggregate: ["sum"],
      width: 150,
      defaultVisible: true,
    },
    {
      key: "billingModel",
      label: "Fakturace",
      type: "select",
      field: "billingModel",
      choices: choices(BILLING_MODEL_LABELS),
      default: "one_off",
      width: 190,
    },
    {
      key: "marketingStage",
      label: "Fáze marketingu",
      type: "select",
      field: "marketingStage",
      choices: choices(MARKETING_STAGE_LABELS),
      readonly: true,
      width: 150,
    },
    {
      key: "completedAt",
      label: "Dokončeno",
      type: "date",
      field: "completedAt",
      readonly: true,
      width: 130,
    },
    { key: "description", label: "Popis", type: "longtext", field: "description", width: 300 },
    {
      key: "tags",
      label: "Štítky",
      type: "multiselect",
      field: "tags",
      lookup: "tag",
      lookupScope: "job",
      width: 200,
    },
  ] satisfies AttributeDef[],
  search: (r) => ({
    title: `${r.number} ${r.title}`,
    extra: String(r.number),
  }),
  url: (id) => `/zakazky/${id}`,
});

/** Šablona zakázky (fáze, úkoly, platby). Archivuje se, nemaže; správa přes `zakazky.templates`. */
export const jobTemplateEntity = defineEntity({
  key: "job_template",
  listPath: "/zakazky/sablony",
  module: "zakazky",
  label: { one: "Šablona zakázky", many: "Šablony zakázek" },
  table: jobTemplate,
  titleKey: "name",
  permissions: {
    read: "zakazky.read",
    write: "zakazky.templates",
    create: "zakazky.templates",
    delete: "zakazky.templates",
  },
  attributes: [
    {
      key: "name",
      label: "Název",
      type: "text",
      field: "name",
      required: true,
      width: 280,
      defaultVisible: true,
    },
    {
      key: "type",
      label: "Typ",
      type: "select",
      field: "type",
      choices: choices(JOB_TYPE_LABELS),
      required: true,
      default: "web",
      width: 120,
      defaultVisible: true,
    },
    {
      key: "defaultBillingModel",
      label: "Výchozí fakturace",
      type: "select",
      field: "defaultBillingModel",
      choices: choices(BILLING_MODEL_LABELS),
      default: "one_off",
      width: 190,
      defaultVisible: true,
    },
    {
      key: "isDefault",
      label: "Výchozí pro typ",
      type: "checkbox",
      field: "isDefault",
      defaultVisible: true,
      width: 130,
    },
    {
      key: "archivedAt",
      label: "Archivováno",
      type: "date",
      field: "archivedAt",
      readonly: true,
      width: 130,
    },
    { key: "description", label: "Popis", type: "longtext", field: "description", width: 300 },
  ],
  search: (r) => ({ title: String(r.name), extra: String(r.description ?? "") }),
  url: (id) => `/zakazky/sablony/${id}`,
});

export const entities = [jobEntity, jobTemplateEntity];
export { job, jobMember, jobPhase, jobTemplate };
