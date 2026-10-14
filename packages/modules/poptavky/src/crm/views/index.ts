import { defineModuleServer } from "@rebar/core/module-server";
import { archiveListCommand } from "./archive";
import { forecastCommand } from "./forecast";
import { crmDashboardMetrics } from "./metrics";
import { dealAttention, dealTiles, inboxAttention } from "./overview";

/**
 * Serverová část oblasti CRM „views“ (viz docs/CRM.md): příkazy `crm.forecast` (prognóza po měsících) a
 * `crm.archive.list` (archiv), „Vyžaduje pozornost“ (obchody a schránka poptávek), dlaždice přehledu a metriky nástěnek.
 */
export const area = defineModuleServer({
  commands: [forecastCommand, archiveListCommand],
  attention: [dealAttention, inboxAttention],
  widgets: [dealTiles],
  dashboardMetrics: crmDashboardMetrics,
});
export { forecastCommand, archiveListCommand };
