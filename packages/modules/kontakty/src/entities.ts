import {
  countActive,
  defineEntity,
  type AttributeDef,
  type DeleteBlocker,
} from "@rebar/core/entities";
import { eq } from "drizzle-orm";
import { company, person, COMPANY_ROLES } from "./schema";

/** Číselníky kontaktů (správa v Nastavení → Číselníky; výchozí položky jsou v manifestu modulu). */
export const COMPANY_TYPE_LOOKUP = "company.type";
export const PERSON_ROLE_LOOKUP = "person.role";
export const POINT_TYPE_LOOKUP = "contact.point_type";
export const TAG_LOOKUP = "contact.tag";

const ROLE_LABELS: Record<(typeof COMPANY_ROLES)[number], string> = {
  client: "Klient",
  supplier: "Dodavatel",
  subcontractor: "Subdodavatel",
};

const contact = (extra: AttributeDef[]): AttributeDef[] => extra;

/** Firmy: klienti, dodavatelé a subdodavatelé v jedné evidenci. */
export const companyEntity = defineEntity({
  key: "company",
  listPath: "/kontakty/firmy",
  module: "kontakty",
  label: { one: "Firma", many: "Firmy" },
  table: company,
  titleKey: "name",
  permissions: { read: "kontakty.read", write: "kontakty.write" },
  ownerColumns: [company.ownerId],
  ownerDefaults: (ctx) => ({ owner: ctx.actor.userId }),
  attributes: contact([
    {
      key: "name",
      label: "Název",
      type: "text",
      field: "name",
      required: true,
      width: 280,
      defaultVisible: true,
    },
    { key: "ico", label: "IČO", type: "text", field: "ico", width: 110, defaultVisible: true },
    {
      key: "roles",
      label: "Role",
      type: "multiselect",
      field: "roles",
      choices: COMPANY_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] })),
      defaultVisible: true,
      width: 170,
    },
    { key: "city", label: "Město", type: "text", field: "city", defaultVisible: true, width: 150 },
    {
      key: "email",
      label: "E-mail",
      type: "email",
      field: "email",
      defaultVisible: true,
      width: 220,
    },
    {
      key: "phone",
      label: "Telefon",
      type: "phone",
      field: "phone",
      defaultVisible: true,
      width: 150,
    },
    {
      key: "owner",
      label: "Vlastník",
      type: "user",
      field: "ownerId",
      defaultVisible: true,
      width: 160,
    },
    {
      key: "type",
      label: "Typ kontaktu",
      type: "select",
      field: "type",
      lookup: COMPANY_TYPE_LOOKUP,
      defaultVisible: true,
      width: 160,
    },
    {
      key: "parent",
      label: "Mateřská firma",
      type: "record",
      field: "parentId",
      record: { entityType: "company" },
      width: 200,
    },
    {
      key: "tags",
      label: "Štítky",
      type: "multiselect",
      field: "tags",
      lookup: TAG_LOOKUP,
      width: 200,
    },
    { key: "dic", label: "DIČ", type: "text", field: "dic", width: 120 },
    { key: "street", label: "Ulice", type: "text", field: "street", width: 180 },
    { key: "zip", label: "PSČ", type: "text", field: "zip", width: 90 },
    { key: "web", label: "Web", type: "url", field: "web", width: 200 },
    { key: "note", label: "Poznámka", type: "longtext", field: "note", width: 260 },
  ]),
  search: (r) => ({
    title: String(r.name),
    ...(r.city || r.ico ? { subtitle: [r.city, r.ico].filter(Boolean).join(" · ") } : {}),
    extra: [r.ico, r.email, r.phone, r.dic].filter(Boolean).join(" "),
  }),
  url: (id) => `/kontakty/firmy/${id}`,
});

/** Kontaktní osoby, volitelně u firmy. */
export const personEntity = defineEntity({
  key: "person",
  listPath: "/kontakty/osoby",
  module: "kontakty",
  label: { one: "Osoba", many: "Osoby" },
  table: person,
  titleKey: "name",
  permissions: { read: "kontakty.read", write: "kontakty.write" },
  ownerColumns: [person.ownerId],
  ownerDefaults: (ctx) => ({ owner: ctx.actor.userId }),
  attributes: contact([
    {
      key: "name",
      label: "Jméno",
      type: "text",
      field: "name",
      required: true,
      width: 240,
      defaultVisible: true,
    },
    {
      key: "company",
      label: "Firma",
      type: "record",
      field: "companyId",
      record: { entityType: "company" },
      defaultVisible: true,
      width: 220,
    },
    {
      key: "position",
      label: "Funkce",
      type: "text",
      field: "position",
      defaultVisible: true,
      width: 160,
    },
    {
      key: "role",
      label: "Role",
      type: "select",
      field: "role",
      lookup: PERSON_ROLE_LOOKUP,
      defaultVisible: true,
      width: 150,
    },
    {
      key: "tags",
      label: "Štítky",
      type: "multiselect",
      field: "tags",
      lookup: TAG_LOOKUP,
      width: 200,
    },
    {
      key: "emailType",
      label: "Typ e-mailu",
      type: "select",
      field: "emailType",
      lookup: POINT_TYPE_LOOKUP,
      width: 120,
    },
    {
      key: "phoneType",
      label: "Typ telefonu",
      type: "select",
      field: "phoneType",
      lookup: POINT_TYPE_LOOKUP,
      width: 120,
    },
    {
      key: "email",
      label: "E-mail",
      type: "email",
      field: "email",
      defaultVisible: true,
      width: 220,
    },
    {
      key: "phone",
      label: "Telefon",
      type: "phone",
      field: "phone",
      defaultVisible: true,
      width: 150,
    },
    {
      key: "owner",
      label: "Vlastník",
      type: "user",
      field: "ownerId",
      defaultVisible: true,
      width: 160,
    },
    { key: "note", label: "Poznámka", type: "longtext", field: "note", width: 260 },
  ]),
  search: (r) => ({
    title: String(r.name),
    ...(r.position ? { subtitle: String(r.position) } : {}),
    extra: [r.email, r.phone].filter(Boolean).join(" "),
  }),
  url: (id) => `/kontakty/osoby/${id}`,
});

export const entities = [companyEntity, personEntity];
export { company, person };

/** Firma s kontaktními osobami se nemaže, dokud osoby nikdo nepřesune nebo nesmaže. */
export const deleteBlockers: DeleteBlocker[] = [
  {
    id: "kontakty.company-people",
    entity: "company",
    noun: ["osobu", "osoby", "osob"],
    count: (ctx, id) => countActive(ctx, person, eq(person.companyId, id)),
  },
];
