import { defineModule } from "@rebar/core/manifest";

export const manifest = defineModule({
  id: "reklama",
  name: "Reklama",
  description:
    "Reklamní účty Meta, kampaně a denní výkon, příchozí leady z formulářů (přes n8n) a jejich převod na obchody.",
  icon: "megaphone",
  dependsOn: ["kontakty", "obchody"],
  nav: [
    {
      label: "Reklama",
      href: "/reklama",
      icon: "megaphone",
      permission: "reklama.read",
      group: "Marketing",
      order: 10,
    },
  ],
  entities: ["ad_account", "ad_campaign"],
  permissions: [
    { key: "reklama.read", label: "Vidí reklamní účty, kampaně a výkon" },
    {
      key: "reklama.write",
      label: "Upravuje reklamu",
      description: "Přiřazení účtů a kampaní ke klientům a zakázkám",
    },
    {
      key: "reklama.manage",
      label: "Spravuje napojení na Meta",
      description: "Mapování lead formulářů, ruční synchronizace",
    },
  ],
});
