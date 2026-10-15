"use server";

import { lookupUsers } from "@rebar/core/admin";
import {
  listNotifications,
  markAllRead,
  markRead,
  unreadCount,
  addComment,
  deleteComment,
} from "@rebar/core/collab";
import { detachAttachment } from "@rebar/core/files";
import {
  createRecord,
  deleteRecord,
  describeEntity,
  getRecord,
  getRecordActivity,
  queryGroups,
  queryInput,
  queryRecords,
  resolveEntity,
  restoreRecord,
  searchAll,
  setVisibility,
  updateRecord,
} from "@rebar/core/entities";
import { NotFoundError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import {
  createView,
  deleteView,
  listViews,
  setFavorite,
  updateView,
  viewConfigSchema,
} from "@rebar/core/views";
import { z } from "zod";
import { defineAction } from "./request";
import { getServices } from "./services";

/*
  Server actions pro tabulky, detaily, pohledy, hledání a upozornění. Všechny jdou přes `defineAction`
  (kontext, validace, převod chyb); oprávnění k záznamům hlídá datová vrstva, ne tyto funkce.
*/

const key = z.string().min(1).max(40);
const id = z.uuid();

async function entityOf(ctx: Ctx, entity: string) {
  const def = getServices().registry.get(entity);
  if (!def) throw new NotFoundError("Neznámý typ záznamu.");
  return resolveEntity(ctx.db, def);
}

export const describeEntityAction = defineAction({
  input: z.object({ entity: key }),
  handler: async (ctx, { entity }) =>
    describeEntity(ctx, ctx.db, await entityOf(ctx, entity), getServices().registry),
});

export const queryEntity = defineAction({
  input: z.object({ entity: key, query: queryInput }),
  handler: async (ctx, i) =>
    queryRecords(ctx, getServices().registry, await entityOf(ctx, i.entity), i.query),
});

export const queryEntityGroups = defineAction({
  input: z.object({ entity: key, group: z.string().max(80), query: queryInput }),
  handler: async (ctx, i) => queryGroups(ctx, await entityOf(ctx, i.entity), i.group, i.query),
});

export const getEntityRecord = defineAction({
  input: z.object({ entity: key, id }),
  handler: async (ctx, i) =>
    getRecord(ctx, getServices().registry, await entityOf(ctx, i.entity), i.id),
});

export const createEntityRecord = defineAction({
  input: z.object({ entity: key, values: z.record(z.string(), z.unknown()) }),
  handler: async (ctx, i) =>
    createRecord(ctx, getServices().registry, await entityOf(ctx, i.entity), i.values),
});

export const updateEntityRecord = defineAction({
  input: z.object({
    entity: key,
    id,
    patch: z.record(z.string(), z.unknown()),
    expectedUpdatedAt: z.string().optional(),
  }),
  handler: async (ctx, i) =>
    updateRecord(
      ctx,
      getServices().registry,
      await entityOf(ctx, i.entity),
      i.id,
      i.patch,
      i.expectedUpdatedAt ? { expectedUpdatedAt: i.expectedUpdatedAt } : {},
    ),
});

export const deleteEntityRecords = defineAction({
  input: z.object({ entity: key, ids: z.array(id).min(1).max(200) }),
  handler: async (ctx, i) => {
    const e = await entityOf(ctx, i.entity);
    for (const rid of i.ids) await deleteRecord(ctx, e, rid);
    return { deleted: i.ids.length };
  },
});

export const restoreEntityRecords = defineAction({
  input: z.object({ entity: key, ids: z.array(id).min(1).max(200) }),
  handler: async (ctx, i) => {
    const e = await entityOf(ctx, i.entity);
    for (const rid of i.ids) await restoreRecord(ctx, e, rid);
    return { restored: i.ids.length };
  },
});

/** Zamkne (soukromé) nebo zveřejní záznamy; jen vlastník. Zamčení zamkne i děti (zakázka → úkoly, platby…). */
export const setEntityVisibility = defineAction({
  input: z.object({ entity: key, ids: z.array(id).min(1).max(200), isPrivate: z.boolean() }),
  handler: async (ctx, i) => {
    let changed = 0;
    for (const rid of i.ids) {
      const r = await setVisibility(ctx, getServices().registry, i.entity, rid, i.isPrivate);
      if (r.changed) changed += 1 + r.cascaded;
    }
    return { changed };
  },
});

/** Hodnoty pro výběr odkazovaného záznamu (firma u zakázky…): hledání v názvech. */
export const lookupRecords = defineAction({
  input: z.object({ entity: key, q: z.string().max(100) }),
  handler: async (ctx, i) => {
    const e = await entityOf(ctx, i.entity);
    const page = await queryRecords(ctx, getServices().registry, e, {
      q: i.q,
      limit: 20,
      sort: [{ attr: e.def.titleKey, dir: "asc" }],
    });
    return page.rows.map((r) => ({ value: r.id, label: String(r[e.def.titleKey] ?? "") }));
  },
});

export const lookupUsersAction = defineAction({
  input: z.object({ q: z.string().max(100) }),
  handler: async (ctx, { q }) =>
    (await lookupUsers(ctx, q)).map((u) => ({ value: u.id, label: u.name })),
});

export const searchEntities = defineAction({
  input: z.object({ q: z.string().max(100) }),
  handler: async (ctx, { q }) => searchAll(ctx, getServices().registry.all(), q),
});

/* ---------- pohledy ---------- */

export const listEntityViews = defineAction({
  input: z.object({ entity: key }),
  handler: async (ctx, { entity }) => listViews(ctx, (await entityOf(ctx, entity)).def),
});

const knownAttrs = (e: Awaited<ReturnType<typeof entityOf>>) =>
  new Set(e.attributes.map((a) => a.key));

export const saveEntityView = defineAction({
  input: z.object({
    entity: key,
    name: z.string().max(60),
    shared: z.boolean(),
    config: viewConfigSchema,
  }),
  handler: async (ctx, i) => {
    const e = await entityOf(ctx, i.entity);
    const v = await createView(ctx, e.def, knownAttrs(e), {
      name: i.name,
      shared: i.shared,
      config: i.config,
    });
    return { id: v.id };
  },
});

export const updateEntityView = defineAction({
  input: z.object({
    entity: key,
    id,
    name: z.string().max(60).optional(),
    shared: z.boolean().optional(),
    config: viewConfigSchema.optional(),
  }),
  handler: async (ctx, i) => {
    const e = await entityOf(ctx, i.entity);
    await updateView(ctx, i.id, knownAttrs(e), {
      ...(i.name ? { name: i.name } : {}),
      ...(i.shared === undefined ? {} : { shared: i.shared }),
      ...(i.config ? { config: i.config } : {}),
    });
  },
});

export const deleteEntityView = defineAction({
  input: z.object({ id }),
  handler: async (ctx, i) => deleteView(ctx, i.id),
});

export const toggleViewFavorite = defineAction({
  input: z.object({ id, favorite: z.boolean() }),
  handler: async (ctx, i) => setFavorite(ctx, i.id, i.favorite),
});

/* ---------- aktivita záznamu ---------- */

export const getActivity = defineAction({
  input: z.object({ entity: key, id }),
  handler: async (ctx, i) =>
    getRecordActivity(ctx, i.entity, i.id, getServices().registry.get(i.entity)),
});

export const addCommentAction = defineAction({
  input: z.object({ entity: key, id, body: z.string().max(5000) }),
  handler: async (ctx, i) => {
    const c = await addComment(ctx, { entityType: i.entity, entityId: i.id, body: i.body });
    return { id: c.id };
  },
});

export const deleteCommentAction = defineAction({
  input: z.object({ id }),
  handler: async (ctx, i) => deleteComment(ctx, i.id),
});

export const detachAttachmentAction = defineAction({
  input: z.object({ id }),
  handler: async (ctx, i) => detachAttachment(ctx, i.id),
});

/* ---------- inbox ---------- */

export const getInbox = defineAction({
  input: z.object({ unreadOnly: z.boolean().optional() }),
  handler: async (ctx, i) => {
    const rows = await listNotifications(ctx, {
      ...(i.unreadOnly ? { unreadOnly: true } : {}),
      limit: 100,
    });
    return rows.map((n) => ({
      id: n.id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      url: n.url,
      /** Značka push upozornění v zařízení (po přečtení se zavře). */
      tag: n.collapseKey ?? `n:${n.id}`,
      urgent: n.severity === "urgent",
      count: n.count,
      read: !!n.readAt,
      createdAt: n.createdAt.toISOString(),
    }));
  },
});

export const markNotificationsRead = defineAction({
  input: z.object({ ids: z.array(id).max(200).optional() }),
  handler: async (ctx, i) => (i.ids ? markRead(ctx, i.ids) : markAllRead(ctx)),
});

export const getUnreadCount = defineAction({
  input: z.object({}),
  handler: async (ctx) => unreadCount(ctx),
});
