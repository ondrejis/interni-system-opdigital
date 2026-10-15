import { defineModuleUi } from "@rebar/ui";
import { AccountPerformance, AccountSide } from "./account-overview";
import { AccountsPage } from "./accounts-page";
import { ClientAdsTab, JobAdsTab } from "./ads-tab";
import { CampaignPerformance, CampaignSide } from "./campaign-overview";

/** Pořadí záložek podle `CLIENT_TABS.reklama` a `JOB_TAB_ORDER.reklama`; konstanty jádra se do prohlížeče netáhnou. */
const CLIENT_TAB_ORDER_REKLAMA = 80;
const JOB_TAB_ORDER_REKLAMA = 60;

/**
 * UI oblast „ui“ modulu „reklama“ (REK-B): stránka `/reklama` se seznamem účtů (statická trasa
 * `apps/web/src/app/(app)/reklama` předběhne generický seznam entity `ad_account`), Přehled účtu a kampaně (výkon za
 * období, graf po dnech, sady a reklamy, leady, vlastník účtu, přiřazení zakázce) a záložka „Reklama“ na kartě klienta
 * a v marketingové zakázce. Detail účtu `/reklama/<id>` a kampaně `/reklama/kampane/<id>` zůstává generickým záznamem
 * entity, do kterého moduly přidávají karty. Zapojuje ji `ui.tsx` přes `mergeModuleUi`.
 */
export const areaUi = defineModuleUi({
  pages: [{ path: "/reklama", render: () => <AccountsPage /> }],
  recordOverview: {
    ad_account: [
      {
        id: "reklama.account.performance",
        column: "main",
        order: 5,
        permission: "reklama.read",
        render: ({ id }) => <AccountPerformance accountId={id} />,
      },
      {
        id: "reklama.account.side",
        column: "side",
        order: 5,
        permission: "reklama.read",
        render: ({ id }) => <AccountSide accountId={id} />,
      },
    ],
    ad_campaign: [
      {
        id: "reklama.campaign.performance",
        column: "main",
        order: 5,
        permission: "reklama.read",
        render: ({ id }) => <CampaignPerformance campaignId={id} />,
      },
      {
        id: "reklama.campaign.side",
        column: "side",
        order: 5,
        permission: "reklama.read",
        render: ({ id }) => <CampaignSide campaignId={id} />,
      },
    ],
  },
  hiddenCoreTabs: {
    ad_account: ["tasks", "files"],
    ad_campaign: ["tasks", "files"],
  },
  recordTabs: {
    company: [
      {
        id: "reklama",
        label: "Reklama",
        icon: "megaphone",
        permission: "reklama.read",
        order: CLIENT_TAB_ORDER_REKLAMA,
        render: ({ id }) => <ClientAdsTab companyId={id} />,
      },
    ],
    job: [
      {
        id: "reklama",
        label: "Reklama",
        icon: "megaphone",
        permission: "reklama.read",
        order: JOB_TAB_ORDER_REKLAMA,
        visible: (row) => row.type === "marketing",
        render: ({ id }) => <JobAdsTab jobId={id} />,
      },
    ],
  },
});
