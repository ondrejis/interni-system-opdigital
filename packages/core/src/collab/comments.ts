import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import "../zod-locale";
import { recordAudit } from "../audit/audit";
import { schema } from "../db/client";
import { assertEntityAccess } from "../entities/policy";
import { inTx } from "../rbac/context";
import { NotFoundError, PermissionError } from "../rbac/errors";
import { can } from "../rbac/permissions";
import type { Ctx } from "../rbac/types";
import { COMMENT_MENTION } from "../notifications/catalog";
import { notify } from "../notifications/notify";

/** Zmínka v textu: `@[Jana Nováková](uuid)`. */
const MENTION = /@\[[^\]]*\]\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi;

export function parseMentions(body: string): string[] {
  return [...new Set([...body.matchAll(MENTION)].map((m) => m[1]!.toLowerCase()))];
}

const bodySchema = z
  .string()
  .trim()
  .min(1, "Napište komentář.")
  .max(5000, "Komentář je příliš dlouhý.");

function actorId(ctx: Ctx): string {
  if (!ctx.actor.userId) throw new PermissionError();
  return ctx.actor.userId;
}

/** Přidá komentář. Smí ho přidat ten, kdo záznam vidí. Zmínění uživatelé dostanou upozornění. */
export async function addComment(
  ctx: Ctx,
  input: { entityType: string; entityId: string; body: string },
) {
  const body = bodySchema.parse(input.body);
  const me = actorId(ctx);
  const policy = await assertEntityAccess(ctx, input.entityType, input.entityId, "read");

  return inTx(ctx, async (c) => {
    const wanted = parseMentions(body).filter((id) => id !== me);
    const valid = wanted.length
      ? (
          await c.db
            .select({ id: schema.user.id })
            .from(schema.user)
            .where(
              and(
                inArray(schema.user.id, wanted),
                eq(schema.user.active, true),
                isNull(schema.user.deletedAt),
              ),
            )
        ).map((r) => r.id)
      : [];

    const [row] = await c.db
      .insert(schema.comment)
      .values({
        entityType: input.entityType,
        entityId: input.entityId,
        authorId: me,
        body,
        mentions: valid,
        createdBy: me,
        updatedBy: me,
      })
      .returning();
    await recordAudit(c, {
      action: "create",
      entityType: "comment",
      entityId: row!.id,
      summary: `Komentář k ${input.entityType}`,
      changes: [{ field: "body", old: null, new: body.slice(0, 200) }],
    });
    const [author] = await c.db
      .select({ name: schema.user.name })
      .from(schema.user)
      .where(eq(schema.user.id, me));
    await notify(c.db, COMMENT_MENTION, {
      params: {
        author: author?.name ?? "Někdo",
        excerpt: body.replace(/@\[([^\]]*)\]\([^)]*\)/g, "@$1").slice(0, 200),
      },
      to: { mentioned: valid },
      record: { type: input.entityType, id: input.entityId },
      ...(policy.url ? { url: policy.url(input.entityId) } : {}),
      actorId: me,
    });
    return row!;
  });
}

/** Komentáře záznamu (nejstarší první). Čte ten, kdo záznam vidí. */
export async function listComments(ctx: Ctx, entityType: string, entityId: string) {
  await assertEntityAccess(ctx, entityType, entityId, "read");
  return ctx.db
    .select({
      id: schema.comment.id,
      body: schema.comment.body,
      authorId: schema.comment.authorId,
      authorName: schema.user.name,
      mentions: schema.comment.mentions,
      createdAt: schema.comment.createdAt,
      editedAt: schema.comment.editedAt,
    })
    .from(schema.comment)
    .innerJoin(schema.user, eq(schema.comment.authorId, schema.user.id))
    .where(
      and(
        eq(schema.comment.entityType, entityType),
        eq(schema.comment.entityId, entityId),
        isNull(schema.comment.deletedAt),
      ),
    )
    .orderBy(asc(schema.comment.createdAt));
}

async function loadOwn(ctx: Ctx, id: string) {
  const [row] = await ctx.db
    .select()
    .from(schema.comment)
    .where(and(eq(schema.comment.id, id), isNull(schema.comment.deletedAt)));
  if (!row) throw new NotFoundError();
  return row;
}

/** Upraví vlastní komentář. */
export async function editComment(ctx: Ctx, id: string, body: string) {
  const text = bodySchema.parse(body);
  const me = actorId(ctx);
  return inTx(ctx, async (c) => {
    const row = await loadOwn(c, id);
    if (row.authorId !== me) throw new PermissionError("Upravit můžete jen vlastní komentář.");
    await assertEntityAccess(c, row.entityType, row.entityId, "read");
    await c.db
      .update(schema.comment)
      .set({ body: text, editedAt: new Date(), updatedBy: me })
      .where(eq(schema.comment.id, id));
    await recordAudit(c, {
      action: "update",
      entityType: "comment",
      entityId: id,
      changes: [{ field: "body", old: row.body.slice(0, 200), new: text.slice(0, 200) }],
    });
  });
}

/** Smaže (měkce) vlastní komentář; cizí jen s oprávněním `comments.moderate`. */
export async function deleteComment(ctx: Ctx, id: string) {
  const me = actorId(ctx);
  await inTx(ctx, async (c) => {
    const row = await loadOwn(c, id);
    if (row.authorId !== me && !can(c, "comments.moderate")) throw new PermissionError();
    await c.db
      .update(schema.comment)
      .set({ deletedAt: new Date(), updatedBy: me })
      .where(eq(schema.comment.id, id));
    await recordAudit(c, {
      action: "delete",
      entityType: "comment",
      entityId: id,
      summary: "Komentář smazán",
    });
  });
}
