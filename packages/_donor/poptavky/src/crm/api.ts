/**
 * Veřejné serverové rozhraní CRM (`crmApi` z `@rebar/poptavky/server`) pro ostatní oblasti a moduly. Funkce samy
 * oprávnění nekontrolují, pokud není uvedeno jinak; běží v transakci volajícího (přechody si ji otevírají samy).
 *
 *  - `recomputeJobCrm(ctx, jobId, now?)`: přepočítá `job.crm_*` z aktivit a historie stavů; volá ho každý, kdo mění aktivity
 *    nebo stav, jako poslední krok transakce (změny stavu, ceny, pravděpodobnosti a archivu přes entitu zakázky ho spouští hook)
 *  - `winDeal(ctx, jobId, deps)`, `loseDeal(ctx, jobId, { reasonKey, note? }, deps)`, `reopenDeal(ctx, jobId, deps)`:
 *    obaly nad změnou stavu zakázky přes entitu (stejná cesta jako `zakazky.transition`, takže platí hooky přechodů);
 *    `deps` stačí `{ registry }` z `ModuleDeps`
 *  - `archiveDeal(ctx, jobId)`, `unarchiveDeal(ctx, jobId)`
 *  - `stageHistory(ctx, jobId)`: historie stavů s dny ve stavu (pás fází)
 *  - `findContactDuplicates(ctx, { ico?, email?, phone? })`: existující firmy a osoby se stejným IČO, e-mailem nebo telefonem
 *  - `readFieldRules(db)`, `checkFieldRules(db, row, change)`: pravidla kvality polí (povinné od stavu)
 *  - `ensureCrmDefaults(db)`: idempotentní doplnění výchozích dat CRM
 *  - aktivity (oblast B): `createActivity(ctx, input, opts?)`, `updateActivity`, `completeActivity(ctx, id, { outcome?, next? })`,
 *    `snoozeActivity`, `reopenActivity`, `deleteActivity` (každá přepočte zakázku jako poslední krok), `listForDeal`,
 *    `listUpcoming`, `listMine`, `buildTimeline`, `createNote`; `activityIcsEvents(db, userId, host)` pro odběr kalendáře
 */
export { recomputeJobCrm, recomputeAllJobsCrm } from "./deals/recompute";
export type { JobCrmState } from "./deals/recompute";
export { winDeal, loseDeal, reopenDeal, archiveDeal, unarchiveDeal } from "./deals/transitions";
export type { DealDeps, DealResult, LoseInput } from "./deals/transitions";
export { stageHistory } from "./history";
export type { StageHistoryRow } from "./history";
export { findContactDuplicates } from "./deals/duplicates";
export type { CompanyMatch, ContactQuery, PersonMatch } from "./deals/duplicates";
export { readFieldRules, checkFieldRules, fieldRulesSetting } from "./field-rules";
export type { FieldRule } from "./field-rules";
export { ensureCrmDefaults, DEFAULT_ACTIVITY_TYPES } from "./seed";
export type { CrmEnsureReport } from "./seed";
export { firstActivityInput } from "./deals/first-activity";
export type { FirstActivityInput } from "./deals/first-activity";
export {
  createActivity,
  updateActivity,
  completeActivity,
  snoozeActivity,
  reopenActivity,
  deleteActivity,
  suggestionFor,
} from "./activities/service";
export type { CreateActivityInput, ActivityRow } from "./activities/service";
export { listForDeal, listUpcoming, listMine } from "./activities/queries";
export { buildTimeline } from "./activities/timeline";
export { createNote } from "./activities/notes";
export { activityIcsEvents } from "./activities/calendar";
export { sendActivityDigests, notifyDealsWithoutActivity, refreshRotting } from "./activities/jobs";
