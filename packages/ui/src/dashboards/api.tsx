"use client";

import type {
  DashboardDefinition,
  DashboardFilters,
  DashboardSummary,
  DashboardWidget,
  MetricInfo,
  ViewChoice,
  WidgetOutcome,
  WidgetPresetInfo,
} from "@rebar/core/dashboards-shared";
import { createContext, useContext, type ReactNode } from "react";

/** Zdroje, ze kterých smí uživatel skládat widgety (entity, metriky) a role pro sdílení. */
export type SourceCatalog = {
  entities: { key: string; label: string; module: string }[];
  metrics: MetricInfo[];
  roles: { key: string; name: string }[];
  /** Hotové widgety, které aktér smí přidat (jen zapnuté moduly a oprávnění). */
  presets: WidgetPresetInfo[];
  /** Uložené pohledy použitelné ve widgetech Číslo, Seznam z pohledu a Rychlé odkazy. */
  views: ViewChoice[];
};

/**
 * Vše, co UI nástěnek potřebuje od serveru. Komponenty nezná server actions ani route handlery; aplikace jim rozhraní
 * dodá (`apps/web/src/lib/dashboard-api.ts`). Chyby se hlásí výjimkou s čitelnou hláškou.
 */
export type DashboardApi = {
  list(): Promise<DashboardSummary[]>;
  get(id: string): Promise<{ summary: DashboardSummary; definition: DashboardDefinition }>;
  create(v: { name: string; definition?: DashboardDefinition }): Promise<{ id: string }>;
  update(v: {
    id: string;
    name?: string;
    definition?: DashboardDefinition;
    expectedUpdatedAt?: string;
  }): Promise<{ updatedAt: string }>;
  remove(id: string): Promise<void>;
  clone(id: string, name?: string): Promise<{ id: string }>;
  share(id: string, to: { roles: string[]; users: string[] }): Promise<void>;
  reorder(ids: string[]): Promise<void>;
  catalog(): Promise<SourceCatalog>;
  /** Vyhodnotí jeden widget (route handler, souběžně). */
  evaluate(
    widget: DashboardWidget,
    filters: DashboardFilters,
    opts?: { fresh?: boolean },
  ): Promise<WidgetOutcome>;
  /** Stáhne data widgetu (CSV / XLSX). */
  exportWidget(
    widget: DashboardWidget,
    filters: DashboardFilters,
    format: "csv" | "xlsx",
  ): Promise<void>;
  /** Odškrtne úkol přímo ve widgetu (příkaz `ukoly.complete`). */
  completeTask(id: string): Promise<void>;
  /** Stáhne snímek nástěnky do PDF. */
  exportBoard(boardId: string, filters: DashboardFilters): Promise<void>;
};

const Ctx = createContext<DashboardApi | null>(null);

export function DashboardApiProvider({
  api,
  children,
}: {
  api: DashboardApi;
  children: ReactNode;
}) {
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

/** Rozhraní nástěnek z kontextu; mimo `DashboardApiProvider` je to chyba. */
export function useDashboardApi(): DashboardApi {
  const api = useContext(Ctx);
  if (!api) throw new Error("Chybí DashboardApiProvider.");
  return api;
}

export const dashKeys = {
  list: ["dashboards", "list"] as const,
  board: (id: string) => ["dashboards", "board", id] as const,
  catalog: ["dashboards", "catalog"] as const,
  widget: (w: DashboardWidget, f: DashboardFilters, n = 0) =>
    ["dashboards", "widget", JSON.stringify([w, f]), n] as const,
};
