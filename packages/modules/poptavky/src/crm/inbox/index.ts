import { defineModuleServer } from "@rebar/core/module-server";
import { contactCommands } from "./contacts";
import { importCommand } from "./import";
import { ensureJobTypeField, quickAddCommand } from "./quick-add";

export { quickAddCommand, quickAddInput, ensureJobTypeField, JOB_TYPE_FIELD } from "./quick-add";
export type { QuickAddInput, QuickAddResult } from "./quick-add";
export { importCommand, importInput, cleanRow } from "./import";
export type { ImportResult, ImportRowResult } from "./import";
export * from "./contacts";

/**
 * Serverová část oblasti CRM „inbox“ (Poptávky a kontakty, viz docs/CRM.md → Oblast F): rychlé zadání poptávky
 * (`crm.deal.quickAdd`), import poptávek z CSV, přehled obchodu firmy a osoby, účastníci zakázky, volby pro dialogy.
 * Kvalifikace poptávky zůstává v `poptavky.convert`, sloučení duplicit a ARES jsou v modulu Kontakty (`kontakty.*`).
 */
export const area = defineModuleServer({
  commands: [quickAddCommand, importCommand, ...contactCommands],
  ensure: [ensureJobTypeField],
});
