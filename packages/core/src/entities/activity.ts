import { and, desc, eq } from "drizzle-orm";
import { auditReadScope } from "../audit/visibility";
import { listComments } from "../collab/comments";
import { schema } from "../db/client";
import type { AuditChange } from "../db/schema/audit";
import { listAttachments } from "../files/service";
import type { Ctx } from "../rbac/types";
import { scopeOf } from "../rbac/permissions";
import { assertEntityAccess } from "./policy";
import type { EntityDef } from "./types";

export type TimelineItem =
  | {
      kind: "audit";
      id: string;
      at: string;
      actor: string;
      action: string;
      summary: string | null;
      changes: AuditChange[];
    }
  | {
      kind: "comment";
      id: string;
      at: string;
      actor: string;
      actorId: string;
      body: string;
      edited: boolean;
    };

/** Jak se v časové ose jmenuje aktér, který není uživatel (bez popisku zdroje). */
const ACTOR_NAMES: Record<string, string> = {
  system: "Systém",
  agency: "Agentura",
  n8n: "n8n",
  google: "Google",
  meta: "Meta",
  job: "Automatická úloha",
};

/** Částka s měnou v textu (výstup `formatMinor`: „12 500 Kč“, „1 234,50 Kč“, „EUR“). */
const MONEY_TEXT = /\d[\d\s\u00a0\u202f]*(?:[.,]\d+)?\s*(?:Kč|CZK|EUR|USD|€)/i;

/**
 * Co z auditu smí vidět aktér, který nemá oprávnění ke všem atributům záznamu (cena a marže zakázky): změny skrytých
 * atributů se vynechají a záznamy z auditu, jejichž text nese částku (náklad, schválení, faktura), se skryjí celé.
 * Audit modulů nese peníze jen v textu, proto se poznávají podle částky s měnou.
 */
export function visibleAudit<T extends { summary: string | null; changes: AuditChange[] }>(
  ctx: Ctx,
  def: Pick<EntityDef, "attributes"> | undefined,
  rows: readonly T[],
): T[] {
  const hiddenAttrs = (def?.attributes ?? []).filter(
    (a) => a.permission && !scopeOf(ctx, a.permission),
  );
  if (!hiddenAttrs.length) return [...rows];
  const hidden = new Set(hiddenAttrs.flatMap((a) => [a.key, a.label, a.field ?? a.key]));
  const out: T[] = [];
  for (const r of rows) {
    const changes = r.changes.filter((c) => !hidden.has(c.field));
    if (r.changes.length && !changes.length) continue;
    if (r.summary && MONEY_TEXT.test(r.summary)) {
      if (!r.changes.length) continue;
      out.push({ ...r, changes, summary: null });
      continue;
    }
    out.push({ ...r, changes });
  }
  return out;
}

/**
 * Vše, co se kolem záznamu děje: časová osa (změny z auditu a komentáře) a soubory.
 * Smí ji číst ten, kdo záznam vidí. S `def` entity se z auditu vynechají peníze a skryté atributy (viz `visibleAudit`).
 */
export async function getRecordActivity(
  ctx: Ctx,
  entityType: string,
  id: string,
  def?: Pick<EntityDef, "attributes">,
) {
  await assertEntityAccess(ctx, entityType, id, "read");
  const [audit, comments, files] = await Promise.all([
    ctx.db
      .select({
        id: schema.auditLog.id,
        at: schema.auditLog.occurredAt,
        actorKind: schema.auditLog.actorKind,
        actorLabel: schema.auditLog.actorLabel,
        actorName: schema.user.name,
        action: schema.auditLog.action,
        summary: schema.auditLog.summary,
        changes: schema.auditLog.changes,
      })
      .from(schema.auditLog)
      .leftJoin(schema.user, eq(schema.auditLog.actorId, schema.user.id))
      .where(
        and(
          eq(schema.auditLog.entityType, entityType),
          eq(schema.auditLog.entityId, id),
          auditReadScope(ctx),
        ),
      )
      .orderBy(desc(schema.auditLog.occurredAt))
      .limit(200),
    listComments(ctx, entityType, id),
    listAttachments(ctx, entityType, id),
  ]);

  const timeline: TimelineItem[] = [
    ...visibleAudit(ctx, def, audit).map((a): TimelineItem => ({
      kind: "audit",
      id: a.id,
      at: a.at.toISOString(),
      actor: a.actorName ?? a.actorLabel ?? ACTOR_NAMES[a.actorKind] ?? "Neznámý",
      action: a.action,
      summary: a.summary,
      changes: a.changes,
    })),
    ...comments.map((c): TimelineItem => ({
      kind: "comment",
      id: c.id,
      at: c.createdAt.toISOString(),
      actor: c.authorName,
      actorId: c.authorId,
      body: c.body,
      edited: !!c.editedAt,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return {
    timeline,
    files: files.map((f) => ({
      ...f,
      takenAt: f.takenAt?.toISOString() ?? null,
      createdAt: f.createdAt.toISOString(),
    })),
  };
}
