"use client";

import { defineModuleUi, type RecordOverviewCard, type RecordTab } from "@rebar/ui";
import { RelatedRecords } from "@rebar/ui";
import { OWN_OVERVIEW_ORDER, OWN_TAB_ORDER } from "./shared";
import { ClientContextTab } from "./ui/context-tab";
import { ResponsiveClientsPage } from "./mobile/clients-cards";
import { ClientHeaderBand } from "./ui/header";
import { mobileCard } from "./ui/mobile";
import {
  ActiveJobsCard,
  ContextCard,
  EventsCard,
  FinanceCard,
  OpenDealsCard,
  RecentNotesCard,
} from "./ui/overview";

export { ClientsPage } from "./ui/clients-page";
export { ClientHeaderBand } from "./ui/header";
export { ClientContextTab } from "./ui/context-tab";
export { MobileClientCard } from "./ui/mobile";

/*
  UI modulu „klienti“ (KLI-01…07, 10, 11, ORG-08, MOB-03). Klient je organizace, takže karta klienta je detail organizace
  (`/kontakty/firmy/<id>`), který modul skládá z příspěvků: hlavička (stav, služby, vlastník, štítky, akce), záložka
  Kontext, karty Přehledu (kontext, aktivní zakázky, otevřené obchody, finance, poslední události, poznámky, mobilní
  tlačítka) a záložky Zakázky a Obchody (seznamy jádra s pevným filtrem na klienta). Pořadí a id záložek jsou konstanty
  `CLIENT_TABS` / `CLIENT_OVERVIEW_ORDER` z jádra (do prohlížeče se netáhnou, proto jsou čísla v `shared.ts`; test
  `shared.test.ts` je porovnává). Záložky ostatních modulů (Kontakty, Úkoly, Poznámky, Finance, Reklama, Hosting) přidávají ony samy.
*/
const TAB_ORDER = OWN_TAB_ORDER;
const OVERVIEW = OWN_OVERVIEW_ORDER;

const tabs: RecordTab[] = [
  {
    id: "kontext",
    label: "Kontext",
    icon: "file-text",
    permission: "klienti.read",
    order: TAB_ORDER.kontext,
    visible: (row) => typeof row.clientStatus === "string" && row.clientStatus !== "",
    render: ({ id }) => <ClientContextTab companyId={id} />,
  },
  {
    id: "zakazky",
    label: "Zakázky",
    icon: "briefcase",
    permission: "zakazky.read",
    order: TAB_ORDER.zakazky,
    visible: (row) => typeof row.clientStatus === "string" && row.clientStatus !== "",
    render: ({ id }) => <RelatedRecords entity="job" parentAttribute="company" parentId={id} />,
  },
  {
    id: "obchody",
    label: "Obchody",
    icon: "target",
    permission: "obchody.read",
    order: TAB_ORDER.obchody,
    visible: (row) => typeof row.clientStatus === "string" && row.clientStatus !== "",
    render: ({ id }) => <RelatedRecords entity="deal" parentAttribute="company" parentId={id} />,
  },
];

const isClient = (row: Record<string, unknown>) =>
  typeof row.clientStatus === "string" && row.clientStatus !== "";

const cards: RecordOverviewCard[] = [
  mobileCard,
  {
    id: "klient-kontext",
    column: "main",
    order: 5,
    permission: "klienti.read",
    visible: isClient,
    render: ({ id, openTab }) => <ContextCard companyId={id} openTab={openTab} />,
  },
  {
    id: "klient-zakazky",
    column: "main",
    order: OVERVIEW.zakazky,
    permission: "zakazky.read",
    visible: isClient,
    render: ({ id }) => <ActiveJobsCard companyId={id} />,
  },
  {
    id: "klient-obchody",
    column: "main",
    order: OVERVIEW.obchody,
    permission: "obchody.read",
    visible: isClient,
    render: ({ id }) => <OpenDealsCard companyId={id} />,
  },
  {
    id: "klient-poznamky",
    column: "main",
    order: 45,
    permission: "ukoly.read",
    visible: isClient,
    render: ({ id }) => <RecentNotesCard companyId={id} />,
  },
  {
    id: "klient-finance",
    column: "main",
    order: OVERVIEW.finance,
    permission: "finance.read",
    visible: isClient,
    render: ({ id }) => <FinanceCard companyId={id} />,
  },
  {
    id: "klient-udalosti",
    column: "main",
    order: OVERVIEW.udalosti,
    permission: "klienti.read",
    visible: isClient,
    render: ({ id }) => <EventsCard companyId={id} />,
  },
];

export const ui = defineModuleUi({
  pages: [{ path: "/klienti", render: () => <ResponsiveClientsPage /> }],
  recordHeader: { company: ClientHeaderBand },
  recordTabs: { company: tabs },
  recordOverview: { company: cards },
  paletteActions: [
    {
      id: "klienti.list",
      label: "Klienti",
      keywords: "klienti klient seznam firmy zákazníci",
      icon: "handshake",
      permission: "klienti.read",
      href: "/klienti",
    },
    {
      id: "klienti.new",
      label: "Nový klient",
      keywords: "klient firma organizace nový přidat lead",
      icon: "handshake",
      permission: "kontakty.create",
      href: "/kontakty/firmy/nova",
    },
  ],
});
