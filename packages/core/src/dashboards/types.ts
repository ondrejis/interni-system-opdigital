// Čisté typy a konstanty nástěnek bez závislosti na databázi: importuje je i prohlížeč (`@rebar/core/dashboards-shared`).

import type { FilterGroup } from "../entities/operators";

export const DEFINITION_VERSION = 1;

export const WIDGET_TYPES = [
  "kpi",
  "chart",
  "table",
  "list",
  "status",
  "gauge",
  "builtin",
] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

export const CHART_KINDS = ["bar", "stacked", "line", "timeseries", "pie", "donut"] as const;
export type ChartKind = (typeof CHART_KINDS)[number];

export const AGG_FUNCTIONS = ["count", "sum", "avg", "min", "max"] as const;
export type AggFn = (typeof AGG_FUNCTIONS)[number];

export const BUCKETS = ["day", "week", "month", "quarter", "year"] as const;
export type Bucket = (typeof BUCKETS)[number];

/** Jak se hodnota ukazuje: peníze jsou v haléřích, `minutes` v minutách (7:30 h), `hours` v desetinných hodinách. */
export const VALUE_FORMATS = ["number", "money", "percent", "hours", "minutes"] as const;
export type ValueFormat = (typeof VALUE_FORMATS)[number];

export const PERIOD_PRESETS = [
  "all",
  "today",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "this_quarter",
  "last_quarter",
  "this_year",
  "last_year",
  "last_7_days",
  "last_30_days",
  "last_90_days",
  "custom",
] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  all: "Celé období",
  today: "Dnes",
  this_week: "Tento týden",
  last_week: "Minulý týden",
  this_month: "Tento měsíc",
  last_month: "Minulý měsíc",
  this_quarter: "Toto čtvrtletí",
  last_quarter: "Minulé čtvrtletí",
  this_year: "Letos",
  last_year: "Loni",
  last_7_days: "Posledních 7 dní",
  last_30_days: "Posledních 30 dní",
  last_90_days: "Posledních 90 dní",
  custom: "Vlastní období",
};

export const COMPARE_MODES = ["none", "previous_period", "previous_year"] as const;
export type CompareMode = (typeof COMPARE_MODES)[number];

/** Zdroj dat z entity: filtr → agregace → seskupení (hodnota nebo období) → řazení a limit. Žádné ruční SQL. */
export type EntitySource = {
  kind: "entity";
  entity: string;
  filters?: FilterGroup | undefined;
  /** Datumový atribut, podle kterého se filtruje období nástěnky. */
  dateAttr?: string | undefined;
  /** Atribut s odkazem na zakázku / na uživatele, který se omezí filtrem nástěnky. */
  jobAttr?: string | undefined;
  personAttr?: string | undefined;
  agg: { fn: AggFn; attr?: string | undefined };
  groupBy?: { attr: string; bucket?: Bucket | undefined } | undefined;
  /** Druhé seskupení pro skládaný graf (jen hodnotové atributy). */
  splitBy?: string | undefined;
  sort?: { by: "value" | "label"; dir: "asc" | "desc" } | undefined;
  limit?: number | undefined;
};

/** Seznam záznamů (top N, nejbližší termíny): sloupce a řazení jako v seznamu entity. */
export type RecordsSource = {
  kind: "records";
  entity: string;
  filters?: FilterGroup | undefined;
  dateAttr?: string | undefined;
  jobAttr?: string | undefined;
  personAttr?: string | undefined;
  columns: string[];
  sort?: { attr: string; dir: "asc" | "desc" }[] | undefined;
  limit?: number | undefined;
};

/** Pojmenovaná metrika, kterou dodává modul (`dashboardMetrics`). */
export type MetricSource = {
  kind: "metric";
  metric: string;
  params?: Record<string, string | number | boolean> | undefined;
  bucket?: Bucket | undefined;
  limit?: number | undefined;
};

export const BUILTINS = ["attention", "tiles", "my_tasks"] as const;
export type BuiltinKind = (typeof BUILTINS)[number];
export type BuiltinSource = { kind: "builtin"; builtin: BuiltinKind };

export type WidgetSource = EntitySource | RecordsSource | MetricSource | BuiltinSource;

export type WidgetOptions = {
  chart?: ChartKind | undefined;
  format?: ValueFormat | undefined;
  compare?: CompareMode | undefined;
  /** Cíl měřidla ve stejných jednotkách jako hodnota (peníze v haléřích). */
  target?: number | undefined;
};

/** Mřížka má 12 sloupců; `w` je šířka ve sloupcích, `h` výška v řádcích (po 96 px). Pořadí widgetů je pořadí v poli. */
export type DashboardWidget = {
  id: string;
  type: WidgetType;
  title: string;
  w: number;
  h: number;
  source: WidgetSource;
  options?: WidgetOptions | undefined;
};

export const WIDGET_WIDTHS = [3, 4, 6, 8, 12] as const;
export const MAX_WIDGET_HEIGHT = 6;

export type DashboardDefinition = {
  schemaVersion: number;
  widgets: DashboardWidget[];
  /** Výchozí období při otevření nástěnky. */
  defaultPeriod?: PeriodPreset | undefined;
};

/** Filtry nahoře na nástěnce: propisují se do widgetů a do URL. */
export type DashboardFilters = {
  period: PeriodPreset;
  from?: string | undefined;
  to?: string | undefined;
  jobId?: string | undefined;
  userId?: string | undefined;
};

export type DateRange = { from: string; to: string };

/* ---------- výsledky widgetů ---------- */

export type ChartCategory = {
  key: string;
  label: string;
  href?: string | undefined;
  color?: string | undefined;
};
export type ChartSeriesData = { key: string; label: string; values: (number | null)[] };

export type WidgetMeta = {
  /** Použité období (po dosazení filtru nástěnky); `null` = bez omezení. */
  period: DateRange | null;
  /** Výsledek byl oříznut limitem (víc skupin / řádků, než se ukazuje). */
  truncated?: boolean | undefined;
  generatedAt: string;
};

export type TableColumn = {
  key: string;
  label: string;
  type: "text" | "money" | "number" | "percent" | "date" | "minutes" | "hours" | "status";
};

export type WidgetResult = (
  | {
      kind: "kpi";
      format: ValueFormat;
      value: number | null;
      /** Text místo čísla (nejmenší / největší datum). */
      text?: string | undefined;
      previous?: number | null | undefined;
      /** Absolutní a procentuální změna proti předchozímu období; `pct` je `null` při nulovém základu. */
      delta?: { abs: number; pct: number | null } | undefined;
      compare?: CompareMode | undefined;
      hint?: string | undefined;
    }
  | {
      kind: "gauge";
      format: ValueFormat;
      value: number | null;
      target: number;
      /** 0–∞ v procentech cíle (nad 100 je překročeno). */
      pct: number | null;
    }
  | {
      kind: "chart";
      chart: ChartKind;
      format: ValueFormat;
      categories: ChartCategory[];
      series: ChartSeriesData[];
    }
  | {
      kind: "table";
      columns: TableColumn[];
      rows: { id: string; href?: string | undefined; cells: Record<string, unknown> }[];
      format?: ValueFormat | undefined;
    }
  | {
      kind: "list";
      items: {
        id: string;
        title: string;
        subtitle?: string | undefined;
        badge?: string | undefined;
        tone?: "default" | "warning" | "danger" | "success" | undefined;
        href?: string | undefined;
        date?: string | undefined;
      }[];
    }
  | {
      kind: "status";
      format: ValueFormat;
      stages: {
        id: string;
        name: string;
        color: string;
        count: number;
        value: number | null;
        href?: string | undefined;
      }[];
    }
  | {
      kind: "attention";
      items: {
        id: string;
        severity: "info" | "warning" | "danger";
        title: string;
        detail?: string | undefined;
        href: string;
      }[];
    }
  | {
      kind: "tiles";
      tiles: {
        id: string;
        title: string;
        value: string;
        hint?: string | undefined;
        href?: string | undefined;
        tone?: "default" | "warning" | "danger" | "success" | undefined;
      }[];
    }
  | { kind: "empty"; message: string }
) & { meta: WidgetMeta };

/** Výsledek jednoho widgetu při načtení: chyba jednoho widgetu nerozbije nástěnku. */
export type WidgetOutcome =
  { ok: true; result: WidgetResult } | { ok: false; error: string; code: string };

/* ---------- popis pro editor ---------- */

export type MetricInfo = {
  key: string;
  label: string;
  description?: string | undefined;
  format: ValueFormat;
  shape: "scalar" | "series";
  supports: { period: boolean; job: boolean; person: boolean; bucket: boolean };
  params: {
    key: string;
    label: string;
    type: "select" | "number" | "boolean";
    choices?: { value: string; label: string }[] | undefined;
    default?: string | number | boolean | undefined;
  }[];
};

export type DashboardKind = "personal" | "shared" | "role_default";

export type DashboardSummary = {
  id: string;
  name: string;
  /** Moje nástěnka / sdílená se mnou / výchozí pro mou roli. */
  kind: DashboardKind;
  mine: boolean;
  /** Smím ji upravovat (autor nebo správce). */
  canEdit: boolean;
  ownerName: string | null;
  defaultForRole: string | null;
  isHome: boolean;
  shared: { roles: string[]; users: string[] };
  widgetCount: number;
  position: number;
  updatedAt: string;
};
