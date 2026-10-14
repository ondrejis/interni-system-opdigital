"use server";

import {
  deleteRunFile,
  deleteSchedule,
  deleteTemplate,
  exportSetting,
  listRuns,
  listSchedules,
  listTemplates,
  saveSchedule,
  saveTemplate,
  setScheduleActive,
  unsubscribeFromSchedule,
  type ScheduleInput,
  type TemplateInput,
} from "@rebar/core/export";
import { scopeOf, UserError } from "@rebar/core/rbac";
import { z } from "zod";
import { exportsEnabled } from "./dashboards";
import { defineAction } from "./request";
import { getServices } from "./services";

/*
  Server actions exportů: Moje exporty, šablony, plány a nastavení. Oprávnění (exports.schedule, exports.manage,
  oprávnění k datům) hlídá jádro; export samotný jde přes `/api/export/<entita>` (stream).
*/

const id = z.uuid();

function enabled() {
  if (!exportsEnabled()) throw new UserError("Exporty jsou v tomto systému vypnuté.");
}

export const listMyExportsAction = defineAction({
  input: z.object({ all: z.boolean().optional() }),
  handler: async (ctx, i) => {
    enabled();
    return listRuns(ctx, { all: !!i.all });
  },
});

export const deleteExportFileAction = defineAction({
  input: z.object({ id }),
  handler: async (ctx, i) => deleteRunFile(ctx, getServices().exportRuntime, i.id),
});

export const listExportTemplatesAction = defineAction({
  input: z.object({ entity: z.string().max(40).optional() }),
  handler: async (ctx, i) => {
    enabled();
    return listTemplates(ctx, getServices().exportRuntime, i.entity ? { entity: i.entity } : {});
  },
});

export const saveExportTemplateAction = defineAction({
  input: z.object({
    id: id.optional(),
    name: z.string().max(80),
    shared: z.boolean().optional(),
    spec: z.unknown(),
  }),
  handler: async (ctx, i) => {
    enabled();
    return saveTemplate(ctx, getServices().exportRuntime, {
      ...(i.id ? { id: i.id } : {}),
      name: i.name,
      shared: !!i.shared,
      spec: i.spec as TemplateInput["spec"],
    });
  },
});

export const deleteExportTemplateAction = defineAction({
  input: z.object({ id }),
  handler: async (ctx, i) => deleteTemplate(ctx, i.id),
});

export const listExportSchedulesAction = defineAction({
  input: z.object({}),
  handler: async (ctx) => {
    enabled();
    return listSchedules(ctx, getServices().exportRuntime);
  },
});

export const saveExportScheduleAction = defineAction({
  input: z.object({ schedule: z.unknown() }),
  handler: async (ctx, i) => {
    enabled();
    return saveSchedule(ctx, getServices().exportRuntime, i.schedule as ScheduleInput);
  },
});

export const setExportScheduleActiveAction = defineAction({
  input: z.object({ id, active: z.boolean() }),
  handler: async (ctx, i) => setScheduleActive(ctx, i.id, i.active),
});

export const deleteExportScheduleAction = defineAction({
  input: z.object({ id }),
  handler: async (ctx, i) => deleteSchedule(ctx, i.id),
});

export const unsubscribeExportScheduleAction = defineAction({
  input: z.object({ id }),
  handler: async (ctx, i) => unsubscribeFromSchedule(ctx, i.id),
});

/** Nastavení exportů v administraci (oddělovač CSV). */
export const saveExportSettingsAction = defineAction({
  input: z.object({ csvDelimiter: z.enum([";", ","]).nullable() }),
  permission: "settings.manage",
  handler: async (ctx, i) => {
    await getServices().settings.set(ctx, exportSetting, { csvDelimiter: i.csvDelimiter });
  },
});

/** Načtení nastavení exportů pro administraci: uložená volba a výchozí hodnota z konfigurace klienta. */
export const getExportSettingsAction = defineAction({
  input: z.object({}),
  permission: "settings.manage",
  handler: async (ctx) => {
    const { settings, runtime } = getServices();
    const s = await settings.get(ctx.db, exportSetting);
    return {
      csvDelimiter: s.csvDelimiter,
      configDefault: runtime.config.exports.csvDelimiter,
    };
  },
});

/** Typy záznamů, které aktér smí exportovat (výběr „Typ dat“ v plánech); jen entity zapnutých modulů. */
export const listExportEntitiesAction = defineAction({
  input: z.object({}),
  handler: async (ctx) => {
    enabled();
    return getServices()
      .registry.all()
      .filter((d) => scopeOf(ctx, d.permissions.export ?? d.permissions.read) !== null)
      .map((d) => ({ key: d.key, label: d.label.many, module: d.module }));
  },
});
