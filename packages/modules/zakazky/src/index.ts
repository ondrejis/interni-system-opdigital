import { defineModule } from "@rebar/core/manifest";
import { JOB_STAGES } from "./lifecycle/stages";
import { JOB_VIEWS } from "./lifecycle/views";
import { ZAKAZKY_NOTIFICATIONS } from "./notifications";

export const manifest = defineModule({
  id: "zakazky",
  name: "Zakázky",
  description: "Pipeline zakázek, rozpočet a položky, termíny, tým, dokumenty, ekonomika.",
  icon: "briefcase",
  dependsOn: ["kontakty"],
  nav: [
    {
      label: "Zakázky",
      href: "/zakazky",
      icon: "briefcase",
      permission: "zakazky.read",
      group: "Obchod",
    },
    {
      label: "Objednávky",
      href: "/zakazky/objednavky",
      icon: "shopping-cart",
      permission: "zakazky.economics",
      parent: "/zakazky",
    },
    {
      label: "Ke schválení",
      href: "/zakazky/schvalovani",
      icon: "check-square",
      permission: ["zakazky.approve", "zakazky.approve_all"],
      parent: "/zakazky",
    },
    {
      label: "Šablony",
      href: "/zakazky/sablony",
      icon: "clipboard-list",
      permission: "zakazky.read",
      parent: "/zakazky",
    },
  ],
  pages: [
    { path: "/zakazky/sablony", title: "Šablony zakázek", permission: "zakazky.read" },
    {
      path: "/zakazky/schvalovani",
      title: "Ke schválení",
      permission: ["zakazky.approve", "zakazky.approve_all"],
    },
  ],
  permissions: [
    { key: "zakazky.read", label: "Vidí zakázky" },
    { key: "zakazky.write", label: "Upravuje zakázky" },
    {
      key: "zakazky.economics",
      label: "Vidí ekonomiku zakázek",
      description: "Rozpočet, náklady, marže",
    },
    {
      key: "zakazky.budget",
      label: "Upravuje rozpočet a náklady zakázek",
      description: "Položky rozpočtu, ceny, ruční náklady, objednávky, párování nákladů",
    },
    {
      key: "zakazky.approve",
      label: "Schvaluje doklady zakázek do svého limitu",
      description:
        "Změny (ZBV), soupisy prací, objednávky a přijaté faktury podle pravidel schvalování",
    },
    {
      key: "zakazky.approve_all",
      label: "Schvaluje doklady bez limitu a nastavuje pravidla schvalování",
    },
    { key: "zakazky.share", label: "Sdílí zakázku s investorem (odkaz jen ke čtení)" },
  ],
  entities: ["job", "job_order"],
  notifications: ZAKAZKY_NOTIFICATIONS,
  terminalWidgets: [
    {
      key: "zakazky.today",
      label: "Dnes na stavbě",
      description:
        "Zakázky, na kterých se pracuje: adresa a navigace, kontakt na místě, tým a dnešní práce.",
      icon: "map-pin",
      permission: "zakazky.read",
      page: true,
    },
  ],
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
    series: [
      { key: "zakazky.cislo", pattern: "Z-{YYYY}-{NNN}" },
      { key: "zakazky.objednavka", pattern: "OBJ-{YYYY}-{NNN}" },
    ],
    views: JOB_VIEWS,
  },
});

export { JOB_TEAM_AUDIENCES, ZAKAZKY_NOTIFICATIONS } from "./notifications";
export * from "./lifecycle/phases";
export { JOB_STAGES, CRM_DEAL_STAGES, phaseForLegacyStage } from "./lifecycle/stages";
export type { JobStageDef } from "./lifecycle/stages";
export { effectivePhase, fromExecution, fromPreparation, phaseAtLeast } from "./detail/visibility";
