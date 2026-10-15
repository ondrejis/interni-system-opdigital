import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { recordAudit } from "@rebar/core/audit";
import type { Executor } from "@rebar/core/db";
import { assertEntityAccess, deleteRecord, indexRecord, resolveEntity } from "@rebar/core/entities";
import { inTx, NotFoundError, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import type { MergePreview } from "./contract";
import { companyEntity, personEntity } from "./entities";
import { companyIndex, personIndex } from "./indexing";
import { webDomainOf } from "./normalize";
import { company, person, personCompany, personContactPoint } from "./schema";

/**
 * Sloučení duplicitních organizací a kontaktů (organizace do organizace, osoba do osoby; ORG-07, KON-03).
 *
 * Odkazy na záznam se nehledají ručním výčtem tabulek (ten by zastaral s každým novým modulem a nejde přes moduly,
 * které ještě nejsou hotové), ale v katalogu databáze (`discoverReferences`):
 *  1. cizí klíče na `company(id)` / `person(id)`,
 *  2. sloupce `company_id` / `person_id` bez cizího klíče (obchody, zakázky, úkoly, poznámky, platby, události
 *     v kalendáři… jejich vazby jsou měkké podle D §0),
 *  3. polymorfní vazby `entity_type` + `entity_id` (komentáře, soubory, složky na Disku, odeslané e-maily).
 * Díky tomu sloučení přesune i data modulů, které vzniknou později, bez zásahu do tohoto souboru. Test
 * (`kontakty-merge.int.test.ts`) hlídá, že všechny tabulky z modulů OPSYS jsou v odkazech.
 *
 * Výjimky: `audit_log`, `search_document`, `private_record`, `recent_record` a `inbound_event` se nepřepisují
 * (historie zůstane u původního id, hledání se přeindexuje, zámek se nesmí přenést na hlavní záznam).
 */
export type MergeEntity = "company" | "person";
export type { MergePreview } from "./contract";

/** Sloupec, který odkazuje na firmu nebo osobu (cizí klíč, nebo měkká vazba pojmenovaná `company_id` / `person_id`). */
export type RefColumn = {
  table: string;
  column: string;
  type: "uuid" | "text";
  kind: "fk" | "soft";
};
/** Polymorfní vazba: typ záznamu a jeho id ve dvou sloupcích. */
export type PolyRef = {
  table: string;
  typeColumn: string;
  idColumn: string;
  idType: "uuid" | "text";
};
/** Všechny odkazy na firmu nebo osobu zjištěné v databázi: sloupce a polymorfní vazby. */
export type MergeRefs = { columns: RefColumn[]; poly: PolyRef[] };

/** Polymorfní tabulky, které se nepřepisují (historie změn, index hledání, zámek, nedávné záznamy, příchozí události). */
const POLY_SKIP = new Set([
  "audit_log",
  "search_document",
  "private_record",
  "recent_record",
  "inbound_event",
]);

/** Názvy souvisejících záznamů v náhledu (množné číslo, 2.–4. pád se v náhledu nepoužívá). */
const LABELS: Record<string, string> = {
  job: "zakázky",
  job_participant: "účasti na zakázkách",
  deal: "obchody",
  deal_participant: "účasti v obchodech",
  task: "úkoly",
  note: "poznámky",
  payment: "platby",
  person: "kontaktní osoby",
  person_company: "vazby osob na organizace",
  ad_account: "reklamní účty",
  recurring_service: "hostingy a služby",
  web_domain: "domény",
  calendar_event: "události v kalendáři",
  comment: "komentáře",
  attachment: "soubory",
  email_log: "odeslané e-maily",
  drive_folder: "složky na Disku",
  drive_request: "požadavky na složky",
  notification: "upozornění",
  person_contact_point: "další kontaktní údaje",
};
const labelOf = (table: string) => LABELS[table] ?? table.replace(/_/g, " ");

type Rows<T> = T[];
const rows = <T>(r: unknown) => r as Rows<T>;

/** Tabulka, jejíž řádky se mažou „měkce“ (`deleted_at`). */
async function softDeletable(db: Executor): Promise<Set<string>> {
  const r = rows<{ t: string }>(
    await db.execute(sql`
      select table_name as t from information_schema.columns
      where table_schema = 'public' and column_name = 'deleted_at'`),
  );
  return new Set(r.map((x) => x.t));
}

/** Najde v katalogu databáze všechno, co odkazuje na firmu nebo osobu (viz popis nahoře). */
export async function discoverReferences(db: Executor, entity: MergeEntity): Promise<MergeRefs> {
  const table = entity;
  const fk = rows<{ t: string; c: string; ty: string }>(
    await db.execute(sql`
      select cl.relname as t, a.attname as c, case when a.atttypid = 'uuid'::regtype then 'uuid' else 'text' end as ty
      from pg_constraint k
      join pg_class cl on cl.oid = k.conrelid
      join pg_namespace n on n.oid = cl.relnamespace and n.nspname = 'public'
      join pg_attribute a on a.attrelid = k.conrelid and a.attnum = any (k.conkey)
      where k.contype = 'f' and k.confrelid = ${`public.${table}`}::regclass
      order by 1, 2`),
  );
  const columns: RefColumn[] = fk.map((r) => ({
    table: r.t,
    column: r.c,
    type: r.ty === "uuid" ? "uuid" : "text",
    kind: "fk",
  }));

  const have = new Set(columns.map((c) => `${c.table}.${c.column}`));
  const soft = rows<{ t: string; c: string; ty: string }>(
    await db.execute(sql`
      select c.table_name as t, c.column_name as c, c.data_type as ty
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
      where c.table_schema = 'public' and c.column_name = ${`${table}_id`} and c.data_type in ('uuid', 'text')
      order by 1, 2`),
  );
  for (const r of soft) {
    if (r.t === table || have.has(`${r.t}.${r.c}`)) continue;
    columns.push({
      table: r.t,
      column: r.c,
      type: r.ty === "uuid" ? "uuid" : "text",
      kind: "soft",
    });
  }

  const polyRows = rows<{ t: string; idty: string; typety: string }>(
    await db.execute(sql`
      select i.table_name as t, i.data_type as idty, k.data_type as typety
      from information_schema.columns i
      join information_schema.columns k
        on k.table_schema = i.table_schema and k.table_name = i.table_name and k.column_name = 'entity_type'
      join information_schema.tables t
        on t.table_schema = i.table_schema and t.table_name = i.table_name and t.table_type = 'BASE TABLE'
      where i.table_schema = 'public' and i.column_name = 'entity_id' and i.data_type in ('uuid', 'text')
      order by 1`),
  );
  const poly: PolyRef[] = polyRows
    .filter((r) => !POLY_SKIP.has(r.t) && r.typety === "text")
    .map((r) => ({
      table: r.t,
      typeColumn: "entity_type",
      idColumn: "entity_id",
      idType: r.idty === "uuid" ? "uuid" : "text",
    }));
  return { columns, poly };
}

const ident = (name: string) => sql.identifier(name);
const idParam = (id: string, type: "uuid" | "text") =>
  type === "uuid" ? sql`${id}::uuid` : sql`${id}::text`;

/** Sloupce unikátních indexů tabulky, které obsahují odkazující sloupec (bez něj samotného). */
async function uniqueSiblings(db: Executor, table: string, column: string): Promise<string[][]> {
  const r = rows<{ cols: string[] }>(
    await db.execute(sql`
      select array(
        select a.attname from unnest(i.indkey) with ordinality as k(attnum, ord)
        join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
        where k.attnum > 0 order by k.ord
      ) as cols
      from pg_index i
      where i.indrelid = ${`public.${table}`}::regclass and i.indisunique and not i.indisprimary`),
  );
  return r
    .map((x) => x.cols)
    .filter((cols) => cols.includes(column))
    .map((cols) => cols.filter((c) => c !== column && c !== "deleted_at"));
}

/** Kolik živých řádků na zdroj odkazuje (podle tabulek; souhrn pro náhled i kontrolu po sloučení). */
async function countRefs(
  db: Executor,
  refs: MergeRefs,
  entity: MergeEntity,
  id: string,
  deletable: Set<string>,
): Promise<{ table: string; label: string; count: number; kind: string }[]> {
  const out: { table: string; label: string; count: number; kind: string }[] = [];
  const add = (table: string, kind: string, count: number) => {
    if (!count) return;
    const hit = out.find((o) => o.table === table);
    if (hit) hit.count += count;
    else out.push({ table, label: labelOf(table), count, kind });
  };
  for (const c of refs.columns) {
    const alive = deletable.has(c.table) ? sql` and deleted_at is null` : sql``;
    const r = rows<{ n: string }>(
      await db.execute(
        sql`select count(*)::text as n from ${ident(c.table)} where ${ident(c.column)} = ${idParam(id, c.type)}${alive}`,
      ),
    );
    add(c.table, c.kind, Number(r[0]?.n ?? 0));
  }
  for (const p of refs.poly) {
    const alive = deletable.has(p.table) ? sql` and deleted_at is null` : sql``;
    const r = rows<{ n: string }>(
      await db.execute(
        sql`select count(*)::text as n from ${ident(p.table)} where ${ident(p.typeColumn)} = ${entity} and ${ident(p.idColumn)} = ${idParam(id, p.idType)}${alive}`,
      ),
    );
    add(p.table, "poly", Number(r[0]?.n ?? 0));
  }
  return out;
}

/** Pole organizace a osoby, která se při sloučení doplní z mizejícího záznamu do hlavního, když hlavní je nemá. */
const COMPANY_FILL = [
  "officialName",
  "ico",
  "dic",
  "legalForm",
  "street",
  "city",
  "zip",
  "web",
  "email",
  "phone",
  "industry",
  "ownerId",
] as const;
const PERSON_FILL = ["firstName", "position", "linkedin", "primaryCompanyId", "ownerId"] as const;

const FIELD_LABELS: Record<string, string> = {
  officialName: "Oficiální název",
  ico: "IČO",
  dic: "DIČ",
  legalForm: "Právní forma",
  street: "Ulice",
  city: "Město",
  zip: "PSČ",
  web: "Web",
  email: "E-mail",
  phone: "Telefon",
  industry: "Obor",
  ownerId: "Vlastník",
  firstName: "Křestní jméno",
  position: "Pozice",
  linkedin: "LinkedIn",
  primaryCompanyId: "Organizace",
  primaryEmail: "E-mail",
  primaryPhone: "Telefon",
  clientStatus: "Stav klienta",
  clientSince: "Klient od",
  clientUntil: "Klient do",
  clientEndReason: "Důvod ukončení",
  driveFolderId: "Složka na Disku",
  isDecisionMaker: "Rozhoduje",
  lastActivityAt: "Poslední aktivita",
  services: "Služby",
};

/** Údaje, jejichž rozdílnost stojí za varování (zůstane hodnota z hlavního záznamu). */
const WARN_DIFFERENT = ["ico", "dic", "email", "phone"];

/** Pořadí „aktivnosti“ stavu klienta: při sloučení vyhraje aktivnější (aktivní > pozastavený > lead > bývalý). */
const STATUS_RANK: Record<string, number> = { active: 4, paused: 3, lead: 2, former: 1 };
const STATUS_LABEL: Record<string, string> = {
  active: "Aktivní",
  paused: "Pozastavený",
  lead: "Lead",
  former: "Bývalý",
};
const CONTEXT_KEYS = ["decisionMaker", "howToCommunicate", "history", "notes"] as const;

const empty = (v: unknown) => v === null || v === undefined || v === "";
const union = (a: string[] | null, b: string[] | null) => [
  ...new Set([...(a ?? []), ...(b ?? [])]),
];
const later = (a: unknown, b: unknown) => {
  const x = a instanceof Date ? a : null;
  const y = b instanceof Date ? b : null;
  if (x && y) return x > y ? x : y;
  return x ?? y;
};

type Raw = Record<string, unknown>;
const display = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v));

async function loadPair(ctx: Ctx, entity: MergeEntity, sourceId: string, targetId: string) {
  if (sourceId === targetId) throw new UserError("Vyberte jiný záznam, než který se slučuje.");
  for (const id of [sourceId, targetId]) await assertEntityAccess(ctx, entity, id, "write");
  const table = entity === "company" ? company : person;
  const found = rows<Raw>(
    await ctx.db
      .select()
      .from(table)
      .where(and(inArray(table.id, [sourceId, targetId]), isNull(table.deletedAt))),
  );
  const source = found.find((r) => r.id === sourceId);
  const target = found.find((r) => r.id === targetId);
  if (!source || !target) throw new NotFoundError();
  return { source, target };
}

/** Co se při sloučení doplní, spojí a před čím je třeba varovat (čistá funkce nad dvěma řádky). */
export type MergePlan = {
  /** Sloupce k zápisu do hlavního záznamu. */
  set: Raw;
  fills: { field: string; value: unknown }[];
  adds: string[];
  warnings: string[];
};

/**
 * Rozhodne, co z mizejícího záznamu přejde do hlavního: prázdná pole se doplní, štítky, služby a vlastní pole se
 * spojí, u klienta vyhraje aktivnější stav (a nejstarší „klient od“), u osoby se spojí příznak „rozhoduje“. Rozdílné
 * IČO, DIČ, e-mail a telefon zůstanou z hlavního záznamu a uživatel je dostane jako varování. Bez databáze.
 */
export function planMerge(entity: MergeEntity, source: Raw, target: Raw): MergePlan {
  const set: Raw = {};
  const fills: MergePlan["fills"] = [];
  const adds: string[] = [];
  const warnings: string[] = [];
  const fillFields = entity === "company" ? COMPANY_FILL : PERSON_FILL;
  for (const f of fillFields) {
    if (empty(target[f]) && !empty(source[f])) {
      fills.push({ field: f, value: source[f] });
      set[f] = source[f];
    } else if (
      !empty(source[f]) &&
      !empty(target[f]) &&
      source[f] !== target[f] &&
      WARN_DIFFERENT.includes(f)
    )
      warnings.push(
        `${FIELD_LABELS[f]} se liší („${String(source[f])}“ a „${String(target[f])}“); zůstane hodnota z hlavního záznamu.`,
      );
  }
  const note = (field: string, value: unknown) => {
    fills.push({ field, value });
    set[field] = value;
  };

  const srcTags = (source.tags as string[] | null) ?? [];
  const tgtTags = (target.tags as string[] | null) ?? [];
  set.tags = union(tgtTags, srcTags);
  if (srcTags.some((t) => !tgtTags.includes(t))) adds.push("Štítky z obou záznamů se spojí.");
  set.custom = { ...((source.custom as Raw) ?? {}), ...((target.custom as Raw) ?? {}) };
  const la = later(target.lastActivityAt, source.lastActivityAt);
  if (la && la !== target.lastActivityAt) set.lastActivityAt = la;

  if (entity === "company") {
    // doména webu se řídí adresou webu
    if ("web" in set) set.webDomain = webDomainOf(String(set.web));
    const ts = (target.clientStatus as string | null) ?? null;
    const ss = (source.clientStatus as string | null) ?? null;
    if (ss) {
      const win = !ts || (STATUS_RANK[ss] ?? 0) > (STATUS_RANK[ts] ?? 0) ? ss : ts;
      if (ts && ss !== ts)
        warnings.push(
          `Stav klienta se liší („${STATUS_LABEL[ss] ?? ss}“ a „${STATUS_LABEL[ts] ?? ts}“); zůstane „${STATUS_LABEL[win] ?? win}“.`,
        );
      if (win !== ts) {
        note("clientStatus", win);
        if (win === "former") {
          if (empty(target.clientUntil) && source.clientUntil) set.clientUntil = source.clientUntil;
          if (empty(target.clientEndReason) && source.clientEndReason)
            set.clientEndReason = source.clientEndReason;
        }
      }
      const since = [target.clientSince, source.clientSince].filter(
        (x): x is string => typeof x === "string",
      );
      if (since.length) {
        const min = since.sort()[0]!;
        if (min !== target.clientSince) note("clientSince", min);
      }
    }
    const srcServices = (source.services as string[] | null) ?? [];
    const tgtServices = (target.services as string[] | null) ?? [];
    if (srcServices.some((x) => !tgtServices.includes(x))) {
      set.services = union(tgtServices, srcServices);
      adds.push("Služby klienta z obou záznamů se spojí.");
    }
    const sc = (source.clientContext as Record<string, string | undefined>) ?? {};
    const tc = (target.clientContext as Record<string, string | undefined>) ?? {};
    const ctx2: Record<string, string> = {};
    let ctxChanged = false;
    for (const k of CONTEXT_KEYS) {
      const t = tc[k]?.trim();
      const sv = sc[k]?.trim();
      if (t) ctx2[k] = t;
      else if (sv) {
        ctx2[k] = sv;
        ctxChanged = true;
      }
      if (t && sv && t !== sv)
        warnings.push(`Kontext klienta (${k}) se liší; zůstane text z hlavního záznamu.`);
    }
    if (ctxChanged) {
      set.clientContext = ctx2;
      adds.push("Prázdná pole kontextu klienta se doplní.");
    }
    if (source.driveFolderId && !target.driveFolderId) {
      set.driveFolderId = source.driveFolderId;
      set.driveStatus = source.driveStatus;
      adds.push("Složka na Google Disku z mizejícího záznamu se přenese.");
    } else if (
      source.driveFolderId &&
      target.driveFolderId &&
      source.driveFolderId !== target.driveFolderId
    )
      warnings.push(
        "Oba záznamy mají vlastní složku na Google Disku; zůstane složka hlavního záznamu, druhou přesuňte ručně.",
      );
  } else {
    if (source.isDecisionMaker && !target.isDecisionMaker) {
      note("isDecisionMaker", true);
    }
    if (
      source.primaryCompanyId &&
      target.primaryCompanyId &&
      source.primaryCompanyId !== target.primaryCompanyId
    )
      adds.push("Hlavní organizace mizející osoby se přidá mezi další organizace.");
  }
  return { set, fills, adds, warnings };
}

/** Počet živých kontaktních údajů osoby (pro náhled). */
async function pointCount(db: Executor, personId: string): Promise<number> {
  const r = rows<{ n: string }>(
    await db.execute(
      sql`select count(*)::text as n from person_contact_point where person_id = ${personId}::uuid and deleted_at is null`,
    ),
  );
  return Number(r[0]?.n ?? 0);
}

/** Náhled sloučení: co se přepojí, co se doplní a před čím je potřeba varovat. Nic nemění. */
export async function previewMerge(
  ctx: Ctx,
  entity: MergeEntity,
  sourceId: string,
  targetId: string,
): Promise<MergePreview> {
  const { source, target } = await loadPair(ctx, entity, sourceId, targetId);
  const refs = await discoverReferences(ctx.db, entity);
  const deletable = await softDeletable(ctx.db);
  const counts = await countRefs(ctx.db, refs, entity, sourceId, deletable);
  const plan = planMerge(entity, source, target);
  const adds = [...plan.adds];
  if (entity === "person" && (await pointCount(ctx.db, sourceId)) > 0)
    adds.push("E-maily a telefony z obou záznamů se spojí (bez opakování).");
  const name = (r: Raw) => String(entity === "company" ? r.name : (r.fullName ?? r.lastName));
  return {
    entity,
    source: { id: sourceId, name: name(source) },
    target: { id: targetId, name: name(target) },
    moves: counts
      // údaje osoby se slučují zvlášť (bez opakování), uvádí je `adds`
      .filter((c) => c.table !== "person_contact_point")
      .map(({ table, label, count }) => ({ table, label, count })),
    fills: plan.fills.map((f) => ({
      field: f.field,
      label: FIELD_LABELS[f.field] ?? f.field,
      value: display(f.value),
    })),
    adds,
    warnings: plan.warnings,
  };
}

/** Přepojí odkazující řádky; kde by vznikl duplicitní řádek v unikátním indexu, ten ze zdroje zanikne. */
async function repoint(
  db: Executor,
  refs: MergeRefs,
  entity: MergeEntity,
  sourceId: string,
  targetId: string,
  deletable: Set<string>,
) {
  for (const c of refs.columns) {
    if (c.table === "person_contact_point") continue; // slučují se zvlášť
    const siblings = await uniqueSiblings(db, c.table, c.column);
    for (const others of siblings) {
      // řádek zdroje, který by po přepojení kolidoval s existujícím řádkem cíle, se nepřepojuje, ale ruší
      const same = others.length
        ? sql.join(
            others.map((o) => sql`o.${ident(o)} is not distinct from t.${ident(o)}`),
            sql` and `,
          )
        : sql`true`;
      const liveT = deletable.has(c.table) ? sql` and t.deleted_at is null` : sql``;
      const liveO = deletable.has(c.table) ? sql` and o.deleted_at is null` : sql``;
      const clash = sql`t.${ident(c.column)} = ${idParam(sourceId, c.type)}${liveT}
        and exists (select 1 from ${ident(c.table)} o
          where o.${ident(c.column)} = ${idParam(targetId, c.type)} and ${same}${liveO})`;
      if (deletable.has(c.table))
        await db.execute(sql`update ${ident(c.table)} t set deleted_at = now() where ${clash}`);
      else await db.execute(sql`delete from ${ident(c.table)} t where ${clash}`);
    }
    await db.execute(
      sql`update ${ident(c.table)} set ${ident(c.column)} = ${idParam(targetId, c.type)} where ${ident(c.column)} = ${idParam(sourceId, c.type)}`,
    );
  }
  for (const p of refs.poly) {
    const siblings = await uniqueSiblings(db, p.table, p.idColumn);
    for (const others of siblings) {
      const rest = others.filter((o) => o !== p.typeColumn);
      const same = sql.join(
        [
          sql`o.${ident(p.typeColumn)} = ${entity}`,
          ...rest.map((o) => sql`o.${ident(o)} is not distinct from t.${ident(o)}`),
        ],
        sql` and `,
      );
      const liveT = deletable.has(p.table) ? sql` and t.deleted_at is null` : sql``;
      const liveO = deletable.has(p.table) ? sql` and o.deleted_at is null` : sql``;
      const clash = sql`t.${ident(p.typeColumn)} = ${entity} and t.${ident(p.idColumn)} = ${idParam(sourceId, p.idType)}${liveT}
        and exists (select 1 from ${ident(p.table)} o
          where o.${ident(p.idColumn)} = ${idParam(targetId, p.idType)} and ${same}${liveO})`;
      if (deletable.has(p.table))
        await db.execute(sql`update ${ident(p.table)} t set deleted_at = now() where ${clash}`);
      else await db.execute(sql`delete from ${ident(p.table)} t where ${clash}`);
    }
    await db.execute(
      sql`update ${ident(p.table)} set ${ident(p.idColumn)} = ${idParam(targetId, p.idType)} where ${ident(p.typeColumn)} = ${entity} and ${ident(p.idColumn)} = ${idParam(sourceId, p.idType)}`,
    );
  }
}

/**
 * Kontaktní údaje mizející osoby přejdou k hlavní osobě: stejný údaj (druh + normalizovaná hodnota) se nezdvojí,
 * hlavní údaje hlavní osoby zůstanou, ostatní se stanou dalšími. Hlavní e-mail a telefon na osobě se přepíšou podle
 * výsledku (hlavní osoba bez hlavního údaje dostane první z přenesených).
 */
async function mergePoints(c: Ctx, sourceId: string, targetId: string) {
  const alive = (id: string) =>
    and(eq(personContactPoint.personId, id), isNull(personContactPoint.deletedAt));
  const mine = await c.db.select().from(personContactPoint).where(alive(targetId));
  const theirs = await c.db
    .select()
    .from(personContactPoint)
    .where(alive(sourceId))
    .orderBy(asc(personContactPoint.position));
  const have = new Set(mine.map((p) => `${p.kind}:${p.valueNorm}`));
  const hasPrimary = new Set(mine.filter((p) => p.isPrimary).map((p) => p.kind));
  let position = mine.length;
  for (const p of theirs) {
    const key = `${p.kind}:${p.valueNorm}`;
    if (have.has(key)) {
      await c.db
        .update(personContactPoint)
        .set({ deletedAt: new Date(), isPrimary: false, updatedBy: c.actor.userId })
        .where(eq(personContactPoint.id, p.id));
      continue;
    }
    have.add(key);
    const makePrimary = p.isPrimary && !hasPrimary.has(p.kind);
    if (makePrimary) hasPrimary.add(p.kind);
    await c.db
      .update(personContactPoint)
      .set({
        personId: targetId,
        isPrimary: makePrimary,
        position: position++,
        updatedBy: c.actor.userId,
      })
      .where(eq(personContactPoint.id, p.id));
  }
  // hlavní osoba bez hlavního údaje daného druhu: první dostupný se povýší
  const all = await c.db
    .select()
    .from(personContactPoint)
    .where(alive(targetId))
    .orderBy(asc(personContactPoint.position));
  for (const kind of ["email", "phone"] as const) {
    const ofKind = all.filter((p) => p.kind === kind);
    if (ofKind.length && !ofKind.some((p) => p.isPrimary))
      await c.db
        .update(personContactPoint)
        .set({ isPrimary: true })
        .where(eq(personContactPoint.id, ofKind[0]!.id));
  }
  const final = await c.db.select().from(personContactPoint).where(alive(targetId));
  const main = (kind: "email" | "phone") =>
    final.find((p) => p.kind === kind && p.isPrimary)?.value ?? null;
  await c.db
    .update(person)
    .set({ primaryEmail: main("email"), primaryPhone: main("phone") })
    .where(eq(person.id, targetId));
}

/**
 * Sloučí `sourceId` do `targetId` (hlavní záznam): přepojí všechny odkazy (obchody, zakázky, úkoly, poznámky, platby,
 * komentáře, soubory…), doplní prázdná pole hlavního záznamu, spojí štítky, služby a kontaktní údaje, zdroj smaže
 * (měkce, jde obnovit z koše, ale odkazy se nevrací) a zapíše historii k oběma záznamům. Vše v jedné transakci.
 * Oprávnění: příkaz `kontakty.merge` (vlastník) a zápis do obou záznamů (rozsah „jen moje“ platí).
 */
export async function mergeContacts(
  ctx: Ctx,
  entity: MergeEntity,
  sourceId: string,
  targetId: string,
): Promise<{ moved: number; targetId: string }> {
  return inTx(ctx, async (c) => {
    // zámek na oba záznamy v pevném pořadí, ať souběžná sloučení na sebe počkají a neskončí v zacyklení
    const table = entity === "company" ? "company" : "person";
    for (const id of [sourceId, targetId].sort())
      await c.db.execute(sql`select id from ${ident(table)} where id = ${id}::uuid for update`);

    const { source, target } = await loadPair(c, entity, sourceId, targetId);
    const refs = await discoverReferences(c.db, entity);
    const deletable = await softDeletable(c.db);
    const counts = await countRefs(c.db, refs, entity, sourceId, deletable);
    const plan = planMerge(entity, source, target);

    await repoint(c.db, refs, entity, sourceId, targetId, deletable);

    if (entity === "person") {
      await mergePoints(c, sourceId, targetId);
      // hlavní organizace mizející osoby, když je jiná než hlavní organizace hlavní osoby, zůstane jako další
      const sp = source.primaryCompanyId as string | null;
      const tp = (plan.set.primaryCompanyId ?? target.primaryCompanyId) as string | null;
      if (sp && tp && sp !== tp) {
        const [has] = await c.db
          .select({ id: personCompany.id })
          .from(personCompany)
          .where(
            and(
              eq(personCompany.personId, targetId),
              eq(personCompany.companyId, sp),
              isNull(personCompany.deletedAt),
            ),
          );
        if (!has)
          await c.db.insert(personCompany).values({
            personId: targetId,
            companyId: sp,
            position: (source.position as string | null) ?? null,
            createdBy: c.actor.userId,
            updatedBy: c.actor.userId,
          });
      }
    }

    // zdroj zmizí dřív, než se jeho IČO přenese do hlavního záznamu (unikátní index se týká jen živých záznamů),
    // a až po přepojení všeho (blokace smazání už nic nenajde)
    const def = entity === "company" ? companyEntity : personEntity;
    const resolved = await resolveEntity(c.db, def);
    await deleteRecord(c, resolved, sourceId);

    const t = entity === "company" ? company : person;
    await c.db
      .update(t)
      .set({ ...plan.set, updatedBy: c.actor.userId } as never)
      .where(eq(t.id, targetId));
    const [after] = await c.db.select().from(t).where(eq(t.id, targetId));
    await indexRecord(c.db, entity === "company" ? companyIndex : personIndex, after as Raw);

    const moved = counts.reduce((n, x) => n + x.count, 0);
    const name = (r: Raw) => String(entity === "company" ? r.name : (r.fullName ?? r.lastName));
    await recordAudit(c, {
      action: "merge",
      entityType: entity,
      entityId: targetId,
      summary: `Sloučeno: „${name(source)}“ bylo spojeno do „${name(target)}“`,
      changes: [
        { field: "Sloučený záznam", old: name(source), new: null },
        ...counts
          .filter((x) => x.table !== "person_contact_point")
          .map((x) => ({ field: `Přepojeno: ${x.label}`, old: null, new: x.count })),
        ...plan.fills.map((f) => ({
          field: FIELD_LABELS[f.field] ?? f.field,
          old: null,
          new: display(f.value),
        })),
      ],
    });
    await recordAudit(c, {
      action: "merge",
      entityType: entity,
      entityId: sourceId,
      summary: `Sloučeno do „${name(target)}“ (záznam zrušen)`,
    });
    return { moved, targetId };
  });
}
