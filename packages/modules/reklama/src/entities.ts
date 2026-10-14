import { defineEntity, type Choice } from "@rebar/core/entities";
import { AD_OWNER_KINDS, adAccount, adCampaign } from "./schema";

/** Popisky vlastníků reklamního účtu. */
export const AD_OWNER_KIND_LABELS: Record<(typeof AD_OWNER_KINDS)[number], string> = {
  agency: "Agentura",
  client: "Klient",
};

const OWNER_CHOICES: Choice[] = AD_OWNER_KINDS.map((v) => ({
  value: v,
  label: AD_OWNER_KIND_LABELS[v],
}));

/** Reklamní účet z Meta Ads (jen čtení z Mety; vlastníka a klienta nastavuje uživatel). */
export const adAccountEntity = defineEntity({
  key: "ad_account",
  listPath: "/reklama",
  module: "reklama",
  label: { one: "Reklamní účet", many: "Reklamní účty" },
  table: adAccount,
  titleKey: "name",
  permissions: { read: "reklama.read", write: "reklama.write", create: "reklama.manage" },
  noCreate: "Účty se načítají synchronizací z Meta.",
  noDelete: "Účty se nemažou, jen se deaktivují.",
  attributes: [
    {
      key: "name",
      label: "Název",
      type: "text",
      field: "name",
      required: true,
      width: 260,
      defaultVisible: true,
    },
    {
      key: "metaId",
      label: "Meta ID",
      type: "text",
      field: "metaId",
      readonly: true,
      width: 160,
      defaultVisible: true,
    },
    {
      key: "ownerKind",
      label: "Vlastník účtu",
      type: "select",
      field: "ownerKind",
      choices: OWNER_CHOICES,
      default: "agency",
      width: 140,
      defaultVisible: true,
    },
    {
      key: "company",
      label: "Klient",
      type: "record",
      field: "companyId",
      record: { entityType: "company" },
      width: 220,
      defaultVisible: true,
    },
    {
      key: "currency",
      label: "Měna",
      type: "text",
      field: "currency",
      readonly: true,
      width: 90,
      defaultVisible: true,
    },
    {
      key: "timezone",
      label: "Časové pásmo",
      type: "text",
      field: "timezone",
      readonly: true,
      width: 160,
    },
    {
      key: "active",
      label: "Aktivní",
      type: "checkbox",
      field: "active",
      width: 90,
      defaultVisible: true,
    },
    {
      key: "lastSyncAt",
      label: "Poslední synchronizace",
      type: "date",
      field: "lastSyncAt",
      readonly: true,
      width: 170,
      defaultVisible: true,
    },
  ],
  search: (r) => ({ title: String(r.name), extra: String(r.metaId) }),
  url: (id) => `/reklama/${id}`,
});

/** Reklamní kampaň (jen čtení z Mety); uživatel ji přiřazuje k marketingové zakázce. */
export const adCampaignEntity = defineEntity({
  key: "ad_campaign",
  listPath: "/reklama/kampane",
  module: "reklama",
  label: { one: "Kampaň", many: "Kampaně" },
  table: adCampaign,
  titleKey: "name",
  permissions: { read: "reklama.read", write: "reklama.write" },
  noCreate: "Kampaně se načítají synchronizací z Meta.",
  noDelete: "Kampaně se nemažou.",
  attributes: [
    {
      key: "name",
      label: "Název",
      type: "text",
      field: "name",
      readonly: true,
      width: 280,
      defaultVisible: true,
    },
    {
      key: "account",
      label: "Účet",
      type: "record",
      field: "accountId",
      record: { entityType: "ad_account" },
      readonly: true,
      width: 220,
      defaultVisible: true,
    },
    {
      key: "objective",
      label: "Cíl",
      type: "text",
      field: "objective",
      readonly: true,
      width: 160,
      defaultVisible: true,
    },
    {
      key: "status",
      label: "Stav",
      type: "text",
      field: "status",
      readonly: true,
      width: 120,
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
    { key: "metaId", label: "Meta ID", type: "text", field: "metaId", readonly: true, width: 160 },
  ],
  search: (r) => ({ title: String(r.name), extra: String(r.metaId) }),
  url: (id) => `/reklama/kampane/${id}`,
});

export const entities = [adAccountEntity, adCampaignEntity];
export { adAccount, adCampaign };
