import { defineModule } from "@rebar/core/manifest";

export const manifest = defineModule({
  id: "kontakty",
  name: "Kontakty",
  description:
    "Firmy a osoby: typ, hierarchie, štítky, více telefonů a e-mailů, doplnění z ARES, kontrola duplicit a jejich sloučení.",
  icon: "contact",
  nav: [
    {
      label: "Firmy",
      href: "/kontakty/firmy",
      icon: "building-2",
      permission: "kontakty.read",
      group: "Obchod",
    },
    {
      label: "Osoby",
      href: "/kontakty/osoby",
      icon: "users",
      permission: "kontakty.read",
      group: "Obchod",
    },
  ],
  permissions: [
    { key: "kontakty.read", label: "Vidí kontakty" },
    { key: "kontakty.write", label: "Upravuje kontakty" },
    {
      key: "kontakty.merge",
      label: "Slučuje duplicitní kontakty",
      description:
        "Sloučení firmy nebo osoby přepojí zakázky, poptávky, faktury a další záznamy na jiný kontakt; nejde vrátit",
    },
  ],
  entities: ["company", "person"],
  seed: {
    lookups: [
      {
        key: "company.type",
        name: "Typ kontaktu (firma)",
        items: [
          { value: "investor", label: "Investor", color: "green" },
          { value: "architect", label: "Architekt", color: "purple" },
          { value: "designer", label: "Projektant", color: "indigo" },
          { value: "general_contractor", label: "Generální dodavatel", color: "blue" },
          { value: "subcontractor", label: "Subdodavatel", color: "orange" },
          { value: "supplier", label: "Dodavatel materiálu", color: "teal" },
          { value: "developer", label: "Developer", color: "pink" },
          { value: "property_manager", label: "Správce nemovitostí", color: "yellow" },
          { value: "public_body", label: "Úřad / veřejný zadavatel", color: "gray" },
          { value: "other", label: "Jiný", color: "gray" },
        ],
      },
      {
        key: "person.role",
        name: "Role osoby",
        items: [
          { value: "investor", label: "Investor" },
          { value: "architect", label: "Architekt" },
          { value: "designer", label: "Projektant" },
          { value: "tdi", label: "Technický dozor investora" },
          { value: "site_manager", label: "Stavbyvedoucí" },
          { value: "purchaser", label: "Nákupčí" },
          { value: "accountant", label: "Účetní" },
          { value: "other", label: "Jiná" },
        ],
      },
      {
        key: "contact.point_type",
        name: "Typ telefonu a e-mailu",
        items: [
          { value: "work", label: "Práce" },
          { value: "mobile", label: "Mobil" },
          { value: "home", label: "Domů" },
          { value: "billing", label: "Fakturace" },
          { value: "other", label: "Jiný" },
        ],
      },
      {
        key: "contact.tag",
        name: "Štítky kontaktů",
        items: [
          { value: "vip", label: "VIP", color: "yellow" },
          { value: "partner", label: "Partner", color: "green" },
          { value: "repeat", label: "Opakovaný zákazník", color: "blue" },
          { value: "slow_payer", label: "Pomalý plátce", color: "red" },
        ],
      },
    ],
  },
});
