import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { recordAudit } from "@rebar/core/audit";
import type { Executor } from "@rebar/core/db";
import { assertEntityAccess, deleteRecord, indexRecord, resolveEntity } from "@rebar/core/entities";
import { inTx, NotFoundError, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { companyEntity, personEntity } from "./entities";
import { company, person, personContactPoint } from "./schema";

/**
 * Sloučení duplicitních kontaktů (firma do firmy, osoba do osoby).
 *
 * Odkazy na záznam se nehledají ručním výčtem tabulek (ten by zastaral s každým novým modulem), ale v katalogu
 * databáze (`discoverReferences`):
 *  1. cizí klíče na `company(id)` / `person(id)` (zakázky, poptávky, faktury, objednávky, sklad, účastníci…),
 *  2. sloupce `company_id` / `person_id` bez cizího klíče (aktivity CRM, jejich vazby jsou měkké),
 *  3. polymorfní vazby `entity_type` + `entity_id` (komentáře, úkoly, soubory, poznámky, upozornění, e-maily).
 * Test (`merge.int.test.ts`) hlídá, že žádný sloupec s podobným názvem nezůstane mimo tento výčet.
 *
 * Výjimky: `audit_log` a `search_document` se nepřepisují (historie zůstane u původního id, hledání se přeindexuje);
 * vystavené faktury mají jako snímek jména odběratele JSON (`customer`), který se nemění, jen se přepojí odkaz.
 */
export type MergeEntity = "company" | "person";

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

/** Polymorfní tabulky, které se nepřepisují (historie změn, index hledání). */
const POLY_SKIP = new Set(["audit_log", "search_document"]);

/** Názvy souvisejících záznamů v náhledu (množné číslo, 2.–4. pád se v náhledu nepoužívá). */
const LABELS: Record<string, string> = {
  job: "zakázky",
  inquiry: "poptávky",
  invoice: "vydané faktury",
  received_invoice: "přijaté faktury",
  job_cost: "náklady zakázek",
  job_order: "objednávky zakázek",
  purchase_order: "objednávky",
  stock_doc: "skladové doklady",
  stock_item: "skladové položky (dodavatel)",
  person: "kontaktní osoby",
  job_participant: "účasti na zakázkách",
  crm_activity: "aktivity",
  crm_note: "poznámky",
  comment: "komentáře",
  task: "úkoly",
  attachment: "soubory",
  notification: "upozornění",
  email_log: "odeslané e-maily",
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

/** Hodnoty polí firmy a osoby, které se při sloučení doplní z mizejícího záznamu do cílového. */
const COMPANY_FILL = [
  "ico",
  "dic",
  "street",
  "city",
  "zip",
  "email",
  "phone",
  "web",
  "note",
  "type",
  "parentId",
  "ownerId",
] as const;
const PERSON_FILL = [
  "email",
  "phone",
  "emailType",
  "phoneType",
  "position",
  "role",
  "companyId",
  "note",
  "ownerId",
] as const;

const FIELD_LABELS: Record<string, string> = {
  ico: "IČO",
  dic: "DIČ",
  street: "Ulice",
  city: "Město",
  zip: "PSČ",
  email: "E-mail",
  phone: "Telefon",
  web: "Web",
  note: "Poznámka",
  type: "Typ kontaktu",
  parentId: "Mateřská firma",
  ownerId: "Vlastník",
  emailType: "Typ e-mailu",
  phoneType: "Typ telefonu",
  position: "Funkce",
  role: "Role",
  companyId: "Firma",
};

const empty = (v: unknown) => v === null || v === undefined || v === "";
const union = (a: string[] | null, b: string[] | null) => [
  ...new Set([...(a ?? []), ...(b ?? [])]),
];

/** Náhled sloučení: co se přepojí, doplní a před čím je třeba varovat. */
export type MergePreview = {
  entity: MergeEntity;
  source: { id: string; name: string };
  target: { id: string; name: string };
  /** Související záznamy, které se přepojí na cílový záznam. */
  moves: { table: string; label: string; count: number }[];
  /** Pole, která se doplní z mizejícího záznamu do cílového, protože cílový je nemá. */
  fills: { field: string; label: string; value: string }[];
  /** Co se přidá sjednocením (role, štítky, další kontaktní údaje). */
  adds: string[];
  /** Věty, které mají uživatele upozornit (IČO se liší, firmy jsou v různých skupinách…). */
  warnings: string[];
};

type Raw = Record<string, unknown>;

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

async function fillsOf(entity: MergeEntity, source: Raw, target: Raw, warnings: string[]) {
  const fields = entity === "company" ? COMPANY_FILL : PERSON_FILL;
  const fills: { field: string; value: unknown }[] = [];
  for (const f of fields) {
    if (empty(target[f]) && !empty(source[f])) fills.push({ field: f, value: source[f] });
    else if (
      !empty(source[f]) &&
      !empty(target[f]) &&
      source[f] !== target[f] &&
      ["ico", "dic", "email", "phone"].includes(f)
    )
      warnings.push(
        `${FIELD_LABELS[f]} se liší („${String(source[f])}“ → „${String(target[f])}“); zůstane hodnota z cílového záznamu.`,
      );
  }
  return fills;
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
  const warnings: string[] = [];
  const fills = await fillsOf(entity, source, target, warnings);
  const adds: string[] = [];
  const srcTags = (source.tags as string[] | null) ?? [];
  if (srcTags.some((t) => !((target.tags as string[] | null) ?? []).includes(t)))
    adds.push("Štítky z obou záznamů se spojí.");
  if (entity === "company") {
    const sr = (source.roles as string[] | null) ?? [];
    if (sr.some((r) => !((target.roles as string[] | null) ?? []).includes(r)))
      adds.push("Role (klient, dodavatel…) z obou záznamů se spojí.");
    if (target.parentId === sourceId || source.parentId === targetId)
      warnings.push("Firmy jsou v hierarchii (mateřská a dceřiná); vazba mezi nimi zanikne.");
  } else {
    const pts = rows<{ n: string }>(
      await ctx.db.execute(
        sql`select count(*)::text as n from person_contact_point where person_id = ${sourceId}::uuid and deleted_at is null`,
      ),
    );
    if (
      Number(pts[0]?.n ?? 0) > 0 ||
      (source.email && target.email && source.email !== target.email)
    )
      adds.push("E-maily a telefony z obou záznamů se spojí (bez opakování).");
    if (source.companyId && target.companyId && source.companyId !== target.companyId)
      warnings.push("Osoby patří k různým firmám; zůstane firma z cílového záznamu.");
  }
  // body osoby se přesouvají zvlášť (slučují se bez opakování), do náhledu zahrnuté v `adds`
  return {
    entity,
    source: { id: sourceId, name: String(source.name) },
    target: { id: targetId, name: String(target.name) },
    moves: counts
      .filter((c) => c.table !== "person_contact_point")
      .map(({ table, label, count }) => ({ table, label, count })),
    fills: fills.map((f) => ({
      field: f.field,
      label: FIELD_LABELS[f.field] ?? f.field,
      value: String(f.value),
    })),
    adds,
    warnings,
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

const normalizeValue = (kind: string, v: string) =>
  kind === "email" ? v.trim().toLowerCase() : v.replace(/\D/g, "").slice(-9) || v.trim();

/** Další kontaktní údaje osoby: údaje mizející osoby přejdou k cílové, bez opakování stejné hodnoty. */
async function mergePoints(db: Executor, source: Raw, target: Raw, ctx: Ctx) {
  const existing = await db
    .select()
    .from(personContactPoint)
    .where(
      and(
        inArray(personContactPoint.personId, [String(source.id), String(target.id)]),
        isNull(personContactPoint.deletedAt),
      ),
    );
  const seen = new Set<string>();
  const add = (kind: string, value: unknown) => {
    if (typeof value === "string" && value.trim())
      seen.add(`${kind}:${normalizeValue(kind, value)}`);
  };
  add("email", target.email);
  add("phone", target.phone);
  for (const p of existing.filter((x) => x.personId === target.id)) add(p.kind, p.value);
  let position = existing.filter((x) => x.personId === target.id).length;
  const toInsert: { kind: string; value: string; label: string | null }[] = [];
  const consider = (kind: string, value: unknown, label: unknown) => {
    if (typeof value !== "string" || !value.trim()) return;
    const key = `${kind}:${normalizeValue(kind, value)}`;
    if (seen.has(key)) return;
    seen.add(key);
    toInsert.push({ kind, value: value.trim(), label: typeof label === "string" ? label : null });
  };
  // hlavní údaje mizející osoby, pokud je cílová osoba nemá nebo mají jinou hodnotu, se z nich stanou další údaje
  consider("email", source.email, source.emailType);
  consider("phone", source.phone, source.phoneType);
  for (const p of existing.filter((x) => x.personId === source.id))
    consider(p.kind, p.value, p.label);
  if (toInsert.length)
    await db.insert(personContactPoint).values(
      toInsert.map((p) => ({
        personId: String(target.id),
        ...p,
        position: position++,
        createdBy: ctx.actor.userId,
        updatedBy: ctx.actor.userId,
      })),
    );
  await db
    .update(personContactPoint)
    .set({ deletedAt: new Date() })
    .where(
      and(eq(personContactPoint.personId, String(source.id)), isNull(personContactPoint.deletedAt)),
    );
}

/**
 * Sloučí `sourceId` do `targetId`: přepojí všechny odkazy, doplní prázdná pole cíle, spojí štítky, role a kontaktní údaje,
 * zdroj smaže (měkce, jde obnovit z koše, ale odkazy se nevrací) a zapíše audit. Vše v jedné transakci.
 * Oprávnění: zápis do obou záznamů (rozsah „jen moje“ platí) a příkaz `kontakty.merge`.
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
    const warnings: string[] = [];
    const fills = await fillsOf(entity, source, target, warnings);

    await repoint(c.db, refs, entity, sourceId, targetId, deletable);

    const def = entity === "company" ? companyEntity : personEntity;
    const resolved = await resolveEntity(c.db, def);
    // po doplnění prázdných polí: hlavní údaje cíle už zahrnují to, co se doplnilo ze zdroje
    const effective = { ...target, ...Object.fromEntries(fills.map((f) => [f.field, f.value])) };
    if (entity === "person") await mergePoints(c.db, source, effective, c);

    // zdroj zmizí dřív než se jeho IČO přenese do cíle (unikátní index se týká jen živých záznamů)
    // a až po přepojení všeho (blokace smazání už nic nenajde)
    await deleteRecord(c, resolved, sourceId);

    const set: Raw = {};
    for (const f of fills) set[f.field] = f.value;
    set.tags = union(target.tags as string[] | null, source.tags as string[] | null);
    if (entity === "company")
      set.roles = union(target.roles as string[] | null, source.roles as string[] | null);
    set.custom = { ...((source.custom as Raw) ?? {}), ...((target.custom as Raw) ?? {}) };
    set.updatedBy = c.actor.userId;
    const t = entity === "company" ? company : person;
    await c.db
      .update(t)
      .set(set as never)
      .where(eq(t.id, targetId));

    if (entity === "company")
      // hierarchie nesmí skončit smyčkou (firma sama sobě mateřskou)
      await c.db
        .update(company)
        .set({ parentId: null })
        .where(and(eq(company.id, targetId), eq(company.parentId, targetId)));

    const [after] = await c.db.select().from(t).where(eq(t.id, targetId));
    await indexRecord(c.db, resolved, after as Raw);

    const moved = counts.reduce((n, x) => n + x.count, 0);
    await recordAudit(c, {
      action: "merge",
      entityType: entity,
      entityId: targetId,
      summary: `Sloučeno: „${String(source.name)}“ bylo spojeno do „${String(target.name)}“`,
      changes: [
        { field: "Sloučený záznam", old: String(source.name), new: null },
        ...counts.map((x) => ({ field: `Přepojeno: ${x.label}`, old: null, new: x.count })),
        ...fills.map((f) => ({
          field: FIELD_LABELS[f.field] ?? f.field,
          old: null,
          new: String(f.value),
        })),
      ],
    });
    await recordAudit(c, {
      action: "merge",
      entityType: entity,
      entityId: sourceId,
      summary: `Sloučeno do „${String(target.name)}“ (záznam zrušen)`,
    });
    return { moved, targetId };
  });
}
