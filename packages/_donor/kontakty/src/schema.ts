import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { audit, pk, schema, ts } from "@rebar/core/db";

const { user } = schema;

/** Role firmy v systému. Jedna firma může být zároveň klient i dodavatel. */
export const COMPANY_ROLES = ["client", "supplier", "subcontractor"] as const;

/** Firma: klient, dodavatel nebo subdodavatel. IČO je mezi živými záznamy unikátní. */
export const company = pgTable(
  "company",
  {
    id: pk(),
    name: text("name").notNull(),
    ico: text("ico"),
    dic: text("dic"),
    street: text("street"),
    city: text("city"),
    zip: text("zip"),
    email: text("email"),
    phone: text("phone"),
    web: text("web"),
    note: text("note"),
    roles: text("roles")
      .array()
      .notNull()
      .default(sql`'{client}'::text[]`),
    /** Typ kontaktu v obchodě (číselník `company.type`: investor, architekt, projektant, subdodavatel…). */
    type: text("type"),
    /** Mateřská firma (skupina, holding); dceřiné a související firmy se z ní odvozují. */
    parentId: uuid("parent_company_id").references((): AnyPgColumn => company.id),
    /** Štítky (číselník `contact.tag`, spravuje se v Nastavení → Číselníky). */
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    ownerId: uuid("owner_id").references(() => user.id),
    aresCheckedAt: ts("ares_checked_at"),
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
    index("company_name_trgm_idx").using("gin", sql`lower(f_unaccent(${t.name})) gin_trgm_ops`),
    index("company_ico_trgm_idx").using("gin", sql`lower(f_unaccent(${t.ico})) gin_trgm_ops`),
    index("company_city_trgm_idx").using("gin", sql`lower(f_unaccent(${t.city})) gin_trgm_ops`),
    index("company_email_trgm_idx").using("gin", sql`lower(f_unaccent(${t.email})) gin_trgm_ops`),
    index("company_phone_trgm_idx").using("gin", sql`lower(f_unaccent(${t.phone})) gin_trgm_ops`),
    index("company_dic_trgm_idx").using("gin", sql`lower(f_unaccent(${t.dic})) gin_trgm_ops`),
    index("company_street_trgm_idx").using("gin", sql`lower(f_unaccent(${t.street})) gin_trgm_ops`),
    index("company_zip_trgm_idx").using("gin", sql`lower(f_unaccent(${t.zip})) gin_trgm_ops`),
    index("company_web_trgm_idx").using("gin", sql`lower(f_unaccent(${t.web})) gin_trgm_ops`),
    index("company_owner_idx").on(t.ownerId),
    index("company_parent_idx").on(t.parentId),
    index("company_custom_idx").using("gin", t.custom),
  ],
);

/** Kontaktní osoba, volitelně u firmy. */
export const person = pgTable(
  "person",
  {
    id: pk(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    position: text("position"),
    /** Role osoby v obchodě (číselník `person.role`: investor, projektant, TDI…); role na konkrétní zakázce je u účastníka. */
    role: text("role"),
    /** Typ hlavního e-mailu a telefonu (číselník `contact.point_type`); další údaje jsou v `person_contact_point`. */
    emailType: text("email_type"),
    phoneType: text("phone_type"),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Firma je volitelná: soukromý investor je osoba bez firmy. */
    companyId: uuid("company_id").references(() => company.id),
    note: text("note"),
    ownerId: uuid("owner_id").references(() => user.id),
    custom: jsonb("custom")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...audit(),
  },
  (t) => [
    index("person_name_trgm_idx").using("gin", sql`lower(f_unaccent(${t.name})) gin_trgm_ops`),
    index("person_position_trgm_idx").using(
      "gin",
      sql`lower(f_unaccent(${t.position})) gin_trgm_ops`,
    ),
    index("person_email_trgm_idx").using("gin", sql`lower(f_unaccent(${t.email})) gin_trgm_ops`),
    index("person_phone_trgm_idx").using("gin", sql`lower(f_unaccent(${t.phone})) gin_trgm_ops`),
    index("person_company_idx").on(t.companyId),
    index("person_owner_idx").on(t.ownerId),
    index("person_custom_idx").using("gin", t.custom),
  ],
);

/**
 * Další e-maily a telefony osoby s typem (práce, mobil, domů…). Hlavní e-mail a telefon zůstávají ve sloupcích osoby
 * (`person.email`, `person.phone`) kvůli hledání a kontrole duplicit; tady jsou jen doplňující údaje.
 */
export const personContactPoint = pgTable(
  "person_contact_point",
  {
    id: pk(),
    personId: uuid("person_id")
      .notNull()
      .references(() => person.id),
    /** `email` nebo `phone`. */
    kind: text("kind").notNull(),
    value: text("value").notNull(),
    /** Typ údaje (klíč číselníku `contact.point_type`). */
    label: text("label"),
    position: integer("position").notNull().default(0),
    ...audit(),
  },
  (t) => [
    index("person_contact_point_person_idx").on(t.personId),
    index("person_contact_point_value_idx").on(t.kind, t.value),
  ],
);
