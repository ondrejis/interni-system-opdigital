import { can } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";

export type SectionIcon =
  | "building"
  | "users"
  | "shield"
  | "bell"
  | "lock"
  | "user"
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
  | "download"
  | "plug"
  | "drive"
  | "server"
  | "template"
  | "tag"
  | "wallet"
  | "calendar"
  | "palette";

/** Funkce, které klient může v konfiguraci vypnout (`dashboards.enabled`, `exports.enabled`). */
export type SettingsFeature = "dashboards" | "exports";

/**
 * Sekce Nastavení. Řádek s `module` se nabízí jen při zapnutém modulu, s `feature` jen při zapnuté funkci klienta.
 * OPSYS nemá upozornění ani sazby DPH: jejich stránky (`upozorneni`, `pravidla-upozorneni`, `dph`) tu nejsou
 * a v nabídce se neukazují.
 */
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
    href: "/nastaveni/nastenky",
    label: "Nástěnky",
    icon: "dashboard",
    group: "Správa systému",
    permission: "dashboards.manage",
    feature: "dashboards",
  },
  {
    href: "/nastaveni/integrace",
    label: "Integrace",
    icon: "plug",
    group: "Správa systému",
    permission: "settings.integrations",
  },
  {
    href: "/nastaveni/google-disk",
    label: "Google Disk",
    icon: "drive",
    group: "Správa systému",
    permission: "disk.manage",
    module: "disk",
  },
  {
    href: "/nastaveni/email",
    label: "E-maily",
    icon: "mail",
    group: "Správa systému",
    permission: "settings.manage",
  },
  {
    href: "/nastaveni/system",
    label: "Systém",
    icon: "server",
    group: "Správa systému",
    permission: "settings.manage",
  },
  {
    href: "/nastaveni/stavy",
    label: "Pipeline a stavy",
    icon: "workflow",
    group: "Konfigurace",
    permission: "settings.manage",
  },
  {
    href: "/ukoly/typy",
    label: "Typy aktivit",
    icon: "workflow",
    group: "Konfigurace",
    permission: "ukoly.types",
    module: "ukoly",
  },
  {
    href: "/zakazky/sablony",
    label: "Šablony zakázek",
    icon: "template",
    group: "Konfigurace",
    permission: "zakazky.templates",
    module: "zakazky",
  },
  {
    href: "/nastaveni/stitky",
    label: "Štítky",
    icon: "tag",
    group: "Konfigurace",
    permission: "settings.tags",
  },
  {
    href: "/nastaveni/vlastni-pole",
    label: "Vlastní pole",
    icon: "fields",
    group: "Konfigurace",
    permission: "settings.manage",
  },
  {
    href: "/nastaveni/ciselniky",
    label: "Číselníky",
    icon: "lists",
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
    href: "/nastaveni/finance",
    label: "Finance",
    icon: "wallet",
    group: "Konfigurace",
    permission: "finance.settings",
    module: "finance",
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
    href: "/nastaveni/google-kalendar",
    label: "Google Kalendář",
    icon: "calendar",
    group: "Můj účet",
    permission: "kalendar.read",
    module: "kalendar",
  },
  {
    href: "/nastaveni/vzhled",
    label: "Vzhled",
    icon: "palette",
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
