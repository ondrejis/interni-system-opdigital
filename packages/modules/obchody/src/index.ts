import { defineModule } from "@rebar/core/manifest";

export const manifest = defineModule({
  id: "obchody",
  name: "Obchody",
  description:
    "Obchodní příležitosti: pipeline s pravděpodobnostmi, board se součty, výhra (založení zakázek) a prohra s důvodem.",
  icon: "target",
  dependsOn: ["kontakty", "zakazky"],
  nav: [
    {
      label: "Obchody",
      href: "/obchody",
      icon: "target",
      permission: "obchody.read",
      group: "CRM",
      order: 10,
      bottom: true,
    },
  ],
  entities: ["deal"],
  permissions: [
    { key: "obchody.read", label: "Vidí obchody" },
    { key: "obchody.create", label: "Zakládá obchody" },
    {
      key: "obchody.write",
      label: "Upravuje obchody",
      description: "Přesun mezi fázemi, výhra, prohra, znovuotevření",
    },
    { key: "obchody.delete", label: "Maže obchody", description: "Do koše; obnovit smí každý své" },
    { key: "obchody.export", label: "Exportuje obchody" },
    {
      key: "obchody.pipelines",
      label: "Spravuje pipeline obchodů",
      description: "Fáze, pravděpodobnosti a lhůty",
    },
  ],
  seed: {
    pipelines: [
      {
        entityType: "deal",
        key: "default",
        name: "Obchody",
        stages: [
          { name: "Nová poptávka", color: "gray", probabilityPct: 10, rottingDays: 1 },
          { name: "Kontaktováno", color: "blue", probabilityPct: 20, rottingDays: 5 },
          { name: "Schůzka / konzultace", color: "teal", probabilityPct: 40, rottingDays: 7 },
          { name: "Nabídka odeslaná", color: "indigo", probabilityPct: 60, rottingDays: 7 },
          { name: "Vyjednávání", color: "orange", probabilityPct: 80, rottingDays: 10 },
        ],
      },
    ],
    lookups: [
      {
        key: "deal.lost_reason",
        name: "Důvod prohry obchodu",
        items: [
          { value: "price", label: "Cena" },
          { value: "competitor", label: "Vybrali konkurenci" },
          { value: "no_response", label: "Nereaguje" },
          { value: "postponed", label: "Odloženo" },
          { value: "unsuitable_client", label: "Nevhodný klient" },
          { value: "other", label: "Jiné" },
        ],
      },
    ],
  },
});
