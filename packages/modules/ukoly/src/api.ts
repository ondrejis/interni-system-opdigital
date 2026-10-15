/*
  Veřejné funkce modulu „ukoly“ pro jiné moduly (`@rebar/ukoly/api`; smí je importovat jen modul, který má „ukoly“
  v `dependsOn`). Služby (`createFromTemplate`, `logDoneActivity`, `createMeeting`…) se neimportují, berou se přes
  `deps.services.optional("tasks")` (D §2.3). Tady jsou jen čisté, bezstavové pomůcky a kontrakt:
  rozbor rychlého zadání, výpočty termínů a konstanty typů a stavů.
*/
export { parseQuickTask } from "./tasks/logic/quick-parse";
export type { QuickTaskParse, QuickTaskToken, QuickTaskType } from "./tasks/logic/quick-parse";
export {
  dueState,
  formatDue,
  formatDuration,
  isOverdue,
  normalizeTime,
  suggestNextDue,
  taskEnd,
} from "./tasks/logic/due";
export type { DueState } from "./tasks/logic/due";
export * from "./tasks/constants";
