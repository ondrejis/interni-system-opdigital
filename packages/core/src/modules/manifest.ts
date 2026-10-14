import type { LookupDef, PipelineDef } from "../config-data";
import type { SeriesDef } from "../numbering";
import type { SeedViewDef } from "../views/seed";
import type { AnyEventDef } from "../notifications/types";
import type { ModuleId } from "./ids";

export type NavItem = {
  label: string;
  href: string;
  /** Název ikony z lucide (např. "briefcase"); mapuje ji `packages/ui`. */
  icon: string;
  /** Položka se zobrazí uživateli, který má kterékoli z uvedených oprávnění. */
  permission?: string | readonly string[];
  /** Nadpis sekce v postranním panelu (např. „Obchod“, „Provoz“); bez ní patří položka do sekce „Moduly“. */
  group?: string;
  /** Adresa nadřazené položky: tato se zobrazí pod ní jako podpoložka (modul má v panelu jedno místo). */
  parent?: string;
  /** Položka je kandidátem na spodní lištu mobilní navigace (zobrazí se první tři, které uživatel smí vidět). */
  bottom?: boolean;
};

/** Stránka modulu mimo seznamy entit; adresa i oprávnění jsou v manifestu, vykreslení v UI modulu. */
export type PageDef = {
  /** Např. `/dochazka`; stránka dostane i podadresy (`/dochazka/schvalovani`). */
  path: string;
  title: string;
  permission?: string | readonly string[];
};

export type PermissionDef = {
  /** `<modul>.<akce>`, např. `zakazky.write`. Prefix musí odpovídat id modulu. */
  key: string;
  label: string;
  description?: string;
};

/**
 * Manifest modulu — jediné místo, kterým modul oznamuje jádru, co obsahuje.
 * Pole se rozšiřují s fázemi (entity ve fázi 3, sloty a háčky ve fázi 4);
 * tady je jen to, co jádro už umí číst.
 */
/** Výchozí data modulu (pipeline, číselníky, číselné řady). Doplní se při seedu klienta, jen když modul běží. */
export type ModuleSeed = {
  pipelines?: readonly PipelineDef[];
  lookups?: readonly LookupDef[];
  series?: readonly SeriesDef[];
  /** Výchozí sdílené pohledy entit (zakládají se, až existuje první uživatel). */
  views?: readonly SeedViewDef[];
};

export type ModuleManifest = {
  id: ModuleId;
  name: string;
  description: string;
  icon: string;
  /** Moduly, bez kterých tento nefunguje (musí být zapnuté). */
  dependsOn?: readonly ModuleId[];
  nav: readonly NavItem[];
  /** Stránky modulu (kromě seznamů a detailů entit, které vznikají z registru). */
  pages?: readonly PageDef[];
  permissions: readonly PermissionDef[];
  /** Klíče entit modulu v registru entit (fáze 3). */
  entities?: readonly string[];
  /** Události upozornění modulu (katalog, ze kterého čerpá nastavení klienta i předvolby uživatelů). */
  notifications?: readonly AnyEventDef[];
  seed?: ModuleSeed;
};

export function defineModule<const M extends ModuleManifest>(manifest: M): M {
  return manifest;
}

/** Oprávnění, která patří platformě, ne modulu. */
export const CORE_PERMISSIONS: readonly PermissionDef[] = [
  { key: "users.manage", label: "Spravuje uživatele", description: "Pozvánky, role, deaktivace" },
  { key: "roles.manage", label: "Spravuje role a oprávnění" },
  {
    key: "settings.manage",
    label: "Mění nastavení systému",
    description: "Moduly, pipeline, číselníky, číselné řady, branding",
  },
  { key: "audit.read", label: "Vidí historii změn" },
  {
    key: "dashboards.write",
    label: "Skládá vlastní nástěnky",
    description: "Osobní nástěnky z widgetů, jejich klonování a sdílení",
  },
  {
    key: "dashboards.manage",
    label: "Spravuje nástěnky",
    description: "Výchozí nástěnky pro role, cizí a sdílené nástěnky (Nastavení → Nástěnky)",
  },
  {
    key: "exports.schedule",
    label: "Plánuje exporty a sdílí šablony exportů",
    description:
      "Plány (denně, týdně, měsíčně) a sdílené šablony; export samotný vyžaduje čtení dat",
  },
  {
    key: "exports.manage",
    label: "Spravuje exporty všech",
    description: "Vidí historii exportů všech, zastavuje cizí plány a mění nastavení exportů",
  },
  {
    key: "tasks.read",
    label: "Vidí úkoly",
    description: "Rozsah „vše“ = úkoly všech, jinak jen vlastní a zadané",
  },
  { key: "tasks.assign", label: "Přiděluje úkoly ostatním" },
  { key: "comments.moderate", label: "Maže cizí komentáře" },
  { key: "files.manage", label: "Spravuje cizí soubory" },
  {
    key: "employees.read",
    label: "Vidí údaje zaměstnanců",
    description: "Včetně hodinového nákladu",
  },
  { key: "employees.write", label: "Upravuje údaje zaměstnanců" },
  {
    key: "agency.access",
    label: "Servisní přístup agentury",
    description: "Jen když ho klient povolí",
  },
];
