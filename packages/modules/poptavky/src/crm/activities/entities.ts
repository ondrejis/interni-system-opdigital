import { isNull, sql } from "drizzle-orm";
import { defineEntity } from "@rebar/core/entities";
import { NotFoundError } from "@rebar/core/rbac";
import { crmActivity, crmActivityType, crmNote } from "../../schema";
import { noteOwners, noteScope } from "./notes";
import { activityOwners, activityScope, notifyActivityAssigned, READ, WRITE } from "./service";
import { recomputeJobCrm } from "../deals/recompute";

/** Ikony, které smí mít typ aktivity (sada ikon aplikace). */
const TYPE_ICONS = [
  ["phone", "Telefon"],
  ["users", "Lidé (schůzka)"],
  ["check-square", "Úkol"],
  ["flag", "Termín"],
  ["mail", "E-mail"],
  ["map-pin", "Místo (obhlídka)"],
  ["calendar-clock", "Kalendář"],
  ["send", "Odeslat"],
  ["video", "Video"],
  ["wrench", "Nářadí"],
  ["camera", "Fotoaparát"],
  ["file-text", "Dokument"],
  ["star", "Hvězda"],
  ["eye", "Kontrola"],
  ["target", "Cíl"],
  ["house", "Dům"],
  ["truck", "Doprava"],
  ["message-circle", "Zpráva"],
  ["clipboard-check", "Kontrolní seznam"],
].map(([value, label]) => ({ value: value!, label: label! }));

const slug = (name: string) =>
  name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30) || "typ";

/**
 * Aktivita jako entita registru (tabulka, filtry, uložené pohledy, audit, oprávnění). Zakládá a mění se příkazy
 * `crm.activity.*` (termín, dokončení a odložení přepočítávají zakázku); přímo se v tabulce upravují jen údaje, které
 * přepočet nemění. Rozsah „jen moje“: přiřazeno mně nebo vlastník zakázky.
 */
export const activityEntity = defineEntity({
  key: "crm_activity",
  listPath: "/crm/aktivity",
  module: "poptavky",
  label: { one: "Aktivita", many: "Aktivity" },
  table: crmActivity,
  titleKey: "subject",
  permissions: { read: READ, write: WRITE },
  noCreate: "Aktivitu naplánujte tlačítkem „Naplánovat aktivitu“ u zakázky, firmy nebo osoby.",
  noDelete: "Aktivitu smažete akcí „Smazat“ v jejím řádku nebo detailu zakázky.",
  scope: activityScope,
  owners: activityOwners,
  ownerDefaults: (ctx) => ({ assignee: ctx.actor.userId }),
  afterUpdate: async (ctx, before, after) => {
    // změna zakázky v tabulce: přepočítá se původní i nová
    for (const jobId of new Set([before.jobId, after.jobId] as (string | null)[])) {
      if (!jobId) continue;
      try {
        await recomputeJobCrm(ctx, jobId);
      } catch (e) {
        if (!(e instanceof NotFoundError)) throw e;
      }
    }
    if (before.assigneeId !== after.assigneeId)
      await notifyActivityAssigned(ctx, after as typeof crmActivity.$inferSelect);
  },
  attributes: [
    {
      key: "subject",
      label: "Předmět",
      type: "text",
      field: "subject",
      required: true,
      width: 280,
      defaultVisible: true,
    },
    {
      key: "type",
      label: "Typ",
      type: "record",
      field: "typeId",
      record: { entityType: "crm_activity_type" },
      required: true,
      width: 160,
      defaultVisible: true,
    },
    {
      key: "dueAt",
      label: "Termín",
      type: "date",
      field: "dueAt",
      readonly: true,
      width: 140,
      defaultVisible: true,
    },
    {
      key: "allDay",
      label: "Celý den",
      type: "checkbox",
      field: "allDay",
      readonly: true,
      width: 100,
    },
    {
      key: "durationMin",
      label: "Délka (min)",
      type: "number",
      field: "durationMin",
      min: 1,
      max: 1440,
      width: 110,
    },
    {
      key: "priority",
      label: "Priorita",
      type: "select",
      field: "priority",
      choices: [
        { value: "low", label: "Nízká", color: "gray" },
        { value: "normal", label: "Běžná", color: "blue" },
        { value: "high", label: "Vysoká", color: "red" },
      ],
      width: 110,
      defaultVisible: true,
    },
    { key: "location", label: "Místo", type: "text", field: "location", width: 200 },
    {
      key: "assignee",
      label: "Přiřazeno",
      type: "user",
      field: "assigneeId",
      width: 160,
      defaultVisible: true,
    },
    {
      key: "job",
      label: "Zakázka",
      type: "record",
      field: "jobId",
      record: { entityType: "job" },
      width: 220,
      defaultVisible: true,
    },
    {
      key: "company",
      label: "Firma",
      type: "record",
      field: "companyId",
      record: { entityType: "company" },
      width: 200,
    },
    {
      key: "person",
      label: "Osoba",
      type: "record",
      field: "personId",
      record: { entityType: "person" },
      width: 180,
    },
    {
      key: "doneAt",
      label: "Dokončeno",
      type: "date",
      field: "doneAt",
      readonly: true,
      width: 140,
    },
    { key: "doneBy", label: "Dokončil", type: "user", field: "doneBy", readonly: true, width: 150 },
    { key: "outcome", label: "Výsledek", type: "text", field: "outcome", width: 240 },
    { key: "note", label: "Poznámka", type: "longtext", field: "note", width: 300 },
  ],
  url: (id) => `/crm/aktivity/${id}`,
});

/**
 * Poznámka u zakázky, firmy nebo osoby jako entita registru: komentáře, audit a oprávnění se k ní vážou jako k jiným
 * záznamům. Píše se příkazy `crm.note.*`; rozsah „jen moje“ = moje poznámky a poznámky u mých zakázek.
 */
export const noteEntity = defineEntity({
  key: "crm_note",
  listPath: "/crm/poznamky",
  module: "poptavky",
  label: { one: "Poznámka", many: "Poznámky" },
  table: crmNote,
  titleKey: "body",
  permissions: { read: READ, write: WRITE },
  noCreate: "Poznámku přidáte v detailu zakázky, firmy nebo osoby.",
  noDelete: "Poznámku smažete v detailu zakázky, firmy nebo osoby.",
  scope: noteScope,
  owners: noteOwners,
  ownerDefaults: (ctx) => ({ author: ctx.actor.userId }),
  attributes: [
    {
      key: "body",
      label: "Poznámka",
      type: "longtext",
      field: "body",
      required: true,
      width: 420,
      defaultVisible: true,
    },
    {
      key: "pinned",
      label: "Připnuto",
      type: "checkbox",
      field: "pinned",
      width: 100,
      defaultVisible: true,
    },
    {
      key: "entityType",
      label: "K čemu patří",
      type: "select",
      field: "entityType",
      choices: [
        { value: "job", label: "Zakázka" },
        { value: "company", label: "Firma" },
        { value: "person", label: "Osoba" },
      ],
      readonly: true,
      width: 130,
      defaultVisible: true,
    },
    {
      key: "author",
      label: "Autor",
      type: "user",
      field: "authorId",
      readonly: true,
      width: 160,
      defaultVisible: true,
    },
  ],
  url: (id) => `/crm/poznamky/${id}`,
});

/**
 * Typ aktivity (hovor, schůzka, úkol…): konfigurace v Nastavení → Typy aktivit. Typ se nemaže (aktivity by o něj přišly),
 * vypíná se. Klíč se při založení odvodí z názvu a dál se nemění.
 */
export const activityTypeEntity = defineEntity({
  key: "crm_activity_type",
  listPath: "/crm/typy-aktivit",
  module: "poptavky",
  label: { one: "Typ aktivity", many: "Typy aktivit" },
  table: crmActivityType,
  titleKey: "name",
  permissions: { read: READ, write: "settings.manage" },
  noDelete: "Typ, který nepotřebujete, vypněte (Aktivní = ne); smazáním by aktivity ztratily typ.",
  beforeCreate: async (ctx, values) => {
    const base = slug(String(values.name ?? ""));
    const taken = new Set(
      (
        await ctx.db
          .select({ key: crmActivityType.key })
          .from(crmActivityType)
          .where(isNull(crmActivityType.deletedAt))
      ).map((r) => r.key),
    );
    let key = base;
    for (let i = 2; taken.has(key); i++) key = `${base}_${i}`;
    const [max] = await ctx.db
      .select({ position: sql<number>`coalesce(max(${crmActivityType.position}), 0)::int` })
      .from(crmActivityType)
      .where(isNull(crmActivityType.deletedAt));
    return { ...values, key, position: values.position ?? (max?.position ?? 0) + 10 };
  },
  attributes: [
    {
      key: "name",
      label: "Název",
      type: "text",
      field: "name",
      required: true,
      width: 240,
      defaultVisible: true,
    },
    {
      key: "icon",
      label: "Ikona",
      type: "select",
      field: "icon",
      choices: TYPE_ICONS,
      required: true,
      default: "check-square",
      width: 180,
      defaultVisible: true,
    },
    {
      key: "defaultDurationMin",
      label: "Výchozí délka (min)",
      type: "number",
      field: "defaultDurationMin",
      min: 1,
      max: 1440,
      width: 160,
      defaultVisible: true,
    },
    {
      key: "position",
      label: "Pořadí",
      type: "number",
      field: "position",
      min: 0,
      max: 10_000,
      width: 100,
      defaultVisible: true,
    },
    {
      key: "active",
      label: "Aktivní",
      type: "checkbox",
      field: "active",
      default: true,
      width: 100,
      defaultVisible: true,
    },
    {
      key: "key",
      label: "Klíč",
      type: "text",
      field: "key",
      readonly: true,
      width: 140,
    },
  ],
  url: (id) => `/crm/typy-aktivit/${id}`,
});

export const activityEntities = [activityEntity, noteEntity, activityTypeEntity];
