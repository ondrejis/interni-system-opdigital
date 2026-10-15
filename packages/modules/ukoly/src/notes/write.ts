import { and, eq, isNull } from "drizzle-orm";
import { recordAudit } from "@rebar/core/audit";
import { newId } from "@rebar/core/db";
import {
  assertEntityAccess,
  deleteRecord,
  indexRecord,
  privateScope,
  resolveEntity,
  syncPrivateRecord,
  updateRecord,
  visibilityForInsert,
} from "@rebar/core/entities";
import type { ModuleDeps } from "@rebar/core/module-server";
import { NotFoundError, PermissionError, UserError, can, inTx, type Ctx } from "@rebar/core/rbac";
import { note } from "../schema/notes";
import type {
  CreateNoteInput,
  NoteDto,
  SaveNoteInput,
  SaveNoteResult,
  UpdateNoteInput,
} from "./contract";
import {
  NoteDocError,
  emptyNoteDoc,
  nextTitle,
  notePreview,
  sameNoteDoc,
  sanitizeNoteDoc,
  type NoteDoc,
} from "./doc";
import { getNote, linkOf, loadVisibleNote, toNoteDtos, type NoteRow } from "./queries";

/*
  Zápisy poznámek (UKO-11). Obsah (`body_json`) prochází `sanitizeNoteDoc` při každém zápisu, takže do databáze se
  nedostane nic mimo povolené uzly a značky; `body_text` a automatický název se odvozují na serveru, ne z klienta.
  Autosave (`saveNote`) je chráněný verzí: zápis ze zastaralého okna se nepřepíše mlčky (konflikt), `force` = poslední
  zápis vyhrává. Každá uložená změna obsahu je zapsaná v historii (audit). Přesun, štítky, připnutí a smazání jdou přes
  engine entit (zámek, koš, audit, index hledání).
*/

const sanitize = (raw: unknown) => {
  try {
    return sanitizeNoteDoc(raw);
  } catch (e) {
    if (e instanceof NoteDocError) throw new UserError(e.message);
    throw e;
  }
};

/** Kontext záznamu v historii: odkud poznámka je (pro filtrování a odkazy). */
const auditContext = (
  row: Pick<NoteRow, "id" | "dealId" | "companyId" | "personId" | "jobId">,
) => ({
  entityType: "note",
  entityId: row.id,
  ...(row.dealId ? { dealId: row.dealId } : {}),
  ...(row.companyId ? { companyId: row.companyId } : {}),
  ...(row.personId ? { personId: row.personId } : {}),
  ...(row.jobId ? { jobId: row.jobId } : {}),
});

/** Založí poznámku. Vazba musí být záznam, který aktér smí číst; soukromou smí založit jen vlastník soukromých záznamů. */
export async function createNote(
  ctx: Ctx,
  deps: ModuleDeps,
  input: CreateNoteInput,
): Promise<NoteDto> {
  const links = {
    dealId: input.dealId ?? null,
    companyId: input.companyId ?? null,
    personId: input.personId ?? null,
    jobId: input.jobId ?? null,
  };
  const link = linkOf(links);
  if (link) await assertEntityAccess(ctx, link.type, link.id, "read");
  const cleaned = sanitize(input.bodyJson ?? null);
  const id = await inTx(ctx, async (c) => {
    const noteId = newId();
    const vis = await visibilityForInsert(
      c,
      deps.registry,
      "note",
      { id: noteId, ...links },
      input.isPrivate,
    );
    const title = nextTitle({
      title: null,
      previousText: "",
      nextText: cleaned.text,
      explicit: input.title,
    });
    const [row] = await c.db
      .insert(note)
      .values({
        id: noteId,
        title,
        bodyJson: input.bodyJson ? (cleaned.doc as unknown as Record<string, unknown>) : null,
        bodyText: cleaned.text,
        pinned: input.pinned === true,
        ...links,
        tags: input.tags ?? [],
        isPrivate: vis.isPrivate,
        visibilitySource: vis.visibilitySource,
        createdBy: c.actor.userId,
        updatedBy: c.actor.userId,
      })
      .returning();
    if (vis.isPrivate) await syncPrivateRecord(c.db, "note", noteId, true);
    await recordAudit(c, {
      action: "create",
      entityType: "note",
      entityId: noteId,
      summary: title ?? "Poznámka",
      entityTitle: title ?? "Poznámka",
      isPrivate: vis.isPrivate,
      context: auditContext(row!),
      changes: [
        ...(title ? [{ field: "Název", old: null, new: title }] : []),
        ...(cleaned.text
          ? [{ field: "Text", old: null, new: notePreview(cleaned.text, 500) }]
          : []),
        ...(input.pinned ? [{ field: "Připnuto", old: null, new: "Ano" }] : []),
      ],
    });
    const def = deps.registry.get("note");
    if (def) await indexRecord(c.db, { def }, row as unknown as Record<string, unknown>);
    return noteId;
  });
  return getNote(ctx, deps, id);
}

/**
 * Autosave obsahu. Postup v jedné transakci s uzamčeným řádkem: oprávnění → sanitizace → shoda verze (jinak konflikt)
 * → zápis s novou verzí, názvem odvozeným z textu, auditem a aktualizací hledání. Beze změny se nic nezapíše.
 */
export async function saveNote(
  ctx: Ctx,
  deps: ModuleDeps,
  input: SaveNoteInput,
): Promise<SaveNoteResult> {
  const cleaned = input.bodyJson === undefined ? null : sanitize(input.bodyJson);
  const outcome = await inTx(ctx, async (c) => {
    const [found] = await c.db
      .select()
      .from(note)
      .where(and(eq(note.id, input.id), isNull(note.deletedAt), privateScope(c, note)))
      .for("update");
    const row: NoteRow | undefined = found;
    if (!row) throw new NotFoundError("Poznámka nenalezena.");
    if (!can(c, "ukoly.read", { ownerIds: [row.createdBy] }))
      throw new NotFoundError("Poznámka nenalezena.");
    if (!can(c, "ukoly.write", { ownerIds: [row.createdBy] })) throw new PermissionError();

    const bodyChanged =
      !!cleaned && !sameNoteDoc(cleaned.doc, (row.bodyJson as NoteDoc | null) ?? emptyNoteDoc());
    if (bodyChanged && !input.force && input.baseVersion !== row.version)
      return { conflict: row } as { conflict: NoteRow };

    const nextText = bodyChanged ? cleaned!.text : row.bodyText;
    const title = nextTitle({
      title: row.title,
      previousText: row.bodyText,
      nextText,
      explicit: input.title,
    });
    const titleChanged = title !== row.title;
    if (!bodyChanged && !titleChanged) return { unchanged: row } as { unchanged: NoteRow };

    const [updated] = await c.db
      .update(note)
      .set({
        ...(bodyChanged
          ? {
              bodyJson: cleaned!.doc as unknown as Record<string, unknown>,
              bodyText: cleaned!.text,
              version: row.version + 1,
            }
          : {}),
        title,
        updatedBy: c.actor.userId,
      })
      .where(eq(note.id, row.id))
      .returning();
    await recordAudit(c, {
      action: "update",
      entityType: "note",
      entityId: row.id,
      summary: title ?? "Poznámka",
      entityTitle: title ?? "Poznámka",
      isPrivate: row.isPrivate,
      context: auditContext(row),
      changes: [
        ...(titleChanged ? [{ field: "Název", old: row.title, new: title }] : []),
        ...(bodyChanged
          ? [
              {
                field: "Text",
                old: notePreview(row.bodyText, 500) || null,
                new: notePreview(nextText, 500) || null,
              },
            ]
          : []),
      ],
    });
    const def = deps.registry.get("note");
    if (def) await indexRecord(c.db, { def }, updated as unknown as Record<string, unknown>);
    return { saved: updated! } as { saved: NoteRow };
  });
  if ("conflict" in outcome)
    return { status: "conflict", note: (await toNoteDtos(ctx, deps, [outcome.conflict]))[0]! };
  const row = "saved" in outcome ? outcome.saved : outcome.unchanged;
  return {
    status: "saved",
    unchanged: "unchanged" in outcome,
    note: (await toNoteDtos(ctx, deps, [row]))[0]!,
  };
}

/** Přesune poznámku k jinému záznamu (nebo ji udělá samostatnou) a/nebo změní štítky; přes engine (zámek, audit, hledání). */
export async function updateNote(
  ctx: Ctx,
  deps: ModuleDeps,
  input: UpdateNoteInput,
): Promise<NoteDto> {
  await loadVisibleNote(ctx, input.id);
  const touchesLink = (["dealId", "companyId", "personId", "jobId"] as const).some(
    (k) => input[k] !== undefined,
  );
  if (touchesLink) {
    const e = await resolveEntity(ctx.db, deps.registry.get("note")!);
    await updateRecord(ctx, deps.registry, e, input.id, {
      deal: input.dealId ?? null,
      company: input.companyId ?? null,
      person: input.personId ?? null,
      job: input.jobId ?? null,
    });
  }
  if (input.tags !== undefined) {
    // štítky mimo engine: ten prázdné pole ukládá jako NULL, sloupec je povinný
    await inTx(ctx, async (c) => {
      const row = await loadVisibleNote(c, input.id);
      if (!can(c, "ukoly.write", { ownerIds: [row.createdBy] })) throw new PermissionError();
      const tags = [...new Set(input.tags!)];
      if (tags.join("\0") === row.tags.join("\0")) return;
      await c.db.update(note).set({ tags, updatedBy: c.actor.userId }).where(eq(note.id, row.id));
      await recordAudit(c, {
        action: "update",
        entityType: "note",
        entityId: row.id,
        summary: row.title ?? "Poznámka",
        entityTitle: row.title ?? "Poznámka",
        isPrivate: row.isPrivate,
        context: auditContext(row),
        changes: [
          { field: "Štítky", old: row.tags.join(", ") || null, new: tags.join(", ") || null },
        ],
      });
    });
  }
  return getNote(ctx, deps, input.id);
}

/** Připne nebo odepne poznámku. */
export async function pinNote(
  ctx: Ctx,
  deps: ModuleDeps,
  input: { id: string; pinned: boolean },
): Promise<NoteDto> {
  await loadVisibleNote(ctx, input.id);
  const e = await resolveEntity(ctx.db, deps.registry.get("note")!);
  await updateRecord(ctx, deps.registry, e, input.id, { pinned: input.pinned });
  return getNote(ctx, deps, input.id);
}

/** Smaže poznámku do koše (obnovit jde z koše na 30 dní). */
export async function deleteNote(ctx: Ctx, deps: ModuleDeps, id: string): Promise<void> {
  const e = await resolveEntity(ctx.db, deps.registry.get("note")!);
  await deleteRecord(ctx, e, id);
}
