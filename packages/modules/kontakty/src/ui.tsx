"use client";

import { CLIENT_OVERVIEW_ORDER, CLIENT_TABS } from "@rebar/core/contracts";
import { defineModuleUi, mergeModuleUi, type RecordAction } from "@rebar/ui";
import { AresUpdateDialogBody } from "./ui/ares";
import { AresIntegrationPanel } from "./ui/ares-panel";
import { CompanyContacts, CompanyDuplicatesCard, PersonCompaniesCard } from "./ui/cards";
import { mobileUi } from "./mobile/ui";
import { MergeForm } from "./ui/merge-dialog";
import { PointsCard } from "./ui/points-card";
import { NewContactPage } from "./ui/quick-contact";
import { NewCompanyPage } from "./ui/new-company";

export { QuickContactDialog, QuickContactForm, CompanyPicker } from "./ui/quick-contact";
export { ContactLinks, PhoneLink, EmailLink, copyText } from "./ui/contact-links";
export { PointsCard, PointsEditor } from "./ui/points-card";
export { CompanyContacts } from "./ui/cards";
export { AresIntegrationPanel } from "./ui/ares-panel";
export { MergeForm } from "./ui/merge-dialog";

/*
  UI modulu „kontakty“. Seznamy, detaily a inline úpravy organizací a kontaktů dodává jádro (entity `company`
  a `person`); modul přidává karty a záložky, akce (ARES, sloučení, volání), stránky rychlého založení a panel ARES
  pro Nastavení → Integrace. Komponenty pro jiné moduly (rychlé založení kontaktu z obchodu a zakázky) jsou exportované.
*/

const mergeAction = (entity: "company" | "person"): RecordAction => ({
  id: "merge",
  label: "Sloučit duplicitu",
  permission: "kontakty.merge",
  dialog: {
    title: entity === "company" ? "Sloučit organizace" : "Sloučit kontakty",
    render: ({ id, row, close, push }) => (
      <MergeForm
        entity={entity}
        id={id}
        name={String(row[entity === "company" ? "name" : "fullName"] ?? "")}
        close={close}
        push={push}
      />
    ),
  },
});

const dial = (row: Record<string, unknown>) => {
  const phone = typeof row.phone === "string" ? row.phone : null;
  if (phone) window.location.href = `tel:${phone.replace(/[^\d+]/g, "")}`;
};
const mail = (row: Record<string, unknown>) => {
  const email = typeof row.email === "string" ? row.email : null;
  if (email) window.location.href = `mailto:${email}`;
};

const callActions = (): RecordAction[] => [
  {
    id: "call",
    label: "Zavolat",
    permission: "kontakty.read",
    visible: (row) => typeof row.phone === "string" && row.phone !== "",
    run: ({ row }) => dial(row),
  },
  {
    id: "write",
    label: "Napsat e-mail",
    permission: "kontakty.read",
    visible: (row) => typeof row.email === "string" && row.email !== "",
    run: ({ row }) => mail(row),
  },
];

export const ui = mergeModuleUi(
  defineModuleUi({
    recordTabs: {
      company: [
        {
          id: "kontakty",
          label: "Kontakty",
          permission: "kontakty.read",
          order: CLIENT_TABS.kontakty,
          render: ({ id }) => (
            <div className="p-4">
              <CompanyContacts companyId={id} />
            </div>
          ),
        },
      ],
    },
    recordOverview: {
      company: [
        {
          id: "kontakty-souhrn",
          column: "main",
          order: CLIENT_OVERVIEW_ORDER.kontakty,
          permission: "kontakty.read",
          render: ({ id }) => <CompanyContacts companyId={id} limit={5} />,
        },
        {
          id: "mozna-duplicita",
          column: "side",
          order: 10,
          permission: "kontakty.read",
          render: ({ id, row }) => (
            <CompanyDuplicatesCard
              companyId={id}
              name={String(row.name ?? "")}
              web={typeof row.web === "string" ? row.web : null}
            />
          ),
        },
      ],
      person: [
        {
          id: "kontaktni-udaje",
          column: "side",
          order: 5,
          permission: "kontakty.read",
          render: ({ id }) => <PointsCard personId={id} />,
        },
        {
          id: "organizace-osoby",
          column: "main",
          order: 10,
          permission: "kontakty.read",
          render: ({ id }) => <PersonCompaniesCard personId={id} />,
        },
      ],
    },
    recordActions: {
      company: [
        {
          id: "ares",
          label: "Aktualizovat z ARES",
          permission: ["kontakty.ares", "kontakty.write"],
          visible: (row) => typeof row.ico === "string" && row.ico !== "",
          dialog: {
            title: "Aktualizovat z ARES",
            render: ({ id, close }) => <AresUpdateDialogBody companyId={id} close={close} />,
          },
        },
        // „Zavolat“ a „Napsat e-mail“ u organizace dodávají hlavička klienta (KLI-04) a modul e-mailových šablon
        mergeAction("company"),
      ],
      person: [...callActions(), mergeAction("person")],
    },
    pages: [
      { path: "/kontakty/firmy/nova", render: () => <NewCompanyPage /> },
      { path: "/kontakty/osoby/novy", render: ({ query }) => <NewContactPage query={query} /> },
    ],
    slots: { "settings.integrations": AresIntegrationPanel },
    paletteActions: [
      {
        id: "kontakty.new-person",
        label: "Nový kontakt",
        keywords: "osoba člověk kontakt telefon",
        icon: "users",
        permission: "kontakty.create",
        href: "/kontakty/osoby/novy",
      },
      {
        id: "kontakty.new-company",
        label: "Nová organizace",
        keywords: "firma organizace ares ičo",
        icon: "building-2",
        permission: "kontakty.create",
        href: "/kontakty/firmy/nova",
      },
    ],
  }),
  mobileUi,
);
