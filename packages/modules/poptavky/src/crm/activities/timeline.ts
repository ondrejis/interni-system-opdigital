import { and, asc, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { schema } from "@rebar/core/db";
import { getRecordActivity, visibleRecordTitles, type EntityRegistry } from "@rebar/core/entities";
import { NotFoundError, PermissionError, type Ctx } from "@rebar/core/rbac";
import { crmActivity, crmNote } from "../../schema";
import { toNoteDtos, visibleNotes } from "./notes";
import {
  activityLinkedTo,
  noteLinkedTo,
  resolveTargets,
  type Target,
  type TargetSets,
} from "./queries";
import { toActivityDtos, visibleActivities } from "./service";
import type { NoteComment, NoteTarget, TimelineEntry, TimelineResult } from "./types";

/** Nejvíc záznamů (zakázek, osob, firmy), ze kterých se osa skládá; každý znamená několik dotazů. */
const MAX_RECORDS = 40;
const DEFAULT_LIMIT = 200;

type Source = { type: NoteTarget; id: string };

function sources(sets: TargetSets): Source[] {
  return [
    ...sets.jobIds.map((id): Source => ({ type: "job", id })),
    ...sets.companyIds.map((id): Source => ({ type: "company", id })),
    ...sets.personIds.map((id): Source => ({ type: "person", id })),
  ].slice(0, MAX_RECORDS);
}

/** Komentáře k poznámkám (komentář k poznámce se vede k záznamu `crm_note`), seskupené podle poznámky. */
async function noteComments(ctx: Ctx, noteIds: string[]): Promise<Map<string, NoteComment[]>> {
  const out = new Map<string, NoteComment[]>();
  if (!noteIds.length) return out;
  const rows = await ctx.db
    .select({
      id: schema.comment.id,
      entityId: schema.comment.entityId,
      body: schema.comment.body,
      authorId: schema.comment.authorId,
      authorName: schema.user.name,
      createdAt: schema.comment.createdAt,
      editedAt: schema.comment.editedAt,
    })
    .from(schema.comment)
    .innerJoin(schema.user, eq(schema.comment.authorId, schema.user.id))
    .where(
      and(
        eq(schema.comment.entityType, "crm_note"),
        inArray(schema.comment.entityId, noteIds),
        isNull(schema.comment.deletedAt),
      ),
    )
    .orderBy(asc(schema.comment.createdAt));
  for (const r of rows) {
    const list = out.get(r.entityId) ?? [];
    list.push({
      id: r.id,
      body: r.body,
      authorId: r.authorId,
      authorName: r.authorName,
      createdAt: r.createdAt.toISOString(),
      edited: !!r.editedAt,
    });
    out.set(r.entityId, list);
  }
  return out;
}

/**
 * Časová osa záznamu: hotové aktivity, poznámky (s komentáři), komentáře, soubory a protokol změn v jednom proudu od
 * nejnovějšího. `aggregate` u firmy sbírá dění ze všech jejích zakázek a osob, u osoby z jejích zakázek. Co aktér nesmí
 * vidět (cizí zakázka, ceny v protokolu), se do osy nedostane; změny cen filtruje `getRecordActivity` podle oprávnění.
 */
export async function buildTimeline(
  ctx: Ctx,
  registry: EntityRegistry,
  target: Target,
  opts: { aggregate?: boolean; limit?: number } = {},
): Promise<TimelineResult> {
  const sets = await resolveTargets(ctx, registry, target, opts.aggregate === true);
  const limit = opts.limit ?? DEFAULT_LIMIT;

  const [activityRows, noteRows] = await Promise.all([
    ctx.db
      .select()
      .from(crmActivity)
      .where(and(visibleActivities(ctx), isNotNull(crmActivity.doneAt), activityLinkedTo(sets)))
      .orderBy(desc(crmActivity.doneAt))
      .limit(limit),
    ctx.db
      .select()
      .from(crmNote)
      .where(and(visibleNotes(ctx), noteLinkedTo(sets)))
      .orderBy(desc(crmNote.createdAt))
      .limit(limit),
  ]);
  const [activities, notes] = await Promise.all([
    toActivityDtos(ctx, registry, activityRows),
    toNoteDtos(ctx, noteRows),
  ]);
  const comments = await noteComments(
    ctx,
    notes.map((n) => n.id),
  );

  const items: TimelineEntry[] = [
    ...activities.map((a): TimelineEntry => ({
      kind: "activity",
      id: a.id,
      at: a.doneAt ?? a.createdAt,
      activity: a,
    })),
    ...notes.map((n): TimelineEntry => ({
      kind: "note",
      id: n.id,
      at: n.createdAt,
      note: n,
      comments: comments.get(n.id) ?? [],
    })),
  ];

  // změny, komentáře a soubory samotných záznamů (zakázka, firma, osoba); záznam, který aktér nesmí číst, se přeskočí
  const records = await Promise.all(
    sources(sets).map(async (s) => {
      try {
        const def = registry.get(s.type);
        return { s, data: await getRecordActivity(ctx, s.type, s.id, def) };
      } catch (e) {
        if (e instanceof NotFoundError || e instanceof PermissionError) return null;
        throw e;
      }
    }),
  );
  for (const rec of records) {
    if (!rec) continue;
    const { s, data } = rec;
    for (const t of data.timeline) {
      if (t.kind === "audit")
        items.push({
          kind: "audit",
          id: t.id,
          at: t.at,
          actor: t.actor,
          action: t.action,
          summary: t.summary,
          changes: t.changes,
          entityType: s.type,
          entityId: s.id,
        });
      else
        items.push({
          kind: "comment",
          id: t.id,
          at: t.at,
          actor: t.actor,
          actorId: t.actorId,
          body: t.body,
          edited: t.edited,
          entityType: s.type,
          entityId: s.id,
        });
    }
    for (const f of data.files)
      items.push({
        kind: "file",
        id: f.id,
        at: f.createdAt,
        name: f.name,
        mime: f.mime,
        size: f.size,
        fileId: f.fileId,
        hasThumb: f.hasThumb,
        entityType: s.type,
        entityId: s.id,
      });
  }

  items.sort((a, b) => b.at.localeCompare(a.at));
  const truncated = items.length > limit;
  const [jobs, companies, persons] = await Promise.all([
    visibleRecordTitles(ctx, registry, "job", sets.jobIds),
    visibleRecordTitles(ctx, registry, "company", sets.companyIds),
    visibleRecordTitles(ctx, registry, "person", sets.personIds),
  ]);
  return {
    items: items.slice(0, limit),
    labels: { job: jobs, company: companies, person: persons },
    truncated,
  };
}
