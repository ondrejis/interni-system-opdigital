import { and, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { recordAudit } from "@rebar/core/audit";
import { schema, type Executor } from "@rebar/core/db";
import { assertEntityAccess } from "@rebar/core/entities";
import { can, inTx, NotFoundError, PermissionError, scopeOf, type Ctx } from "@rebar/core/rbac";
import { job } from "@rebar/zakazky/schema";
import { crmNote } from "../../schema";
import { READ, WRITE } from "./service";
import type { NoteDto, NoteTarget } from "./types";

/** Řádek poznámky z databáze. */
export type NoteRow = typeof crmNote.$inferSelect;

export const NOTE_TARGETS = ["job", "company", "person"] as const satisfies readonly NoteTarget[];

/** Rozsah „jen moje“ pro poznámky: napsal jsem je já, nebo patří k zakázce, kterou vedu. */
export function noteScope(ctx: Ctx): SQL {
  const me = ctx.actor.userId;
  if (!me) return sql`false`;
  return or(
    eq(crmNote.authorId, me),
    sql`(${crmNote.entityType} = 'job' and exists (select 1 from ${job} where ${job.id} = ${crmNote.entityId} and ${job.managerId} = ${me} and ${job.deletedAt} is null))`,
  )!;
}

/** Podmínka `WHERE` pro poznámky, které aktér smí číst (bez smazaných). */
export function visibleNotes(ctx: Ctx): SQL {
  const scope = scopeOf(ctx, READ);
  if (!scope) throw new PermissionError();
  return and(isNull(crmNote.deletedAt), scope === "all" ? undefined : noteScope(ctx))!;
}

/** Vlastníci poznámky pro rozsah „jen moje“: autor a (u zakázky) vedoucí; `null`, když poznámka neexistuje. */
export async function noteOwners(db: Executor, id: string): Promise<(string | null)[] | null> {
  const [row] = await db
    .select({ author: crmNote.authorId, type: crmNote.entityType, entityId: crmNote.entityId })
    .from(crmNote)
    .where(and(eq(crmNote.id, id), isNull(crmNote.deletedAt)));
  if (!row) return null;
  if (row.type !== "job") return [row.author];
  const [j] = await db.select({ m: job.managerId }).from(job).where(eq(job.id, row.entityId));
  return [row.author, j?.m ?? null];
}

async function loadNote(
  ctx: Ctx,
  id: string,
): Promise<{ row: NoteRow; owners: (string | null)[] }> {
  const [row] = await ctx.db
    .select()
    .from(crmNote)
    .where(and(eq(crmNote.id, id), isNull(crmNote.deletedAt)));
  const owners = row ? ((await noteOwners(ctx.db, id)) ?? []) : [];
  if (!row || !can(ctx, READ, { ownerIds: owners }))
    throw new NotFoundError("Poznámka nenalezena.");
  return { row, owners };
}

/** Poznámku mění a maže její autor; s rozsahem „vše“ i kdokoli jiný (úklid po odchodu kolegy). */
function assertCanEdit(ctx: Ctx, row: NoteRow) {
  if (row.authorId === ctx.actor.userId || scopeOf(ctx, WRITE) === "all") return;
  throw new PermissionError("Poznámku může upravit jen její autor.");
}

/** Přidá poznámku k zakázce, firmě nebo osobě (aktér musí záznam smět číst). */
export async function createNote(
  ctx: Ctx,
  input: { entityType: NoteTarget; entityId: string; body: string; pinned?: boolean | undefined },
): Promise<NoteRow> {
  await assertEntityAccess(ctx, input.entityType, input.entityId, "read");
  return inTx(ctx, async (c) => {
    const [row] = await c.db
      .insert(crmNote)
      .values({
        body: input.body,
        pinned: input.pinned === true,
        entityType: input.entityType,
        entityId: input.entityId,
        authorId: c.actor.userId,
        createdBy: c.actor.userId,
        updatedBy: c.actor.userId,
      })
      .returning();
    await recordAudit(c, {
      action: "create",
      entityType: "crm_note",
      entityId: row!.id,
      summary: row!.body.slice(0, 120),
      changes: [{ field: "Poznámka", old: null, new: row!.body.slice(0, 500) }],
    });
    return row!;
  });
}

/** Změní text poznámky (smí autor, s rozsahem „vše“ kdokoli) a zapíše změnu do auditu. */
export async function updateNote(ctx: Ctx, id: string, body: string): Promise<NoteRow> {
  return inTx(ctx, async (c) => {
    const { row } = await loadNote(c, id);
    assertCanEdit(c, row);
    if (row.body === body) return row;
    const [updated] = await c.db
      .update(crmNote)
      .set({ body, updatedBy: c.actor.userId })
      .where(eq(crmNote.id, id))
      .returning();
    await recordAudit(c, {
      action: "update",
      entityType: "crm_note",
      entityId: id,
      summary: body.slice(0, 120),
      changes: [{ field: "Poznámka", old: row.body.slice(0, 500), new: body.slice(0, 500) }],
    });
    return updated!;
  });
}

/** Smaže poznámku (měkce) s auditem; smí autor, s rozsahem „vše“ kdokoli. */
export async function deleteNote(ctx: Ctx, id: string): Promise<void> {
  await inTx(ctx, async (c) => {
    const { row } = await loadNote(c, id);
    assertCanEdit(c, row);
    await c.db
      .update(crmNote)
      .set({ deletedAt: new Date(), updatedBy: c.actor.userId })
      .where(eq(crmNote.id, id));
    await recordAudit(c, {
      action: "delete",
      entityType: "crm_note",
      entityId: id,
      summary: row.body.slice(0, 120),
    });
  });
}

/** Připne poznámku nahoru (do „Dalších kroků“), nebo ji odepne. Smí každý, kdo smí poznámky psát. */
export async function pinNote(ctx: Ctx, id: string, pinned: boolean): Promise<NoteRow> {
  return inTx(ctx, async (c) => {
    const { row, owners } = await loadNote(c, id);
    if (!can(c, WRITE, { ownerIds: owners })) throw new PermissionError();
    if (row.pinned === pinned) return row;
    const [updated] = await c.db
      .update(crmNote)
      .set({ pinned, updatedBy: c.actor.userId })
      .where(eq(crmNote.id, id))
      .returning();
    await recordAudit(c, {
      action: "update",
      entityType: "crm_note",
      entityId: id,
      summary: row.body.slice(0, 120),
      changes: [{ field: "Připnuto", old: row.pinned ? "ano" : "ne", new: pinned ? "ano" : "ne" }],
    });
    return updated!;
  });
}

/** Poznámky v podobě pro UI (s jménem autora). */
export async function toNoteDtos(ctx: Ctx, rows: readonly NoteRow[]): Promise<NoteDto[]> {
  if (!rows.length) return [];
  const ids = [...new Set(rows.map((r) => r.authorId).filter((v): v is string => !!v))];
  const names = ids.length
    ? new Map(
        (
          await ctx.db
            .select({ id: schema.user.id, name: schema.user.name })
            .from(schema.user)
            .where(inArray(schema.user.id, ids))
        ).map((u) => [u.id, u.name]),
      )
    : new Map<string, string>();
  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    pinned: r.pinned,
    entityType: r.entityType as NoteTarget,
    entityId: r.entityId,
    authorId: r.authorId,
    authorName: r.authorId ? (names.get(r.authorId) ?? null) : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}
