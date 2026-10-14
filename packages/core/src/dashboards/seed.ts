// Pomocník pro výchozí nástěnky v konfiguraci klienta: widgety bez id a rozměrů, typované. Čisté, bez databáze.

import type { DashboardDefinition, DashboardWidget, PeriodPreset } from "./types";
import { DEFINITION_VERSION } from "./types";

/** Výchozí rozměry widgetu podle typu (šířka ve sloupcích z 12, výška v řádcích). */
const SIZE: Record<DashboardWidget["type"], { w: number; h: number }> = {
  kpi: { w: 3, h: 1 },
  gauge: { w: 3, h: 1 },
  chart: { w: 6, h: 3 },
  table: { w: 6, h: 3 },
  list: { w: 6, h: 3 },
  status: { w: 6, h: 2 },
  builtin: { w: 12, h: 2 },
};

export type SeedWidget = Omit<DashboardWidget, "id" | "w" | "h"> & {
  id?: string;
  w?: number;
  h?: number;
};

/** Výchozí nástěnka v `clients/<klient>/config.ts` → `dashboards.defaults`. */
export type DashboardSeedInput = {
  /** Stálý klíč (malá písmena, číslice, pomlčky); podle něj se nástěnka zakládá jen jednou. */
  key: string;
  name: string;
  /** Klíč role, pro kterou je nástěnka výchozí (`owner`, `office`, `foreman`…). */
  role: string;
  /** Otevírá se na úvodní stránce místo klasického Přehledu. Výchozí ne. */
  home?: boolean;
  defaultPeriod?: PeriodPreset;
  widgets: readonly SeedWidget[];
};

export type DashboardSeed = {
  key: string;
  name: string;
  role: string;
  home?: boolean;
  definition: DashboardDefinition;
};

/** Doplní id a rozměry widgetů a složí definici ve verzi, kterou systém čte. */
export function seedDashboard(d: DashboardSeedInput): DashboardSeed {
  return {
    key: d.key,
    name: d.name,
    role: d.role,
    ...(d.home ? { home: true } : {}),
    definition: {
      schemaVersion: DEFINITION_VERSION,
      ...(d.defaultPeriod ? { defaultPeriod: d.defaultPeriod } : {}),
      widgets: d.widgets.map((w, i) => ({
        ...w,
        id: w.id ?? `${w.type}-${i + 1}`,
        w: w.w ?? SIZE[w.type].w,
        h: w.h ?? SIZE[w.type].h,
      })),
    },
  };
}
