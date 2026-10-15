"use client";

import { ContactActionBar, defineModuleUi } from "@rebar/ui";

/*
  Mobilní příspěvky modulu „kontakty“ (MOB-04): karta kontaktu s velkými tlačítky Zavolat, SMS, WhatsApp a E-mail
  nad ostatními kartami. Viditelná jen na telefonu (`ContactActionBar` se od šířky `sm` skryje); chybí-li telefon nebo
  e-mail, příslušná tlačítka se nezobrazí.
*/
const text = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

export const mobileUi = defineModuleUi({
  recordOverview: {
    person: [
      {
        id: "mobil-akce",
        column: "main",
        order: 0,
        permission: "kontakty.read",
        render: ({ row }) => (
          <ContactActionBar
            phone={text(row.phone) ?? text(row.primaryPhone)}
            email={text(row.email) ?? text(row.primaryEmail)}
            only={["call", "sms", "whatsapp", "mail"]}
          />
        ),
      },
    ],
  },
});
