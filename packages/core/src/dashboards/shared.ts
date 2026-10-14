// Vstup pro prohlížeč: jen typy, konstanty a čisté funkce (žádná databáze, žádný zod). Importuje se jako `@rebar/core/dashboards-shared`.
export * from "./types";
export {
  resolvePeriod,
  periodOf,
  comparisonRange,
  bucketStart,
  bucketsBetween,
  bucketLabel,
  defaultBucket,
  isoWeek,
  filtersFromSearch,
  filtersToSearch,
  DEFAULT_FILTERS,
  isBucket,
} from "./periods";
export { formatValue, formatCompact, deltaOf, COMPARE_LABELS } from "./format";
export { seedDashboard } from "./seed";
export type { DashboardSeedInput, DashboardSeed, SeedWidget } from "./seed";
