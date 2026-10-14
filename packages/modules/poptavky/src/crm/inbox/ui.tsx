"use client";

import { defineModuleUi } from "@rebar/ui";
import {
  CompanyPeopleCard,
  ContactDealsCard,
  ContactTimelineCard,
  RelatedCompaniesCard,
} from "./contact-cards";
import { ImportPage } from "./import-page";
import { inquiryActions } from "./qualify";

/**
 * UI oblasti CRM „inbox“ (Poptávky a kontakty, docs/CRM.md → Oblast F): akce schránky poptávek (Kvalifikovat, Zamítnout),
 * import z CSV a karty obchodu na detailu firmy a osoby (zakázky s mini pásem stavů, časová osa, osoby, související firmy).
 */
export const areaUi = defineModuleUi({
  recordActions: { inquiry: inquiryActions },
  pages: [{ path: "/poptavky/import", render: () => <ImportPage /> }],
  recordOverview: {
    company: [
      {
        id: "crm-deals",
        order: 10,
        permission: "zakazky.read",
        render: ({ id, row }) => (
          <ContactDealsCard entity="company" id={id} name={String(row.name ?? "")} />
        ),
      },
      {
        id: "crm-timeline",
        order: 20,
        permission: "poptavky.read",
        render: ({ id }) => <ContactTimelineCard entity="company" id={id} />,
      },
      {
        id: "crm-people",
        column: "side",
        order: 10,
        render: ({ id }) => <CompanyPeopleCard id={id} />,
      },
      {
        id: "crm-related",
        column: "side",
        order: 20,
        render: ({ id }) => <RelatedCompaniesCard id={id} />,
      },
    ],
    person: [
      {
        id: "crm-deals",
        order: 10,
        permission: "zakazky.read",
        render: ({ id, row }) => (
          <ContactDealsCard entity="person" id={id} name={String(row.name ?? "")} />
        ),
      },
      {
        id: "crm-timeline",
        order: 20,
        permission: "poptavky.read",
        render: ({ id }) => <ContactTimelineCard entity="person" id={id} />,
      },
    ],
  },
});
