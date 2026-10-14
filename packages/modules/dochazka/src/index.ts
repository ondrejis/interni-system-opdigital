import { defineModule } from "@rebar/core/manifest";
import { dochazkaNotifications } from "./notifications";

export const manifest = defineModule({
  id: "dochazka",
  name: "Docházka",
  description:
    "Píchačka (příchod, odchod, přestávka), týdenní výkazy hodin na zakázky, schvalování, uzávěrka měsíce, přehledy a připomínka.",
  icon: "clock",
  nav: [
    {
      label: "Docházka",
      href: "/dochazka",
      icon: "clock",
      permission: ["dochazka.own", "dochazka.read"],
      group: "Provoz",
    },
  ],
  pages: [{ path: "/dochazka", title: "Docházka", permission: ["dochazka.own", "dochazka.read"] }],
  permissions: [
    { key: "dochazka.own", label: "Zapisuje svou docházku" },
    {
      key: "dochazka.read",
      label: "Vidí docházku",
      description: "Rozsah „vše“ = docházka všech, „jen moje“ = vlastní záznamy v seznamech",
    },
    {
      key: "dochazka.approve",
      label: "Schvaluje docházku",
      description: "Také zapisuje za ostatní",
    },
    { key: "dochazka.close_month", label: "Uzavírá měsíc" },
  ],
  entities: ["time_entry"],
  notifications: dochazkaNotifications,
  terminalWidgets: [
    {
      key: "dochazka.clock",
      label: "Docházka",
      description:
        "Příchod, přestávka a odchod na jedno ťuknutí, s výběrem zakázky a dnešními hodinami.",
      icon: "clock",
      permission: "dochazka.own",
      commands: [
        "dochazka.clock.in",
        "dochazka.clock.break",
        "dochazka.clock.out",
        "dochazka.submitWeek",
      ],
      page: true,
    },
  ],
});
