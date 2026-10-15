"use client";

import type { MarkRenewedResult } from "../types";
import { formatDate } from "@rebar/core/shared";
import { CLIENT_TABS } from "@rebar/core/contracts";
import { defineModuleUi, errorToast, successToast, undoToast } from "@rebar/ui";
import { ClientHostingTab } from "./client-tab";
import { HostingPage } from "./hosting-page";

/**
 * UI oblasti „hosting“ modulu „muj-prostor“ (MPR-1): stránka Hosting a údržba (souhrn, obnovy, pohledy), akce
 * „Označit obnovu jako vyfakturovanou“ na detailu služby a záložka „Hosting a domény“ na kartě klienta (jen vlastník).
 * Zapojuje ji `ui.tsx` přes `mergeModuleUi`.
 */
export const areaUi = defineModuleUi({
  pages: [{ path: "/muj-prostor/hosting", render: () => <HostingPage /> }],
  recordTabs: {
    company: [
      {
        id: "hosting",
        label: "Hosting a domény",
        permission: ["muj-prostor.hosting", "muj-prostor.domains"],
        order: CLIENT_TABS.hosting,
        icon: "vault",
        render: ({ id }) => <ClientHostingTab companyId={id} />,
      },
    ],
  },
  recordActions: {
    recurring_service: [
      {
        id: "mark-renewed",
        label: "Označit obnovu jako vyfakturovanou",
        permission: "muj-prostor.hosting",
        visible: (row) => row.status === "active" && typeof row.nextRenewal === "string",
        run: async ({ id, row, api, refresh }) => {
          try {
            const r = await api.command<
              { id: string; expectedNextRenewal: string },
              MarkRenewedResult
            >("muj-prostor.hosting.markRenewed", {
              id,
              expectedNextRenewal: String(row.nextRenewal),
            });
            refresh();
            undoToast(`Další obnova je ${formatDate(r.next)}.`, async () => {
              try {
                await api.command("muj-prostor.hosting.undoRenewed", {
                  id,
                  from: r.next,
                  to: r.previous,
                });
                successToast(`Vráceno na ${formatDate(r.previous)}.`);
                refresh();
              } catch (e) {
                errorToast(e instanceof Error ? e.message : "Vrácení se nepodařilo.");
              }
            });
          } catch (e) {
            errorToast(e instanceof Error ? e.message : "Obnovu se nepodařilo označit.");
          }
        },
      },
    ],
  },
});
