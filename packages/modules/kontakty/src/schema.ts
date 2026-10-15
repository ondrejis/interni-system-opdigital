import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  audit,
  pk,
  schema,
  trigramIndex,
  ts,
  visibilityColumns,
  visibilityIndex,
} from "@rebar/core/db";

const { user } = schema;

/** Stav klienta u organizace (`company.client_status`); `null` = organizace není klient (jen kontakt, dodavatel…). */
export const CLIENT_STATUSES = ["lead", "active", "paused", "former"] as const;
/** Stav složky na Google Disku u organizace (zapisuje jen modul Disk). */
export const DRIVE_STATUSES = ["none", "pending", "ready", "error", "timeout"] as const;
/** Typy služeb, které agentura klientovi poskytuje (`company.services`). */
export const SERVICE_TYPES = ["web", "marketing", "systemy"] as const;

/** Kontext klienta: čtyři pojmenovaná pole upravovaná na místě (R-27). */
export type ClientContext = {
  decisionMaker?: string;
  howToCommunicate?: string;
  history?: string;
  notes?: string;
};

/**
 * Organizace. Klient je organizace se `client_status` (ne samostatná entita). IČO je mezi živými záznamy unikátní.
 * Viditelnost: kořen s vlastním zámkem (soukromá organizace nedědí do obchodů ani zakázek, R-31).
 * `drive_*` píše jen modul Disk, `last_activity_at` modul Úkoly (oboje přes `writeSystemFields`).
 */
export const company = pgTable(
  "company",
  {
    id: pk(),
    name: text("name").notNull(),
    officialName: text("official_name"),
    ico: text("ico"),
    dic: text("dic"),
    legalForm: text("legal_form"),
    street: text("street"),
    city: text("city"),
    zip: text("zip"),
    country: text("country").notNull().default("CZ"),
    web: text("web"),
    /** Doména z webu (bez `www.`), pro kontrolu duplicit (ORG-06). */
    webDomain: text("web_domain"),
    email: text("email"),
    phone: text("phone"),
    industry: text("industry"),
    ownerId: uuid("owner_id").references(() => user.id),
    clientStatus: text("client_status", { enum: CLIENT_STATUSES }),
    /** Datum prvního přechodu do stavu `active` (R-17); později se nemění. */
    clientSince: date("client_since", { mode: "string" }),
    clientUntil: date("client_until", { mode: "string" }),
    clientEndReason: text("client_end_reason"),
    services: text("services")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    clientContext: jsonb("client_context")
      .$type<ClientContext>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    driveFolderId: text("drive_folder_id"),
    driveStatus: text("drive_status", { enum: DRIVE_STATUSES }).notNull().default("none"),
    aresSyncedAt: ts("ares_synced_at"),
    /** Poslední dokončená aktivita (úkol, hovor, schůzka…) u klienta; píše modul Úkoly. */
    lastActivityAt: ts("last_activity_at"),
    ...visibilityColumns(),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    custom: jsonb("custom")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...audit(),
  },
  (t) => [
    uniqueIndex("company_ico_uq")
      .on(t.ico)
      .where(sql`${t.ico} is not null and ${t.deletedAt} is null`),
    trigramIndex("company_name_trgm_idx", t.name),
    trigramIndex("company_official_name_trgm_idx", t.officialName),
    trigramIndex("company_ico_trgm_idx", t.ico),
    trigramIndex("company_city_trgm_idx", t.city),
    trigramIndex("company_email_trgm_idx", t.email),
    trigramIndex("company_phone_trgm_idx", t.phone),
    trigramIndex("company_web_domain_trgm_idx", t.webDomain),
    index("company_web_domain_idx")
      .on(t.webDomain)
      .where(sql`${t.webDomain} is not null`),
    index("company_owner_idx").on(t.ownerId),
    index("company_client_status_idx")
      .on(t.clientStatus)
      .where(sql`${t.clientStatus} is not null`),
    index("company_services_idx").using("gin", t.services),
    index("company_tags_idx").using("gin", t.tags),
    index("company_custom_idx").using("gin", t.custom),
    visibilityIndex("company_private_idx", t),
  ],
);

/**
 * Kontaktní osoba. Jméno se skládá ze `first_name` a `last_name` (`full_name` je generovaný sloupec pro název záznamu,
 * hledání a řazení). E-maily a telefony jsou v `person_contact_point`; hlavní firma je `primary_company_id`,
 * další firmy jsou v `person_company`.
 */
export const person = pgTable(
  "person",
  {
    id: pk(),
    firstName: text("first_name"),
    lastName: text("last_name").notNull(),
    fullName: text("full_name").generatedAlwaysAs(
      sql`btrim(coalesce(first_name, '') || ' ' || last_name)`,
    ),
    position: text("position"),
    primaryCompanyId: uuid("primary_company_id").references(() => company.id),
    linkedin: text("linkedin"),
    isDecisionMaker: boolean("is_decision_maker").notNull().default(false),
    /**
     * Hlavní e-mail a telefon osoby tak, jak je zapsal uživatel (denormalizace z `person_contact_point` pro seznam,
     * hledání a rychlé volání). Zdroj pravdy jsou kontaktní údaje; sloupce udržují `points.ts` a háčky entity.
     */
    primaryEmail: text("primary_email"),
    primaryPhone: text("primary_phone"),
    /** Poslední dokončená aktivita u osoby (hovor, schůzka…); píše modul Úkoly přes `writeSystemFields`. */
    lastActivityAt: ts("last_activity_at"),
    ownerId: uuid("owner_id").references(() => user.id),
    ...visibilityColumns(),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    custom: jsonb("custom")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...audit(),
  },
  (t) => [
    check("person_last_name_chk", sql`btrim(${t.lastName}) <> ''`),
    trigramIndex("person_full_name_trgm_idx", t.fullName),
    trigramIndex("person_position_trgm_idx", t.position),
    trigramIndex("person_primary_email_trgm_idx", t.primaryEmail),
    trigramIndex("person_primary_phone_trgm_idx", t.primaryPhone),
    index("person_primary_company_idx").on(t.primaryCompanyId),
    index("person_owner_idx").on(t.ownerId),
    index("person_decision_idx")
      .on(t.primaryCompanyId)
      .where(sql`${t.isDecisionMaker}`),
    index("person_tags_idx").using("gin", t.tags),
    index("person_custom_idx").using("gin", t.custom),
    visibilityIndex("person_private_idx", t),
  ],
);

/** Druh kontaktního údaje osoby. */
export const CONTACT_POINT_KINDS = ["email", "phone"] as const;
/** Štítek kontaktního údaje: práce, mobil, soukromý. */
export const CONTACT_POINT_LABELS = ["work", "mobile", "private"] as const;

/**
 * E-mail nebo telefon osoby se štítkem. `value_norm` je normalizovaná hodnota pro porovnání a hledání (e-mail malými
 * písmeny, telefon v E.164). Duplicity mezi osobami se jen hlásí (KON-03), unikátní je údaj jen u jedné osoby
 * a jen jeden údaj daného druhu je hlavní.
 */
export const personContactPoint = pgTable(
  "person_contact_point",
  {
    id: pk(),
    personId: uuid("person_id")
      .notNull()
      .references(() => person.id),
    kind: text("kind", { enum: CONTACT_POINT_KINDS }).notNull(),
    value: text("value").notNull(),
    valueNorm: text("value_norm").notNull(),
    label: text("label", { enum: CONTACT_POINT_LABELS }),
    isPrimary: boolean("is_primary").notNull().default(false),
    position: integer("position").notNull().default(0),
    ...audit(),
  },
  (t) => [
    index("person_contact_point_person_idx").on(t.personId),
    index("person_contact_point_norm_idx").on(t.kind, t.valueNorm),
    trigramIndex("person_contact_point_norm_trgm_idx", t.valueNorm),
    uniqueIndex("person_contact_point_value_uq")
      .on(t.personId, t.kind, t.valueNorm)
      .where(sql`${t.deletedAt} is null`),
    uniqueIndex("person_contact_point_primary_uq")
      .on(t.personId, t.kind)
      .where(sql`${t.isPrimary} and ${t.deletedAt} is null`),
  ],
);

/**
 * Další organizace osoby (kromě hlavní, ta je v `person.primary_company_id`) s rolí a pozicí v nich. `is_primary` je
 * vždy `false`; hlavní firma se do této tabulky nezapisuje (dotazy čtou obě místa).
 */
export const personCompany = pgTable(
  "person_company",
  {
    id: pk(),
    personId: uuid("person_id")
      .notNull()
      .references(() => person.id),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    role: text("role"),
    position: text("position"),
    isPrimary: boolean("is_primary").notNull().default(false),
    ...audit(),
  },
  (t) => [
    uniqueIndex("person_company_uq")
      .on(t.personId, t.companyId)
      .where(sql`${t.deletedAt} is null`),
    index("person_company_company_idx").on(t.companyId),
  ],
);

/** Cache odpovědí ARES podle IČO (24 h, ORG-04); technická tabulka bez soft-delete. */
export const aresCache = pgTable("ares_cache", {
  ico: text("ico").primaryKey(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  fetchedAt: ts("fetched_at").notNull().defaultNow(),
});
