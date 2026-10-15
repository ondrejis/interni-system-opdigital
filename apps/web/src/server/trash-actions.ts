"use server";

import { resolveEntity } from "@rebar/core/entities";
import { NotFoundError } from "@rebar/core/rbac";
import { listTrash, purgeRecord } from "@rebar/core/trash";
import { restoreRecord } from "@rebar/core/entities";
import { z } from "zod";
import { defineAction } from "./request";
import { getServices } from "./services";

/** Server actions koše (`/kos`): výpis smazaných záznamů, obnova s potomky a trvalé smazání. */
const key = z.string().min(1).max(40);
const id = z.uuid();

export const listTrashAction = defineAction({
  permission: "trash.read",
  input: z.object({
    entity: key.optional(),
    q: z.string().max(100).optional(),
    offset: z.number().int().min(0).max(100_000).optional(),
  }),
  handler: async (ctx, i) => {
    const r = await listTrash(ctx, getServices().registry, {
      ...(i.entity ? { entity: i.entity } : {}),
      ...(i.q ? { q: i.q } : {}),
      offset: i.offset ?? 0,
      limit: 50,
    });
    return {
      ...r,
      types: getServices()
        .registry.all()
        .map((d) => ({ value: d.key, label: d.label.many })),
    };
  },
});

export const restoreTrashAction = defineAction({
  permission: "trash.read",
  input: z.object({ entity: key, id }),
  handler: async (ctx, i) => {
    const def = getServices().registry.get(i.entity);
    if (!def) throw new NotFoundError("Neznámý typ záznamu.");
    await restoreRecord(ctx, await resolveEntity(ctx.db, def), i.id);
  },
});

export const purgeTrashAction = defineAction({
  permission: "trash.purge",
  input: z.object({ entity: key, id }),
  handler: (ctx, i) => purgeRecord(ctx, getServices().registry, i.entity, i.id),
});
