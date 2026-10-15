"use server";

import { createTag, deleteTag, listTags, updateTag } from "@rebar/core/tags";
import { z } from "zod";
import { defineAction } from "./request";
import { getServices } from "./services";

/** Server actions štítků (Nastavení → Štítky). Oprávnění `settings.tags` kontroluje služba v jádru. */
const id = z.uuid();
const PERM = "settings.tags";
const scopes = z.array(z.string().max(40)).max(40);

export const listTagsAction = defineAction({
  permission: PERM,
  input: z.object({}),
  handler: (ctx) => listTags(ctx, getServices().registry),
});

export const createTagAction = defineAction({
  permission: PERM,
  input: z.object({ label: z.string().max(60), color: z.string().max(20).nullish(), scopes }),
  handler: async (ctx, i) => ({ id: (await createTag(ctx, i)).id }),
});

export const updateTagAction = defineAction({
  permission: PERM,
  input: z.object({
    id,
    label: z.string().max(60).optional(),
    color: z.string().max(20).nullable().optional(),
    scopes: scopes.optional(),
    active: z.boolean().optional(),
  }),
  handler: (ctx, { id: tagId, ...patch }) =>
    updateTag(ctx, tagId, {
      ...(patch.label !== undefined ? { label: patch.label } : {}),
      ...(patch.color !== undefined ? { color: patch.color } : {}),
      ...(patch.scopes !== undefined ? { scopes: patch.scopes } : {}),
      ...(patch.active !== undefined ? { active: patch.active } : {}),
    }),
});

export const deleteTagAction = defineAction({
  permission: PERM,
  input: z.object({ id }),
  handler: (ctx, i) => deleteTag(ctx, getServices().registry, i.id),
});
