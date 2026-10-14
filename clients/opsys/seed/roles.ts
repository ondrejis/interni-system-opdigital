import { DEFAULT_ROLES, type Seed } from "@rebar/core/seed";

type RoleDef = Seed["roles"][number];

/**
 * Výchozí oprávnění Partnera (Patrik) podle NAS-02 z finálních klíčů modulů (D §1.2): obchody a kontakty vše kromě
 * mazání, exportu a slučování; klienti čtení a úpravy; zakázky vše kromě mazání a exportu; úkoly, hodiny, kalendář
 * a šablony e-mailů vše; finance čtení a zápis plateb (bez úprav rozdělení a vyrovnání); reklama čtení; historie
 * a koš čtení; nastavení pipeline, vlastních polí a štítků (ne integrace a uživatelé); Můj prostor nemá.
 * Klíče mimo katalog zapnutých modulů se při seedu ignorují. Změny řeší majitel v Nastavení → Role.
 */
export const PARTNER_PERMISSIONS: Record<string, "all" | "own"> = Object.fromEntries(
  [
    "kontakty.read",
    "kontakty.create",
    "kontakty.write",
    "kontakty.ares",
    "klienti.read",
    "klienti.write",
    "disk.read",
    "disk.write",
    "zakazky.read",
    "zakazky.create",
    "zakazky.write",
    "zakazky.templates",
    "zakazky.finance",
    "obchody.read",
    "obchody.create",
    "obchody.write",
    "obchody.pipelines",
    "ukoly.read",
    "ukoly.create",
    "ukoly.write",
    "ukoly.delete",
    "ukoly.types",
    "kalendar.read",
    "kalendar.write",
    "kalendar.resources",
    "hodiny.read",
    "hodiny.write",
    "hodiny.delete",
    "finance.read",
    "finance.payments_write",
    "reklama.read",
    "sablony-emailu.read",
    "sablony-emailu.create",
    "sablony-emailu.write",
    "sablony-emailu.delete",
    "prehled.read",
    "activity.read",
    "trash.read",
    "settings.pipelines",
    "settings.custom_fields",
    "settings.tags",
    "dashboards.write",
    "exports.schedule",
    "tasks.read",
    "tasks.assign",
  ].map((k) => [k, "all" as const]),
);

/**
 * Role OPSYS: `owner` (Ondřej, systémová, vidí a smí vše včetně soukromých záznamů), `partner` (Patrik) a `external`
 * (externí spolupracovník; bez oprávnění, přidělí se podle potřeby; `job` a `task` mají rozsah „jen moje“).
 */
export const ROLES: readonly RoleDef[] = [
  ...DEFAULT_ROLES,
  {
    key: "partner",
    name: "Partner",
    description: "Společník agentury: běžná práce se sdílenými záznamy bez nastavení systému",
    permissions: PARTNER_PERMISSIONS,
  },
  {
    key: "external",
    name: "Externí spolupracovník",
    description: "Externí spolupracovník: bez oprávnění, majitel mu je přidělí podle potřeby",
    permissions: {},
  },
];
