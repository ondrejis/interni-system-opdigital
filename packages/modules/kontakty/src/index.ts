import { defineModule } from "@rebar/core/manifest";

export const manifest = defineModule({
  id: "kontakty",
  name: "Organizace a kontakty",
  description:
    "Organizace (klient je organizace se stavem klienta) a kontaktní osoby: více telefonů a e-mailů, doplnění z ARES, kontrola duplicit a jejich sloučení.",
  icon: "contact",
  nav: [
    {
      label: "Organizace",
      href: "/kontakty/firmy",
      icon: "building-2",
      permission: "kontakty.read",
      group: "CRM",
      order: 30,
    },
    {
      label: "Kontakty",
      href: "/kontakty/osoby",
      icon: "users",
      permission: "kontakty.read",
      group: "CRM",
      order: 40,
    },
  ],
  permissions: [
    { key: "kontakty.read", label: "Vidí organizace a kontakty" },
    { key: "kontakty.create", label: "Zakládá organizace a kontakty" },
    { key: "kontakty.write", label: "Upravuje organizace a kontakty" },
    {
      key: "kontakty.delete",
      label: "Maže organizace a kontakty",
      description: "Do koše; obnovit smí každý své",
    },
    { key: "kontakty.export", label: "Exportuje organizace a kontakty" },
    {
      key: "kontakty.merge",
      label: "Slučuje duplicitní kontakty",
      description:
        "Sloučení firmy nebo osoby přepojí zakázky, obchody a další záznamy na jiný kontakt; nejde vrátit",
    },
    { key: "kontakty.ares", label: "Doplňuje údaje z ARES" },
  ],
  entities: ["company", "person"],
  pages: [
    { path: "/kontakty/firmy/nova", title: "Nová organizace", permission: "kontakty.create" },
    { path: "/kontakty/osoby/novy", title: "Nový kontakt", permission: "kontakty.create" },
  ],
});
