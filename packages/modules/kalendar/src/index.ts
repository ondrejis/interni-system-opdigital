import { defineModule } from "@rebar/core/manifest";
import { KALENDAR_NOTIFICATIONS } from "./notifications";

export const manifest = defineModule({
  id: "kalendar",
  name: "Kalendář",
  description:
    "Kalendář propojený s Google Kalendářem uživatele: pohledy Den, Týden, Měsíc a Agenda, vrstvy z ostatních modulů (úkoly s termínem, termíny zakázek), vazby událostí na obchody a kontakty, cizí soukromé události jako „Obsazeno“.",
  icon: "calendar",
  nav: [
    {
      label: "Kalendář",
      href: "/kalendar",
      icon: "calendar",
      permission: "kalendar.read",
      group: "Práce",
      order: 20,
    },
  ],
  pages: [{ path: "/kalendar", title: "Kalendář", permission: "kalendar.read" }],
  permissions: [
    {
      key: "kalendar.read",
      label: "Vidí kalendář",
      description: "Rozsah „jen moje“ = události, které vlastním nebo na které jsem pozvaný",
    },
    {
      key: "kalendar.write",
      label: "Upravuje události",
      description: "Rozsah „jen moje“ = jen vlastní události",
    },
  ],
  notifications: KALENDAR_NOTIFICATIONS,
});
