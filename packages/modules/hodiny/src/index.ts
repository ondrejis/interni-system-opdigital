import { defineModule } from "@rebar/core/manifest";

export const manifest = defineModule({
  id: "hodiny",
  name: "Hodiny",
  description:
    "Zápis odpracovaného času k zakázkám a úkolům: týdenní mřížka, formáty 1,5 a 1:30, souhrny podle zakázky.",
  icon: "clock",
  dependsOn: ["zakazky"],
  nav: [
    {
      label: "Hodiny",
      href: "/hodiny",
      icon: "clock",
      permission: "hodiny.read",
      group: "Realizace",
      order: 20,
    },
  ],
  pages: [{ path: "/hodiny", title: "Hodiny", permission: "hodiny.read" }],
  entities: ["time_entry"],
  permissions: [
    {
      key: "hodiny.read",
      label: "Vidí odpracované hodiny",
      description: "Rozsah „jen moje“ = jen vlastní záznamy",
    },
    { key: "hodiny.write", label: "Zapisuje a upravuje hodiny" },
    { key: "hodiny.delete", label: "Maže záznamy hodin" },
  ],
});
