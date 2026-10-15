/*
  Veřejné funkce modulu „hodiny“ pro jiné moduly (`@rebar/hodiny/api`; smí je importovat jen modul, který má „hodiny“
  v `dependsOn`): čisté pomůcky pro zápis a zobrazení času, výpočet odpracováno vs. odhad a efektivní sazby.
*/
export {
  parseDuration,
  parseCellDuration,
  formatDuration,
  MAX_DAY_MINUTES,
} from "./logic/parse-time";
export type { ParsedDuration, DurationFormat } from "./logic/parse-time";
export { computeJobEffort, hourlyRate } from "./logic/effort";
export type { JobEffort, JobEffortInput, UserEffort } from "./logic/effort";
