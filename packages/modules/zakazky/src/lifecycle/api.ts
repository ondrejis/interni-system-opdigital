/**
 * Veřejné rozhraní oblasti „lifecycle“ pro ostatní oblasti a moduly (serverový kód, funkce s `ctx`).
 * Ostatní se na oblast odkazují jen přes `lifecycleApi` z `@rebar/zakazky/server`, ne přes cesty do složky.
 *
 *  - `jobStages(db)`: stavy pipeline zakázek v pořadí (se fází); `stageById`, `firstStageOfPhase(db, phase)`.
 *  - `stageForTransition(db, to, stageId?)`: stav pro přechod do fáze (zadaný, jinak první stav fáze).
 *  - `previewTransitions(ctx, row)`: možné další fáze a nesplněné kontroly (`zakazky.phase.preview`).
 */
export {
  firstStageOfPhase,
  jobStages,
  previewTransitions,
  stageById,
  stageForTransition,
} from "./transitions";
export type { PhaseOption, StageInfo } from "./transitions";
