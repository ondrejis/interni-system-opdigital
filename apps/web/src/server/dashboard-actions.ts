"use server";

import {
  availablePresets,
  cloneBoard,
  createBoard,
  deleteBoard,
  getBoard,
  listAllBoards,
  listBoards,
  listViewChoices,
  reorderBoards,
  setRoleDefault,
  shareBoard,
  sourceCatalog,
  updateBoard,
} from "@rebar/core/dashboards";
import { schema } from "@rebar/core/db";
import { UserError } from "@rebar/core/rbac";
import { inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { dashboardsEnabled, getDashboardEnv, runModuleCommand } from "./dashboards";
import { defineAction } from "./request";

/*
  Server actions nástěnek. Oprávnění (dashboards.write, dashboards.manage) a viditelnost nástěnek hlídá datová vrstva
  jádra (`@rebar/core/dashboards`); akce jen zapínají/vypínají funkci podle konfigurace klienta. Widgety se
  vyhodnocují v route handleru `/api/dashboards/evaluate` (server actions z jedné stránky běží po jedné, widgety mají
  běžet souběžně).
*/

const id = z.uuid();

function enabled() {
  if (!dashboardsEnabled()) throw new UserError("Vlastní nástěnky jsou v tomto systému vypnuté.");
}

export const listDashboardsAction = defineAction({
  input: z.object({}),
  handler: async (ctx) => {
    enabled();
    return listBoards(ctx);
  },
});

export const getDashboardAction = defineAction({
  input: z.object({ id }),
  handler: async (ctx, i) => {
    enabled();
    return getBoard(ctx, i.id);
  },
});

export const createDashboardAction = defineAction({
  input: z.object({ name: z.string().max(80), definition: z.unknown().optional() }),
  handler: async (ctx, i) => {
    enabled();
    return createBoard(ctx, { name: i.name, definition: i.definition });
  },
});

export const updateDashboardAction = defineAction({
  input: z.object({
    id,
    name: z.string().max(80).optional(),
    definition: z.unknown().optional(),
    expectedUpdatedAt: z.string().optional(),
  }),
  handler: async (ctx, i) => {
    enabled();
    return updateBoard(ctx, i.id, {
      ...(i.name !== undefined ? { name: i.name } : {}),
      ...(i.definition !== undefined ? { definition: i.definition } : {}),
      ...(i.expectedUpdatedAt ? { expectedUpdatedAt: i.expectedUpdatedAt } : {}),
    });
  },
});

export const deleteDashboardAction = defineAction({
  input: z.object({ id }),
  handler: async (ctx, i) => deleteBoard(ctx, i.id),
});

export const cloneDashboardAction = defineAction({
  input: z.object({ id, name: z.string().max(80).optional() }),
  handler: async (ctx, i) => {
    enabled();
    return cloneBoard(ctx, i.id, i.name);
  },
});

export const shareDashboardAction = defineAction({
  input: z.object({ id, roles: z.array(z.string().max(60)).max(50), users: z.array(id).max(100) }),
  handler: async (ctx, i) => shareBoard(ctx, i.id, { roles: i.roles, users: i.users }),
});

export const setRoleDefaultAction = defineAction({
  input: z.object({ id, roleKey: z.string().max(60).nullable(), home: z.boolean().optional() }),
  permission: "dashboards.manage",
  handler: async (ctx, i) =>
    setRoleDefault(ctx, i.id, {
      roleKey: i.roleKey,
      ...(i.home !== undefined ? { home: i.home } : {}),
    }),
});

export const reorderDashboardsAction = defineAction({
  input: z.object({ ids: z.array(id).max(200) }),
  handler: async (ctx, i) => reorderBoards(ctx, i.ids),
});

export const listAllDashboardsAction = defineAction({
  input: z.object({}),
  permission: "dashboards.manage",
  handler: async (ctx) => listAllBoards(ctx),
});

/** Entity a metriky, ze kterých smí aktér skládat widgety (jen to, na co má oprávnění), a role pro sdílení. */
export const dashboardCatalogAction = defineAction({
  input: z.object({}),
  handler: async (ctx) => {
    enabled();
    const roles = await ctx.db
      .select({ key: schema.role.key, name: schema.role.name })
      .from(schema.role)
      .where(isNull(schema.role.deletedAt));
    const env = getDashboardEnv();
    return {
      ...sourceCatalog(ctx, env),
      roles,
      presets: availablePresets(ctx, env),
      views: await listViewChoices(ctx, env),
    };
  },
});

/**
 * Odškrtnutí úkolu přímo ve widgetu „Úkoly na dnes“: příkaz `ukoly.complete` (oprávnění `ukoly.write`, viditelnost
 * a pravidla úkolu hlídá modul). Bez zapnutého modulu úkolů akce skončí větou.
 */
export const completeDashboardTaskAction = defineAction({
  input: z.object({ id }),
  handler: async (ctx, i) => {
    await runModuleCommand(ctx, "ukoly.complete", { id: i.id });
    return { ok: true as const };
  },
});

/** Jména uživatelů, se kterými je nástěnka sdílená (Nastavení → Nástěnky ukazuje jména místo identifikátorů). */
export const dashboardUserNamesAction = defineAction({
  input: z.object({ ids: z.array(id).max(300) }),
  permission: "dashboards.manage",
  handler: async (ctx, i) =>
    i.ids.length
      ? ctx.db
          .select({ id: schema.user.id, name: schema.user.name })
          .from(schema.user)
          .where(inArray(schema.user.id, i.ids))
      : [],
});
