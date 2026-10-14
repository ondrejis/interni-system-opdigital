export { DashboardApiProvider, useDashboardApi, dashKeys } from "./api";
export type { DashboardApi, SourceCatalog } from "./api";
export { DashboardView } from "./dashboard-view";
export { DashboardSwitcher } from "./dashboard-switcher";
export { NewBoardDialog, OrderDialog } from "./board-dialogs";
export { DashboardGrid } from "./dashboard-grid";
export { WidgetCard } from "./widget-card";
export { WidgetBody } from "./widget-body";
export { FiltersBar } from "./filters-bar";
export { ShareDialog } from "./share-dialog";
export { elementToPng } from "./png";
import { DEFINITION_VERSION, type DashboardDefinition } from "@rebar/core/dashboards-shared";

/** Prázdná definice nové nástěnky. */
export const emptyBoard = (): DashboardDefinition => ({
  schemaVersion: DEFINITION_VERSION,
  widgets: [],
});
