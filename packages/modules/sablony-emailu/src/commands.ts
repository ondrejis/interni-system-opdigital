import { z } from "zod";
import { defineCommand } from "@rebar/core/module-server";
import {
  logActivityInput,
  markUsedInput,
  pickInput,
  previewInput,
  renderInput,
  saveContentInput,
  templatesInput,
} from "./contract";
import {
  listTemplates,
  logActivity,
  markUsed,
  pickRecords,
  previewDraft,
  renderTemplate,
  saveContent,
  variables,
} from "./service";

/** Katalog proměnných šablon (příspěvky zapnutých modulů + výchozí) pro editor a nápovědu. */
export const variablesCommand = defineCommand({
  name: "sablony-emailu.variables",
  permission: "sablony-emailu.read",
  input: z.object({}),
  handler: async (_ctx, _i, deps) => variables(deps),
});

/** Šablony pro výběr v dialogu „E-mail ze šablony“ (nejpoužívanější první; SAB-01). */
export const templatesCommand = defineCommand({
  name: "sablony-emailu.templates",
  permission: "sablony-emailu.read",
  input: templatesInput,
  handler: (ctx, i, deps) => listTemplates(ctx, deps, i),
});

/**
 * E-mail ze šablony pro kontakt, organizaci, obchod nebo zakázku (SAB-03): vyplněný předmět a text, adresát a adresa
 * pro Gmail (`gmailUrl`; `null` + `tooLong` při překročení limitu délky, R-46). Nic se neodesílá (SAB-05).
 */
export const renderCommand = defineCommand({
  name: "sablony-emailu.render",
  permission: "sablony-emailu.read",
  input: renderInput,
  handler: (ctx, i, deps) => renderTemplate(ctx, deps, i),
});

/** Náhled rozepsané šablony s daty vybraných záznamů (editor, SAB-02). */
export const previewCommand = defineCommand({
  name: "sablony-emailu.preview",
  permission: "sablony-emailu.read",
  input: previewInput,
  handler: (ctx, i, deps) =>
    previewDraft(ctx, deps, { subject: i.subject, body: i.body, context: i.context }),
});

/** Hledání kontaktů, organizací, obchodů a zakázek, kterými se náhled vyplní. */
export const pickCommand = defineCommand({
  name: "sablony-emailu.pick",
  permission: "sablony-emailu.read",
  input: pickInput,
  handler: (ctx, i, deps) => pickRecords(ctx, deps, i),
});

/** Započítá použití šablony (otevření v Gmailu nebo kopie); vrací, zda jde nabídnout zápis aktivity (SAB-04). */
export const markUsedCommand = defineCommand({
  name: "sablony-emailu.markUsed",
  permission: "sablony-emailu.read",
  input: markUsedInput,
  handler: (ctx, i, deps) => markUsed(ctx, deps, i.templateId),
});

/** Zapíše e-mail jako hotovou aktivitu (typ e-mail) přes službu úkolů (SAB-04); oprávnění ověří služba. */
export const logActivityCommand = defineCommand({
  name: "sablony-emailu.logActivity",
  permission: "sablony-emailu.read",
  input: logActivityInput,
  handler: (ctx, i, deps) => logActivity(ctx, deps, i),
});

/** Uloží předmět a text šablony z editoru. */
export const saveContentCommand = defineCommand({
  name: "sablony-emailu.saveContent",
  permission: "sablony-emailu.write",
  input: saveContentInput,
  handler: (ctx, i, deps) => saveContent(ctx, deps, i),
});

/** Příkazy modulu „sablony-emailu“ (název `sablony-emailu.<akce>`; každý potřebuje probe v `tests/support/probes/sablony-emailu.ts`). */
export const commands = [
  variablesCommand,
  templatesCommand,
  renderCommand,
  previewCommand,
  pickCommand,
  markUsedCommand,
  logActivityCommand,
  saveContentCommand,
];
