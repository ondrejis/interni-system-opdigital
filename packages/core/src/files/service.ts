import { createHash } from "node:crypto";
import type { Readable } from "node:stream";
import { and, eq, isNull, lt, notExists, sql } from "drizzle-orm";
import { recordAudit } from "../audit/audit";
import { schema, type Executor } from "../db/client";
import { newId } from "../db/ids";
import type { Geo } from "../db/schema/files";
import { assertEntityAccess } from "../entities/policy";
import { inTx } from "../rbac/context";
import { NotFoundError, PermissionError, UserError } from "../rbac/errors";
import { can } from "../rbac/permissions";
import type { Ctx } from "../rbac/types";
import { makeThumbnail, normalizeImage } from "./images";
import { storageKey, type StorageDriver } from "./storage";
import { detectFile, sanitizeFileName } from "./validate";

export type FilesDeps = { storage: StorageDriver };

export type AttachTo = {
  entityType: string;
  entityId: string;
  /** Druh přílohy (`photo`, `document`, `protocol`…). */
  kind?: string;
  takenAt?: Date | null;
  geo?: Geo | null;
  note?: string | null;
};

function actorId(ctx: Ctx): string {
  if (!ctx.actor.userId) throw new PermissionError();
  return ctx.actor.userId;
}

/**
 * Nahraje soubor. Typ se pozná z obsahu, fotky se natočí, zbaví metadat a zmenší. Je-li zadána vazba na
 * záznam, uživatel k němu musí mít právo zápisu; bez vazby je soubor „volný“ (vidí ho jen nahrávající,
 * dokud se nepřipojí) a nepřipojené soubory se po 24 hodinách uklidí.
 */
export async function uploadFile(
  ctx: Ctx,
  deps: FilesDeps,
  input: { name: string; data: Buffer; attachTo?: AttachTo },
) {
  const me = actorId(ctx);
  const name = sanitizeFileName(input.name);
  const detected = detectFile(name, input.data);

  let body = input.data;
  let mime = detected.mime;
  let width: number | null = null;
  let height: number | null = null;
  if (detected.kind === "image") {
    try {
      const img = await normalizeImage(input.data, detected.mime);
      body = img.data;
      mime = img.mime;
      width = img.width;
      height = img.height;
    } catch {
      throw new UserError("Obrázek je poškozený nebo ho nelze zpracovat.");
    }
  }

  const id = newId();
  const key = storageKey(id);
  await deps.storage.put(key, body);
  try {
    return await inTx(ctx, async (c) => {
      if (input.attachTo)
        await assertEntityAccess(c, input.attachTo.entityType, input.attachTo.entityId, "write");
      const [row] = await c.db
        .insert(schema.file)
        .values({
          id,
          storageKey: key,
          name,
          mime,
          size: body.length,
          sha256: createHash("sha256").update(body).digest("hex"),
          kind: detected.kind,
          width,
          height,
          uploadedBy: me,
          createdBy: me,
          updatedBy: me,
        })
        .returning();
      let attachmentId: string | null = null;
      if (input.attachTo) {
        const a = input.attachTo;
        const [att] = await c.db
          .insert(schema.attachment)
          .values({
            fileId: id,
            entityType: a.entityType,
            entityId: a.entityId,
            kind: a.kind ?? (detected.kind === "image" ? "photo" : "document"),
            takenAt: a.takenAt ?? null,
            geo: a.geo ?? null,
            note: a.note ?? null,
            createdBy: me,
            updatedBy: me,
          })
          .returning({ id: schema.attachment.id });
        attachmentId = att!.id;
      }
      await recordAudit(c, {
        action: "create",
        entityType: "file",
        entityId: id,
        summary: `${name}${input.attachTo ? ` → ${input.attachTo.entityType}` : ""}`,
        changes: [
          { field: "name", old: null, new: name },
          { field: "size", old: null, new: body.length },
        ],
      });
      return { file: row!, attachmentId };
    });
  } catch (err) {
    await deps.storage.delete(key).catch(() => {}); // DB zápis selhal, soubor v úložišti nesmí osiřet
    throw err;
  }
}

/** Smí aktér soubor číst? Ano, když vidí záznam, ke kterému je připojen; jinak jen nahrávající a správce souborů. */
async function assertCanReadFile(ctx: Ctx, fileId: string) {
  const [file] = await ctx.db
    .select()
    .from(schema.file)
    .where(and(eq(schema.file.id, fileId), isNull(schema.file.deletedAt)));
  if (!file) throw new NotFoundError("Soubor nenalezen.");
  if (file.uploadedBy === ctx.actor.userId || can(ctx, "files.manage")) return file;

  const links = await ctx.db
    .select({ entityType: schema.attachment.entityType, entityId: schema.attachment.entityId })
    .from(schema.attachment)
    .where(and(eq(schema.attachment.fileId, fileId), isNull(schema.attachment.deletedAt)));
  for (const l of links) {
    try {
      await assertEntityAccess(ctx, l.entityType, l.entityId, "read");
      return file;
    } catch {
      /* zkusit další vazbu */
    }
  }
  throw new NotFoundError("Soubor nenalezen.");
}

/** Otevře soubor (nebo jeho náhled) ke stažení. Oprávnění se ověřuje vždy zde, ne podle znalosti adresy. */
export async function openFile(
  ctx: Ctx,
  deps: FilesDeps,
  fileId: string,
  opts: { thumb?: boolean } = {},
) {
  const file = await assertCanReadFile(ctx, fileId);
  if (opts.thumb && file.thumbKey) {
    return {
      name: file.name.replace(/\.[^.]+$/, "") + ".webp",
      mime: "image/webp",
      size: null as number | null,
      stream: (await deps.storage.get(file.thumbKey)) as Readable,
    };
  }
  return {
    name: file.name,
    mime: file.mime,
    size: file.size as number | null,
    stream: (await deps.storage.get(file.storageKey)) as Readable,
  };
}

/** Vyrobí náhled obrázku (volá se z fronty úloh po nahrání). Neobrázky přeskočí. */
export async function generateThumbnail(
  db: Executor,
  deps: FilesDeps,
  fileId: string,
): Promise<boolean> {
  const [file] = await db.select().from(schema.file).where(eq(schema.file.id, fileId));
  if (!file || file.kind !== "image" || file.thumbKey || file.mime === "image/gif") return false;
  const chunks: Buffer[] = [];
  for await (const c of await deps.storage.get(file.storageKey)) chunks.push(c as Buffer);
  const thumb = await makeThumbnail(Buffer.concat(chunks));
  const key = storageKey(file.id, ".thumb");
  await deps.storage.put(key, thumb);
  await db.update(schema.file).set({ thumbKey: key }).where(eq(schema.file.id, fileId));
  return true;
}

/** Přílohy záznamu (čte ten, kdo záznam vidí). */
export async function listAttachments(ctx: Ctx, entityType: string, entityId: string) {
  await assertEntityAccess(ctx, entityType, entityId, "read");
  return ctx.db
    .select({
      id: schema.attachment.id,
      fileId: schema.file.id,
      name: schema.file.name,
      mime: schema.file.mime,
      size: schema.file.size,
      kind: schema.attachment.kind,
      width: schema.file.width,
      height: schema.file.height,
      hasThumb: sql<boolean>`${schema.file.thumbKey} is not null`,
      takenAt: schema.attachment.takenAt,
      geo: schema.attachment.geo,
      note: schema.attachment.note,
      createdAt: schema.attachment.createdAt,
    })
    .from(schema.attachment)
    .innerJoin(schema.file, eq(schema.attachment.fileId, schema.file.id))
    .where(
      and(
        eq(schema.attachment.entityType, entityType),
        eq(schema.attachment.entityId, entityId),
        isNull(schema.attachment.deletedAt),
        isNull(schema.file.deletedAt),
      ),
    )
    .orderBy(schema.attachment.createdAt);
}

/** Připojí už nahraný soubor k záznamu (vyžaduje právo zápisu na záznam a vlastnictví souboru). */
export async function attachFile(ctx: Ctx, fileId: string, to: AttachTo) {
  const me = actorId(ctx);
  return inTx(ctx, async (c) => {
    await assertEntityAccess(c, to.entityType, to.entityId, "write");
    const [file] = await c.db
      .select()
      .from(schema.file)
      .where(and(eq(schema.file.id, fileId), isNull(schema.file.deletedAt)));
    if (!file || (file.uploadedBy !== me && !can(c, "files.manage")))
      throw new NotFoundError("Soubor nenalezen.");
    const [att] = await c.db
      .insert(schema.attachment)
      .values({
        fileId,
        entityType: to.entityType,
        entityId: to.entityId,
        kind: to.kind ?? "document",
        takenAt: to.takenAt ?? null,
        geo: to.geo ?? null,
        note: to.note ?? null,
        createdBy: me,
        updatedBy: me,
      })
      .returning({ id: schema.attachment.id });
    await recordAudit(c, {
      action: "attach",
      entityType: "file",
      entityId: fileId,
      summary: `→ ${to.entityType}`,
    });
    return att!.id;
  });
}

/** Odpojí přílohu od záznamu (soubor se uklidí, až nebude připojen nikde). Právo zápisu na záznam. */
export async function detachAttachment(ctx: Ctx, attachmentId: string) {
  const me = actorId(ctx);
  await inTx(ctx, async (c) => {
    const [att] = await c.db
      .select()
      .from(schema.attachment)
      .where(and(eq(schema.attachment.id, attachmentId), isNull(schema.attachment.deletedAt)));
    if (!att) throw new NotFoundError("Příloha nenalezena.");
    await assertEntityAccess(c, att.entityType, att.entityId, "write");
    await c.db
      .update(schema.attachment)
      .set({ deletedAt: new Date(), updatedBy: me })
      .where(eq(schema.attachment.id, attachmentId));
    await recordAudit(c, {
      action: "detach",
      entityType: "file",
      entityId: att.fileId,
      summary: `← ${att.entityType}`,
    });
  });
}

/**
 * Úklid: soubory, které nejsou připojeny nikam a jsou starší než `olderThanHours`, se smažou (měkce v DB,
 * natvrdo v úložišti). Spouští se jako plánovaná úloha.
 */
export async function purgeOrphanFiles(
  db: Executor,
  deps: FilesDeps,
  olderThanHours = 24,
): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanHours * 3_600_000);
  const orphans = await db
    .select({
      id: schema.file.id,
      storageKey: schema.file.storageKey,
      thumbKey: schema.file.thumbKey,
    })
    .from(schema.file)
    .where(
      and(
        isNull(schema.file.deletedAt),
        lt(schema.file.createdAt, cutoff),
        notExists(
          db
            .select({ one: sql`1` })
            .from(schema.attachment)
            .where(
              and(
                eq(schema.attachment.fileId, schema.file.id),
                isNull(schema.attachment.deletedAt),
              ),
            ),
        ),
      ),
    );
  for (const f of orphans) {
    await deps.storage.delete(f.storageKey);
    if (f.thumbKey) await deps.storage.delete(f.thumbKey);
    await db.update(schema.file).set({ deletedAt: new Date() }).where(eq(schema.file.id, f.id));
  }
  return orphans.length;
}
