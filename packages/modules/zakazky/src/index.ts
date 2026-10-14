import { defineModule } from "@rebar/core/manifest";
import { JOB_STAGES } from "./lifecycle/stages";
import { JOB_VIEWS } from "./lifecycle/views";

export const manifest = defineModule({
  id: "zakazky",
  name: "Zakázky",
  description:
    "Zakázky: fáze, termíny, tým, šablony, komentáře a úkoly (kostra, model se přepracovává).",
  icon: "briefcase",
  dependsOn: ["kontakty"],
  nav: [
    {
      label: "Zakázky",
      href: "/zakazky",
      icon: "briefcase",
      permission: "zakazky.read",
      group: "Realizace",
      order: 10,
    },
  ],
  pages: [{ path: "/zakazky/sablony", title: "Šablony zakázek", permission: "zakazky.read" }],
  permissions: [
    { key: "zakazky.read", label: "Vidí zakázky" },
    { key: "zakazky.create", label: "Zakládá zakázky" },
    { key: "zakazky.write", label: "Upravuje zakázky" },
    {
      key: "zakazky.delete",
      label: "Maže zakázky",
      description: "Do koše; obnovit smí každý své",
    },
    { key: "zakazky.export", label: "Exportuje zakázky" },
    { key: "zakazky.templates", label: "Spravuje šablony zakázek" },
    {
      key: "zakazky.finance",
      label: "Vidí hodnotu a finance zakázek",
      description: "Hodnota zakázky a částky odvozené z ní (přechodné; převezme modul Finance)",
    },
  ],
  entities: ["job"],
  seed: {
    pipelines: [
      {
        entityType: "job",
        key: "default",
        name: "Zakázky",
        stages: JOB_STAGES,
      },
    ],
    lookups: [
      {
        key: "job.lost_reason",
        name: "Důvod prohry zakázky",
        items: [
          { value: "price", label: "Cena" },
          { value: "timing", label: "Termín" },
          { value: "competitor", label: "Vybrali konkurenci" },
          { value: "no_response", label: "Bez odezvy" },
          { value: "cancelled", label: "Zákazník zrušil záměr" },
          { value: "other", label: "Jiný důvod" },
        ],
      },
      {
        key: "job.source",
        name: "Zdroj obchodu",
        items: [
          { value: "web", label: "Web", color: "blue" },
          { value: "phone", label: "Telefon", color: "green" },
          { value: "email", label: "E-mail", color: "indigo" },
          { value: "referral", label: "Doporučení", color: "purple" },
          { value: "personal", label: "Osobně", color: "teal" },
          { value: "other", label: "Jiný", color: "gray" },
        ],
      },
    ],
    series: [{ key: "zakazky.cislo", pattern: "Z-{YYYY}-{NNN}" }],
    views: JOB_VIEWS,
  },
});

export { JOB_STAGES, CRM_DEAL_STAGES, phaseForLegacyStage } from "./lifecycle/stages";
export type { JobStageDef } from "./lifecycle/stages";
export { effectivePhase, fromExecution, fromPreparation, phaseAtLeast } from "./detail/visibility";
