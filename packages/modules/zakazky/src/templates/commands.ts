import { defineCommand } from "@rebar/core/module-server";
import { NotFoundError } from "@rebar/core/rbac";
import {
  templateArchiveInput,
  templateCreateInput,
  templateDuplicateInput,
  templateGetInput,
  templateListInput,
  templateSaveFromJobInput,
  templateSetDefaultInput,
  templateUpdateInput,
} from "../contract";
import { loadTemplate } from "../core/lookups";
import {
  archiveTemplateImpl,
  createTemplateImpl,
  duplicateTemplateImpl,
  saveTemplateFromJobImpl,
  setDefaultTemplateImpl,
  updateTemplateImpl,
} from "./crud";
import { listTemplateItemsImpl } from "./list";
import { templateView } from "./payload";

const READ = "zakazky.read";
const TEMPLATES = "zakazky.templates";

/** Příkazy šablon zakázek: čtení `zakazky.read`, správa `zakazky.templates`. */
export const commands = [
  defineCommand({
    name: "zakazky.template.list",
    permission: READ,
    input: templateListInput,
    handler: (ctx, i) => listTemplateItemsImpl(ctx, i),
  }),
  defineCommand({
    name: "zakazky.template.get",
    permission: READ,
    input: templateGetInput,
    handler: async (ctx, i) => {
      const t = await loadTemplate(ctx.db, i.id);
      if (!t) throw new NotFoundError("Šablona nenalezena.");
      return templateView(t);
    },
  }),
  defineCommand({
    name: "zakazky.template.create",
    permission: TEMPLATES,
    input: templateCreateInput,
    handler: (ctx, i) => createTemplateImpl(ctx, i),
  }),
  defineCommand({
    name: "zakazky.template.update",
    permission: TEMPLATES,
    input: templateUpdateInput,
    handler: (ctx, i) => updateTemplateImpl(ctx, i),
  }),
  defineCommand({
    name: "zakazky.template.duplicate",
    permission: TEMPLATES,
    input: templateDuplicateInput,
    handler: (ctx, i) => duplicateTemplateImpl(ctx, i),
  }),
  defineCommand({
    name: "zakazky.template.archive",
    permission: TEMPLATES,
    input: templateArchiveInput,
    handler: (ctx, i) => archiveTemplateImpl(ctx, i),
  }),
  defineCommand({
    name: "zakazky.template.setDefault",
    permission: TEMPLATES,
    input: templateSetDefaultInput,
    handler: (ctx, i) => setDefaultTemplateImpl(ctx, i),
  }),
  defineCommand({
    name: "zakazky.template.saveFromJob",
    permission: TEMPLATES,
    input: templateSaveFromJobInput,
    handler: (ctx, i, deps) => saveTemplateFromJobImpl(ctx, deps, i),
  }),
];
