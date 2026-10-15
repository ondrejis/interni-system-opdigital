"use client";

import { defineModuleUi } from "@rebar/ui";
import { ClientFinanceTab } from "./client-tab";
import { JobFinanceTab } from "./job-tab";
import { PaymentsPage } from "./payments-page";
import { ReportsPage } from "./reports-page";
import { SettlementPage } from "./settlement-page";
import { JobCreateExtras, JobHeaderExtra } from "./slots";

export { FinanceSettings } from "./settings";
export { SplitEditor } from "./split-editor";

/** Pořadí záložky podle `CLIENT_TABS.finance`; konstanty jádra se do prohlížeče netáhnou. */
const CLIENT_TAB_ORDER_FINANCE = 70;

/**
 * UI oblast „ui“ modulu „finance“ (FIN-C): stránky Platby a rozdělení (`/finance`), Vyrovnání, Přehledy, záložky
 * „Finance“ na zakázce a kartě klienta, příspěvky do slotů zakázky a rychlé akce palety (Cmd+K).
 */
export const areaUi = defineModuleUi({
  pages: [
    { path: "/finance", render: ({ rest, query }) => <PaymentsPage rest={rest} query={query} /> },
    {
      path: "/finance/vyrovnani",
      render: ({ query }) => <SettlementPage autoOpen={query.zapsat === "1"} />,
    },
    { path: "/finance/prehledy", render: () => <ReportsPage /> },
  ],
  recordTabs: {
    job: [
      {
        id: "finance",
        label: "Finance",
        icon: "wallet",
        permission: "finance.read",
        order: 70,
        render: ({ id }) => <JobFinanceTab jobId={id} />,
      },
    ],
    company: [
      {
        id: "finance",
        label: "Finance",
        icon: "wallet",
        permission: "finance.read",
        order: CLIENT_TAB_ORDER_FINANCE,
        render: ({ id }) => <ClientFinanceTab companyId={id} />,
      },
    ],
  },
  slots: {
    "job.header.extra": ({ jobId }) => <JobHeaderExtra jobId={jobId} />,
    "job.create.extras": (p) => <JobCreateExtras {...p} />,
  },
  paletteActions: [
    {
      id: "finance.payment.new",
      label: "Zapsat platbu",
      keywords: "platba faktura finance zaplaceno",
      icon: "wallet",
      permission: "finance.payments_write",
      href: "/finance?nova=1",
    },
    {
      id: "finance.settlement.new",
      label: "Zapsat vyrovnání",
      keywords: "vyrovnání saldo dluh finance",
      icon: "scale",
      permission: "finance.settlements_write",
      href: "/finance/vyrovnani?zapsat=1",
    },
  ],
});
