import { and, count, desc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { schema } from "@rebar/core/db";
import { assertEntityAccess, privateScope, visibleRecordTitles } from "@rebar/core/entities";
import type { ModuleDeps } from "@rebar/core/module-server";
import { NotFoundError, PermissionError, can, scopeOf, type Ctx } from "@rebar/core/rbac";
import { note } from "../schema/notes";
import type { ListNotesInput, ListNotesResult, NoteDto, NoteLinkDto } from "./contract";
import { sanitizeNoteDoc, type NoteDoc } from "./doc";

/*
  Čtení poznámek. Všechny ruční dotazy nad tabulkou `note` jdou přes `visibleNotes` (nesmazané, bez soukromých záznamů
  pro toho, kdo je nesmí vidět, a rozsah „jen moje“), protože engine entit tu nepomáhá (řazení „připnuté nahoře“).
*/

/** Řádek poznámky z databáze. */
export type NoteRow = typeof note.$inferSelect;

/** Rozsah „jen moje“ pro poznámky: napsal jsem je já. */
export function ownNoteScope(ctx: Ctx): SQL {
  const me = ctx.actor.userId;
  return me ? eq(note.createdBy, me) : sql`false`;
}

/**
 * Podmínka `WHERE` pro každý ruční dotaz nad `note`: nesmazané, bez soukromých záznamů cizích aktérů (`privateScope`)
 * a s rozsahem „jen moje“. Bez oprávnění `ukoly.read` vyhodí `PermissionError`.
 */
export function visibleNotes(ctx: Ctx): SQL {
  const scope = scopeOf(ctx, "ukoly.read");
  if (!scope) throw new PermissionError();
  return and(
    isNull(note.deletedAt),
    privateScope(ctx, note),
    scope === "own" ? ownNoteScope(ctx) : undefined,
  )!;
}

const LINKS = [
  ["deal", "dealId"],
  ["company", "companyId"],
  ["person", "personId"],
  ["job", "jobId"],
] as const;

/** Sloupec vazby podle typu záznamu. */
const LINK_COLUMNS = {
  deal: note.dealId,
  company: note.companyId,
  person: note.personId,
  job: note.jobId,
} as const;

/** Vazba poznámky z řádku (typ a id), nebo `null` u samostatné. */
export function linkOf(row: Pick<NoteRow, "dealId" | "companyId" | "personId" | "jobId">) {
  for (const [type, col] of LINKS) {
    const id = row[col];
    if (id) return { type, id };
  }
  return null;
}

/** Dokument z databáze: uložený už je sanitizovaný, ale starý nebo ručně vložený řádek se pro jistotu přečistí. */
function docOf(raw: unknown): NoteDoc | null {
  if (raw === null || raw === undefined) return null;
  try {
    return sanitizeNoteDoc(raw).doc;
  } catch {
    return null;
  }
}

/** Řádky → DTO (názvy vazeb jen z toho, co aktér smí vidět; jména autorů). */
export async function toNoteDtos(
  ctx: Ctx,
  deps: ModuleDeps,
  rows: readonly NoteRow[],
): Promise<NoteDto[]> {
  if (!rows.length) return [];
  const titles: Record<string, Record<string, string>> = {};
  for (const [type] of LINKS) {
    const ids = [
      ...new Set(rows.flatMap((r) => (linkOf(r)?.type === type ? [linkOf(r)!.id] : []))),
    ];
    titles[type] = ids.length ? await visibleRecordTitles(ctx, deps.registry, type, ids) : {};
  }
  const userIds = [
    ...new Set(rows.flatMap((r) => [r.createdBy, r.updatedBy]).filter((v): v is string => !!v)),
  ];
  const users = userIds.length
    ? await ctx.db
        .select({ id: schema.user.id, name: schema.user.name })
        .from(schema.user)
        .where(inArray(schema.user.id, userIds))
    : [];
  const names = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((r) => {
    const l = linkOf(r);
    const link: NoteLinkDto | null = l ? { ...l, title: titles[l.type]?.[l.id] ?? null } : null;
    return {
      id: r.id,
      title: r.title,
      bodyJson: docOf(r.bodyJson),
      bodyText: r.bodyText,
      pinned: r.pinned,
      version: r.version,
      link,
      tags: r.tags,
      isPrivate: r.isPrivate,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      createdById: r.createdBy,
      createdByName: r.createdBy ? (names.get(r.createdBy) ?? null) : null,
      updatedByName: r.updatedBy ? (names.get(r.updatedBy) ?? null) : null,
      canWrite: can(ctx, "ukoly.write", { ownerIds: [r.createdBy] }),
    };
  });
}

/** Řádek poznámky, který aktér smí číst; jinak `NotFoundError` (soukromá cizí poznámka se tváří jako neexistující). */
export async function loadVisibleNote(ctx: Ctx, id: string): Promise<NoteRow> {
  const [row] = await ctx.db
    .select()
    .from(note)
    .where(and(eq(note.id, id), visibleNotes(ctx)));
  if (!row) throw new NotFoundError("Poznámka nenalezena.");
  return row;
}

/** Jedna poznámka s obsahem. */
export async function getNote(ctx: Ctx, deps: ModuleDeps, id: string): Promise<NoteDto> {
  return (await toNoteDtos(ctx, deps, [await loadVisibleNote(ctx, id)]))[0]!;
}

/** Hledaný text jako vzor `like` (bez diakritiky a velikosti písmen; stejný výraz jako trigramové indexy). */
function likePattern(q: string): string {
  return "%" + q.replace(/[\\%_]/g, "\\$&") + "%";
}

/** Poznámky k záznamu nebo samostatné: připnuté nahoře, pak nejnovější. */
export async function listNotes(
  ctx: Ctx,
  deps: ModuleDeps,
  input: ListNotesInput,
): Promise<ListNotesResult> {
  const link = LINKS.map(([type, col]) => ({ type, id: input[col] })).find((l) => !!l.id);
  // nadřazený záznam musí aktér smět číst (soukromá zakázka partnerovi = NotFound)
  if (link?.id) await assertEntityAccess(ctx, link.type, link.id, "read");
  const pattern = input.q ? likePattern(input.q) : null;
  const where = and(
    visibleNotes(ctx),
    link?.id ? eq(LINK_COLUMNS[link.type], link.id) : undefined,
    input.standalone
      ? sql`num_nonnulls(${note.dealId}, ${note.companyId}, ${note.personId}, ${note.jobId}) = 0`
      : undefined,
    input.visibility === "private" ? eq(note.isPrivate, true) : undefined,
    input.visibility === "shared" ? eq(note.isPrivate, false) : undefined,
    pattern
      ? or(
          sql`lower(f_unaccent(${note.title})) like lower(f_unaccent(${pattern})) escape '\\'`,
          sql`lower(f_unaccent(${note.bodyText})) like lower(f_unaccent(${pattern})) escape '\\'`,
        )
      : undefined,
  );
  const [rows, [agg]] = await Promise.all([
    ctx.db
      .select()
      .from(note)
      .where(where)
      .orderBy(desc(note.pinned), desc(note.createdAt), desc(note.id))
      .limit(input.limit ?? 50)
      .offset(input.offset ?? 0),
    ctx.db.select({ n: count() }).from(note).where(where),
  ]);
  return { rows: await toNoteDtos(ctx, deps, rows), total: agg?.n ?? 0 };
}

/** Počty poznámek podle organizací (záložka „Poznámky“ na kartě klienta). */
export async function noteCountForCompany(ctx: Ctx, companyId: string): Promise<number> {
  const [r] = await ctx.db
    .select({ n: count() })
    .from(note)
    .where(and(visibleNotes(ctx), eq(note.companyId, companyId)));
  return r?.n ?? 0;
}
