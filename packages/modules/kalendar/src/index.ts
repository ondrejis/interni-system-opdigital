import { defineModule } from "@rebar/core/manifest";
import { KALENDAR_NOTIFICATIONS } from "./notifications";

export const manifest = defineModule({
  id: "kalendar",
  name: "Kalendář",
  description:
    "Události s účastníky, opakováním a připomenutím, zdroje (zasedačky, vybavení) s kontrolou kolizí, vrstvy z ostatních modulů, odběr kalendáře v Google, Apple a Outlooku a import cizích kalendářů jako „obsazeno“.",
  icon: "calendar",
  nav: [
    {
      label: "Kalendář",
      href: "/kalendar",
      icon: "calendar",
      permission: "kalendar.read",
      group: "Provoz",
    },
    {
      label: "Události",
      href: "/kalendar/udalosti",
      icon: "calendar-days",
      permission: "kalendar.read",
      parent: "/kalendar",
    },
    {
      label: "Zdroje kalendáře",
      href: "/kalendar/zdroje",
      icon: "boxes",
      permission: "kalendar.read",
      parent: "/kalendar",
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
    { key: "kalendar.resources", label: "Spravuje zdroje kalendáře" },
  ],
  entities: ["event", "calendar_resource"],
  notifications: KALENDAR_NOTIFICATIONS,
});
