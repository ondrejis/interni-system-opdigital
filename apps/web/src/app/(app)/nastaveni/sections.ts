import { can } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";

export type SectionIcon =
  | "building"
  | "users"
  | "shield"
  | "bell"
  | "lock"
  | "user"
  | "approval"
  | "workflow"
  | "lists"
  | "fields"
  | "hash"
  | "percent"
  | "modules"
  | "mail"
  | "receipt"
  | "phone"
  | "dashboard"
  | "download";

/** Funkce, které klient může v konfiguraci vypnout (`dashboards.enabled`, `exports.enabled`). */
export type SettingsFeature = "dashboards" | "exports";

export const SETTINGS_SECTIONS = [
  {
    href: "/nastaveni/firma",
    label: "Firma a vzhled",
    icon: "building",
    group: "Správa systému",
    permission: "settings.manage",
  },
  {
    href: "/nastaveni/uzivatele",
    label: "Uživatelé",
    icon: "users",
    group: "Správa systému",
    permission: "users.manage",
  },
  {
    href: "/nastaveni/role",
    label: "Role a oprávnění",
    icon: "shield",
    group: "Správa systému",
    permission: "roles.manage",
  },
  {
    href: "/nastaveni/schvalovani",
    label: "Schvalování",
    icon: "approval",
    group: "Správa systému",
    permission: "zakazky.approve_all",
  },
  {
    href: "/nastaveni/pravidla-upozorneni",
    label: "Pravidla upozornění",
    icon: "bell",
    group: "Správa systému",
    permission: "settings.manage",
  },
  {
    href: "/nastaveni/nastenky",
    label: "Nástěnky",
    icon: "dashboard",
    group: "Správa systému",
    permission: "dashboards.manage",
    feature: "dashboards",
  },
  {
    href: "/nastaveni/email",
    label: "E-maily",
    icon: "mail",
    group: "Správa systému",
    permission: "settings.manage",
  },
  {
    href: "/fakturace/nastaveni",
    label: "Faktury a dokumenty",
    icon: "receipt",
    group: "Správa systému",
    permission: "settings.manage",
    module: "fakturace",
  },
  {
    href: "/nastaveni/stavy",
    label: "Stavy a pipeline",
    icon: "workflow",
    group: "Konfigurace",
    permission: "settings.manage",
  },
  {
    href: "/crm/typy-aktivit",
    label: "Typy aktivit",
    icon: "workflow",
    group: "Konfigurace",
    permission: "settings.manage",
    module: "poptavky",
  },
  {
    href: "/nastaveni/ciselniky",
    label: "Číselníky",
    icon: "lists",
    group: "Konfigurace",
    permission: "settings.manage",
  },
  {
    href: "/nastaveni/vlastni-pole",
    label: "Vlastní pole",
    icon: "fields",
    group: "Konfigurace",
    permission: "settings.manage",
  },
  {
    href: "/nastaveni/rady",
    label: "Číselné řady",
    icon: "hash",
    group: "Konfigurace",
    permission: "settings.manage",
  },
  {
    href: "/nastaveni/dph",
    label: "Sazby DPH",
    icon: "percent",
    group: "Konfigurace",
    permission: "settings.manage",
  },
  {
    href: "/nastaveni/terminal",
    label: "Terminál řemeslníka",
    icon: "phone",
    group: "Konfigurace",
    permission: "settings.manage",
  },
  {
    href: "/nastaveni/moduly",
    label: "Moduly",
    icon: "modules",
    group: "Konfigurace",
    permission: "settings.manage",
  },
  {
    href: "/nastaveni/ucet",
    label: "Můj účet",
    icon: "user",
    group: "Můj účet",
    permission: null,
  },
  {
    href: "/nastaveni/upozorneni",
    label: "Upozornění",
    icon: "bell",
    group: "Můj účet",
    permission: null,
  },
  {
    href: "/nastaveni/exporty",
    label: "Exporty",
    icon: "download",
    group: "Můj účet",
    permission: null,
    feature: "exports",
  },
  {
    href: "/nastaveni/zabezpeceni",
    label: "Zabezpečení účtu",
    icon: "lock",
    group: "Můj účet",
    permission: null,
  },
] as const satisfies readonly {
  href: string;
  label: string;
  icon: SectionIcon;
  group: string;
  permission: string | null;
  /** Sekce patří modulu; bez zapnutého modulu se nenabízí. */
  module?: string;
  /** Sekce patří funkci, kterou lze v konfiguraci klienta vypnout; vypnutá se nenabízí. */
  feature?: SettingsFeature;
}[];

/** Sekce Nastavení, které aktér smí vidět. Zabezpečení vlastního účtu má každý. */
export const allowedSections = (
  ctx: Ctx,
  enabledModules?: ReadonlySet<string>,
  disabledFeatures?: ReadonlySet<SettingsFeature>,
) =>
  SETTINGS_SECTIONS.filter(
    (s) =>
      (s.permission === null || can(ctx, s.permission)) &&
      (!("module" in s) || !enabledModules || enabledModules.has(s.module)) &&
      (!("feature" in s) || !disabledFeatures || !disabledFeatures.has(s.feature)),
  );
