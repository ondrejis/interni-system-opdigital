import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { Executor } from "../db/client";
import type { ModuleId } from "../modules/ids";
import type { Ctx } from "../rbac/types";
import type { FilterGroup } from "./operators";

/** Typy atributů záznamů. Z typu plyne editor v buňce, dostupné filtry, řazení i validace. */
export const ATTRIBUTE_TYPES = [
  "text",
  "longtext",
  "number",
  "currency",
  "date",
  "status",
  "select",
  "multiselect",
  "user",
  "record",
  "checkbox",
  "url",
  "phone",
  "email",
] as const;
export type AttributeType = (typeof ATTRIBUTE_TYPES)[number];

export type Choice = { value: string; label: string; color?: string };

export type AttributeDef = {
  key: string;
  label: string;
  type: AttributeType;
  /** Název vlastnosti v Drizzle tabulce (nativní atribut). */
  field?: string;
  /** Hodnota je ve sloupci `custom` (vlastní pole definované v administraci). */
  custom?: boolean;
  /** Možnosti pro `select` a `multiselect`. */
  choices?: readonly Choice[];
  /** Možnosti z číselníku v administraci (klíč číselníku); nahradí `choices` při sestavení entity. */
  lookup?: string;
  /**
   * Zúžení položek číselníku `lookup` na tuto entitu (štítky: `lookup: "tag"`, `lookupScope: "company"` nabídne jen
   * štítky, jejichž `lookup_item.scopes` obsahují klíč entity nebo jsou prázdné). Jen typ do C1.
   */
  lookupScope?: string;
  /** Cílový typ záznamu pro `record`. */
  record?: { entityType: string };
  /** Pipeline, ze které jsou stavy (`status`). */
  pipeline?: { entityType: string; key: string };
  readonly?: boolean;
  required?: boolean;
  /**
   * Oprávnění ke čtení atributu (např. `finance.read` u cen a plateb). Aktér bez něj atribut nevidí
   * ani nenajde: chybí v popisu, v řádcích, součtech, filtrech i řazení a nejde ho zapsat.
   */
  permission?: string;
  /** Nejmenší a největší povolená hodnota (`number`, `currency`; u částky v haléřích). Porušení vrátí uživateli větu. */
  min?: number;
  max?: number;
  /** Jednotka čísla: `percent` = hodnota v procentech, `percent_bp` = v setinách procenta (500 = 5 %). Jen `number`. */
  unit?: "percent" | "percent_bp";
  /** Výchozí hodnota při zakládání záznamu: dialog ji předvyplní a engine ji doplní, když chybí. */
  default?: string | number | boolean;
  /** Prohledává se při textovém hledání v tabulce (výchozí ano u textových typů). */
  searchable?: boolean;
  filterable?: boolean;
  sortable?: boolean;
  /** Součet za filtrovanou sadu a za skupiny (jen `number` a `currency`). */
  aggregate?: readonly "sum"[];
  /** Výchozí zobrazení sloupce v tabulce a šířka v pixelech. */
  defaultVisible?: boolean;
  width?: number;
};

/** Rychlá předvolba filtru nad seznamem (Moje, Dnes, Po termínu…); zobrazuje C3. */
export type QuickFilterDef = {
  key: string;
  label: string;
  /** Filtr, nebo funkce, která ho složí pro aktéra (např. „Moje“ = `owner = já`). */
  filter: FilterGroup | ((ctx: Ctx) => FilterGroup);
};

/**
 * Vazba záznamu na jiný typ záznamu přes sloupec (rodič pro dědění zámku, dítě pro kaskádu koše a obnovy).
 * `column` je název vlastnosti tabulky (camelCase, např. `dealId`). U dítěte, které není entita (`job_phase`,
 * `deal_participant`), je `entityType` jen označení a `table` je jeho tabulka (C1 přes ni kaskáduje zámek a koš).
 */
export type EntityLink = { entityType: string; column: string; table?: PgTable };

export type EntityDef = {
  /** Klíč entity — shodný s `entity_type` v komentářích, úkolech, souborech a auditu. */
  key: string;
  module: ModuleId;
  label: { one: string; many: string };
  /** Tabulka (Drizzle) s vlastnostmi `id`, `custom`, `createdAt`, `updatedAt`, `deletedAt`. */
  table: PgTable;
  attributes: readonly AttributeDef[];
  /** Atribut, který je název záznamu (v seznamech, detailu, hledání). */
  titleKey: string;
  /** Atribut typu `status`, podle kterého se dělá kanban. */
  statusKey?: string;
  permissions: {
    read: string;
    write: string;
    create?: string;
    delete?: string;
    /** Kdo smí exportovat seznam do souboru (XLSX/CSV celé filtrované sady); bez něj stačí čtení. */
    export?: string;
  };
  /**
   * Záznamy vznikají jen příkazy modulu (doklady, objednávky…); UI nenabízí „Nový“ a engine založení odmítne.
   * Text se ukáže uživateli jako důvod.
   */
  noCreate?: boolean | string;
  /** Záznamy se nemažou (neměnné doklady); UI nenabízí smazání a engine ho odmítne. Text je důvod pro uživatele. */
  noDelete?: boolean | string;
  /** Sloupce s vlastníky pro rozsah „jen moje“. */
  ownerColumns?: readonly AnyPgColumn[];
  /** Vlastní predikát rozsahu „jen moje“ (např. vedoucí nebo člen týmu). Nahrazuje `ownerColumns`. */
  scope?: (ctx: Ctx) => SQL;
  /** Vlastníci jednoho záznamu; `null`, když záznam neexistuje. Výchozí podle `ownerColumns`. */
  owners?: (db: Executor, id: string) => Promise<(string | null)[] | null>;
  /** Hodnoty, které se doplní při vytvoření, aby tvůrce s rozsahem „jen moje“ svůj záznam viděl. */
  ownerDefaults?: (ctx: Ctx) => Record<string, unknown>;
  /** Úprava hodnot těsně před vložením (číslo zakázky, výchozí stav…). Běží v transakci. */
  beforeCreate?: (ctx: Ctx, values: Record<string, unknown>) => Promise<Record<string, unknown>>;
  /**
   * Kontrola a úprava změny těsně před zápisem (v téže transakci). Dostane řádek před změnou a sloupce, které se
   * mění (klíč = sloupec tabulky). Výjimka změnu zamítne (např. přechod fáze zakázky bez splněných podmínek);
   * vrácené sloupce se k změně přidají (např. `phase`, `wonAt`).
   */
  beforeUpdate?: (
    ctx: Ctx,
    before: Record<string, unknown>,
    changes: Record<string, unknown>,
  ) => Promise<Record<string, unknown> | void>;
  /** Reakce na vytvoření záznamu (v téže transakci), např. upozornění přiřazenému. Dostane surový řádek. */
  afterCreate?: (ctx: Ctx, created: Record<string, unknown>) => Promise<void>;
  /** Reakce na změnu záznamu (v téže transakci). Dostane řádek před a po změně. */
  afterUpdate?: (
    ctx: Ctx,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ) => Promise<void>;
  /** Kontrola před smazáním (v téže transakci); výjimka smazání zablokuje (např. vystavená faktura). */
  beforeDelete?: (ctx: Ctx, raw: Record<string, unknown>) => Promise<void>;
  /** Co se o záznamu indexuje pro Cmd+K. */
  search?: (row: Record<string, unknown>) => { title: string; subtitle?: string; extra?: string };
  /** Adresa seznamu v aplikaci, např. `/zakazky`. Záznam je na `<listPath>/<id>`. */
  listPath: string;
  url: (id: string) => string;
  /**
   * Viditelnost shared/private (zámek, D §5.1). Jen typ: chování doplní engine v C1. `parents` = rodiče, od kterých
   * záznam dědí zámek (platí první nenulový sloupec; bez `parents` je záznam kořen s vlastním zámkem), `ownLock` = dítě
   * smí mít i vlastní zámek (výchozí ano), `defaultPrivate` = výchozí hodnota pro majitele při vytvoření.
   */
  visibility?: {
    parents?: readonly EntityLink[];
    ownLock?: boolean;
    defaultPrivate?: boolean;
  };
  /**
   * Sloupce (názvy vlastností tabulky), které nepíše uživatel, ale jiný modul nebo úloha přes `writeSystemFields`
   * (např. `driveFolderId`, `nextActivityAt`). Zapisují se jen touto cestou; C1 je vyřadí z formulářů a z `updateRecord`.
   */
  systemFields?: readonly string[];
  /** Děti záznamu pro kaskádu koše a obnovy (sloupec dítěte odkazuje na `id` tohoto záznamu). Jen typ do C1. */
  children?: readonly EntityLink[];
  /** Rychlé předvolby filtru nad seznamem. Jen typ do C3. */
  quickFilters?: readonly QuickFilterDef[];
  /**
   * Doplní do hledání text, který není ve sloupcích záznamu (telefony a e-maily z kontaktních bodů): vrací pro dané
   * řádky mapu `id → text`. Jen typ do C3.
   */
  searchLoad?: (
    db: Executor,
    rows: readonly Record<string, unknown>[],
  ) => Promise<Record<string, string>>;
};

export function defineEntity(def: EntityDef): EntityDef {
  return def;
}

/** Řádek záznamu: `id`, `updatedAt` (ISO) a hodnoty podle klíče atributu. */
export type RecordRow = { id: string; updatedAt: string; [attributeKey: string]: unknown };

/** Popisky odkazovaných záznamů: `labels[atribut][id]`. */
export type Labels = Record<string, Record<string, { label: string; color?: string }>>;
