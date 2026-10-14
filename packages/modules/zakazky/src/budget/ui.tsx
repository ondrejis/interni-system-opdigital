import type { ModulePage, RecordAction, RecordTab } from "@rebar/ui";
import { BudgetTab } from "./tab";

/** UI oblasti „budget“ (záložka Rozpočet, skupina `rozpocet`). Klientský kód: žádné importy serverových částí. */
export const tabs: RecordTab[] = [
  {
    id: "rozpocet",
    label: "Rozpočet",
    permission: "zakazky.economics",
    group: "rozpocet",
    order: 10,
    render: ({ id, openTab }) => <BudgetTab jobId={id} {...(openTab ? { openTab } : {})} />,
  },
];
export const actions: RecordAction[] = [];
export const pages: ModulePage[] = [];
