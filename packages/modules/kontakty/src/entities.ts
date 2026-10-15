import { and, eq, inArray, isNull } from "drizzle-orm";
import { phoneSearchKeys } from "@rebar/core/contracts";
import {
  countActive,
  defineEntity,
  indexRecord,
  type AttributeDef,
  type DeleteBlocker,
} from "@rebar/core/entities";
import { UserError } from "@rebar/core/rbac";
import { assertIcoFree, icoForStorage } from "./companies";
import { companySearchDoc, personIndex, personSearchDoc } from "./indexing";
import { normalizeEmail, normalizePhoneE164, webDomainOf } from "./normalize";
import { setPrimaryPoint } from "./points";
import {
  CLIENT_STATUSES,
  company,
  person,
  personContactPoint,
  SERVICE_TYPES,
  DRIVE_STATUSES,
} from "./schema";

/** Společný číselník štítků (core `tag`), nabídka se zužuje na entitu přes `lookupScope`. */
export const TAG_LOOKUP = "tag";

/** Popisky stavu klienta. */
export const CLIENT_STATUS_LABELS: Record<(typeof CLIENT_STATUSES)[number], string> = {
  lead: "Lead",
  active: "Aktivní",
  paused: "Pozastavený",
  former: "Bývalý",
};
/** Popisky typů služeb. */
export const SERVICE_LABELS: Record<(typeof SERVICE_TYPES)[number], string> = {
  web: "Web",
  marketing: "Marketing",
  systemy: "Systémy",
};
/** Popisky stavu složky na Disku. */
export const DRIVE_STATUS_LABELS: Record<(typeof DRIVE_STATUSES)[number], string> = {
  none: "Bez složky",
  pending: "Zakládá se",
  ready: "Hotovo",
  error: "Chyba",
  timeout: "Vypršelo",
};

const CLIENT_STATUS_CHOICES = CLIENT_STATUSES.map((v) => ({
  value: v,
  label: CLIENT_STATUS_LABELS[v],
  color: { lead: "blue", active: "green", paused: "yellow", former: "gray" }[v],
}));

const contact = (extra: AttributeDef[]): AttributeDef[] => extra;

/** Hlavní e-mail a telefon zapsané v poli osoby musí mít správný tvar (jinak věta pro uživatele). */
function checkPrimary(email: unknown, phone: unknown): void {
  if (typeof email === "string" && email.trim() && !normalizeEmail(email))
    throw new UserError(`E-mail „${email.trim()}“ nemá správný tvar.`);
  if (typeof phone === "string" && phone.trim() && !normalizePhoneE164(phone))
    throw new UserError(`Telefon „${phone.trim()}“ nemá správný tvar.`);
}

/** Organizace: klienti, potenciální klienti, dodavatelé a ostatní firmy v jedné evidenci (klient = `client_status`). */
export const companyEntity = defineEntity({
  key: "company",
  listPath: "/kontakty/firmy",
  module: "kontakty",
  label: { one: "Organizace", many: "Organizace" },
  table: company,
  titleKey: "name",
  permissions: {
    read: "kontakty.read",
    write: "kontakty.write",
    create: "kontakty.create",
    delete: "kontakty.delete",
    export: "kontakty.export",
  },
  ownerColumns: [company.ownerId],
  ownerDefaults: (ctx) => ({ owner: ctx.actor.userId }),
  visibility: { ownLock: true },
  // `drive_*` píše jen modul Disk, `last_activity_at` modul Úkoly (writeSystemFields)
  systemFields: ["driveFolderId", "driveStatus", "lastActivityAt"],
  quickFilters: [
    {
      key: "mine",
      label: "Moje",
      filter: { op: "and", conditions: [{ attr: "owner", op: "is_me" }] },
    },
  ],
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
    { key: "city", label: "Město", type: "text", field: "city", defaultVisible: true, width: 150 },
    {
      key: "clientStatus",
      label: "Stav klienta",
      type: "select",
      field: "clientStatus",
      choices: CLIENT_STATUS_CHOICES,
      defaultVisible: true,
      width: 140,
    },
    {
      key: "services",
      label: "Služby",
      type: "multiselect",
      field: "services",
      choices: SERVICE_TYPES.map((v) => ({ value: v, label: SERVICE_LABELS[v] })),
      defaultVisible: true,
      width: 180,
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
      key: "lastActivityAt",
      label: "Poslední aktivita",
      type: "date",
      field: "lastActivityAt",
      readonly: true,
      defaultVisible: true,
      width: 140,
    },
    {
      key: "tags",
      label: "Štítky",
      type: "multiselect",
      field: "tags",
      lookup: TAG_LOOKUP,
      lookupScope: "company",
      defaultVisible: true,
      width: 200,
    },
    {
      key: "officialName",
      label: "Oficiální název",
      type: "text",
      field: "officialName",
      width: 240,
    },
    { key: "dic", label: "DIČ", type: "text", field: "dic", width: 120 },
    { key: "legalForm", label: "Právní forma", type: "text", field: "legalForm", width: 140 },
    { key: "street", label: "Ulice", type: "text", field: "street", width: 180 },
    { key: "zip", label: "PSČ", type: "text", field: "zip", width: 90 },
    { key: "country", label: "Země", type: "text", field: "country", width: 90 },
    { key: "web", label: "Web", type: "url", field: "web", width: 200 },
    { key: "email", label: "E-mail", type: "email", field: "email", width: 220 },
    { key: "phone", label: "Telefon", type: "phone", field: "phone", width: 150 },
    { key: "industry", label: "Obor", type: "text", field: "industry", width: 160 },
    { key: "clientSince", label: "Klient od", type: "date", field: "clientSince", width: 120 },
    { key: "clientUntil", label: "Klient do", type: "date", field: "clientUntil", width: 120 },
    {
      key: "clientEndReason",
      label: "Důvod ukončení",
      type: "longtext",
      field: "clientEndReason",
      width: 240,
    },
    {
      key: "driveStatus",
      label: "Složka na Disku",
      type: "select",
      field: "driveStatus",
      choices: DRIVE_STATUSES.map((v) => ({ value: v, label: DRIVE_STATUS_LABELS[v] })),
      readonly: true,
      width: 140,
    },
    {
      key: "aresSyncedAt",
      label: "ARES aktualizováno",
      type: "date",
      field: "aresSyncedAt",
      readonly: true,
      width: 150,
    },
    {
      key: "webDomain",
      label: "Doména webu",
      type: "text",
      field: "webDomain",
      readonly: true,
      width: 160,
    },
  ]),
  search: companySearchDoc,
  // IČO se normalizuje a musí být volné (ORG-05), doména webu se odvodí z adresy (ORG-06). ARES se při ukládání
  // nevolá: uložení funguje i při jeho výpadku (ORG-04).
  beforeCreate: async (ctx, input) => {
    const out = { ...input };
    const ico = icoForStorage(input.ico);
    await assertIcoFree(ctx, ico);
    if (ico) out.ico = ico;
    else delete out.ico;
    const domain = webDomainOf(typeof input.web === "string" ? input.web : null);
    if (domain) out.webDomain = domain;
    return out;
  },
  beforeUpdate: async (ctx, before, changes) => {
    const extra: Record<string, unknown> = {};
    if ("ico" in changes) {
      const ico = icoForStorage(changes.ico);
      if (ico !== (before.ico ?? null)) await assertIcoFree(ctx, ico, String(before.id));
      extra.ico = ico;
    }
    if ("web" in changes) extra.webDomain = webDomainOf(changes.web as string | null);
    return extra;
  },
  url: (id) => `/kontakty/firmy/${id}`,
});

/** Kontaktní osoby, volitelně u organizace; e-maily a telefony jsou v `person_contact_point`. */
export const personEntity = defineEntity({
  key: "person",
  listPath: "/kontakty/osoby",
  module: "kontakty",
  label: { one: "Kontakt", many: "Kontakty" },
  table: person,
  titleKey: "fullName",
  permissions: {
    read: "kontakty.read",
    write: "kontakty.write",
    create: "kontakty.create",
    delete: "kontakty.delete",
    export: "kontakty.export",
  },
  ownerColumns: [person.ownerId],
  ownerDefaults: (ctx) => ({ owner: ctx.actor.userId }),
  visibility: { ownLock: true },
  // `last_activity_at` píše modul Úkoly (writeSystemFields)
  systemFields: ["lastActivityAt"],
  quickFilters: [
    {
      key: "mine",
      label: "Moje",
      filter: { op: "and", conditions: [{ attr: "owner", op: "is_me" }] },
    },
  ],
  attributes: contact([
    {
      key: "fullName",
      label: "Jméno",
      type: "text",
      field: "fullName",
      readonly: true,
      width: 240,
      defaultVisible: true,
    },
    { key: "firstName", label: "Křestní jméno", type: "text", field: "firstName", width: 160 },
    {
      key: "lastName",
      label: "Příjmení",
      type: "text",
      field: "lastName",
      required: true,
      width: 180,
    },
    {
      key: "company",
      label: "Organizace",
      type: "record",
      field: "primaryCompanyId",
      record: { entityType: "company" },
      defaultVisible: true,
      width: 220,
    },
    {
      key: "position",
      label: "Pozice",
      type: "text",
      field: "position",
      defaultVisible: true,
      width: 160,
    },
    // hlavní telefon a e-mail: zápis do pole upraví i hlavní kontaktní údaj osoby (další jsou v detailu)
    {
      key: "phone",
      label: "Telefon",
      type: "phone",
      field: "primaryPhone",
      defaultVisible: true,
      width: 150,
    },
    {
      key: "email",
      label: "E-mail",
      type: "email",
      field: "primaryEmail",
      defaultVisible: true,
      width: 220,
    },
    {
      key: "isDecisionMaker",
      label: "Rozhoduje",
      type: "checkbox",
      field: "isDecisionMaker",
      defaultVisible: true,
      width: 110,
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
      key: "lastActivityAt",
      label: "Poslední aktivita",
      type: "date",
      field: "lastActivityAt",
      readonly: true,
      defaultVisible: true,
      width: 140,
    },
    {
      key: "tags",
      label: "Štítky",
      type: "multiselect",
      field: "tags",
      lookup: TAG_LOOKUP,
      lookupScope: "person",
      width: 200,
    },
    { key: "linkedin", label: "LinkedIn", type: "url", field: "linkedin", width: 200 },
  ]),
  search: personSearchDoc,
  // všechny telefony a e-maily osoby (ne jen hlavní) se hledají; telefon podčástí čísla bez předvolby (C3)
  searchLoad: async (db, rows) => {
    const ids = rows.map((r) => String(r.id));
    if (!ids.length) return {};
    const points = await db
      .select({
        personId: personContactPoint.personId,
        kind: personContactPoint.kind,
        value: personContactPoint.value,
        valueNorm: personContactPoint.valueNorm,
      })
      .from(personContactPoint)
      .where(and(inArray(personContactPoint.personId, ids), isNull(personContactPoint.deletedAt)));
    const out: Record<string, string> = {};
    for (const p of points) {
      const keys = p.kind === "phone" ? phoneSearchKeys(p.value).join(" ") : "";
      out[p.personId] = `${out[p.personId] ?? ""} ${p.valueNorm} ${keys}`.trim();
    }
    return out;
  },
  // hlavní telefon a e-mail zapsané v poli se promítnou do kontaktních údajů osoby (KON-01, KON-03)
  beforeCreate: async (_ctx, input) => {
    checkPrimary(input.email, input.phone);
    return input;
  },
  afterCreate: async (ctx, created) => {
    const id = String(created.id);
    if (created.primaryEmail) await setPrimaryPoint(ctx, id, "email", String(created.primaryEmail));
    if (created.primaryPhone) await setPrimaryPoint(ctx, id, "phone", String(created.primaryPhone));
  },
  beforeUpdate: async (_ctx, _before, changes) => {
    checkPrimary(changes.primaryEmail, changes.primaryPhone);
  },
  afterUpdate: async (ctx, before, after) => {
    const id = String(after.id);
    let changed = false;
    const patch: Record<string, unknown> = {};
    for (const [kind, key] of [
      ["email", "primaryEmail"],
      ["phone", "primaryPhone"],
    ] as const) {
      if ((before[key] ?? null) === (after[key] ?? null)) continue;
      const written = await setPrimaryPoint(ctx, id, kind, (after[key] as string | null) ?? null);
      if ((written ?? null) !== (after[key] ?? null)) {
        patch[key] = written ?? null; // smazaný hlavní údaj nahradil další
        changed = true;
      }
    }
    if (changed) {
      const [row] = await ctx.db.update(person).set(patch).where(eq(person.id, id)).returning();
      if (row) await indexRecord(ctx.db, personIndex, row as Record<string, unknown>);
    }
  },
  url: (id) => `/kontakty/osoby/${id}`,
});

export const entities = [companyEntity, personEntity];
export { company, person };

/** Organizace s kontaktními osobami se nemaže, dokud osoby nikdo nepřesune nebo nesmaže. */
export const deleteBlockers: DeleteBlocker[] = [
  {
    id: "kontakty.company-people",
    entity: "company",
    noun: ["osobu", "osoby", "osob"],
    count: (ctx, id) => countActive(ctx, person, eq(person.primaryCompanyId, id)),
  },
];
