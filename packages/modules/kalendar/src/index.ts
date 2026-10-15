import { defineModule } from "@rebar/core/manifest";

export const manifest = defineModule({
  id: "kalendar",
  name: "Kalendář",
  description:
    "Kalendář propojený s Google Kalendářem každého uživatele (obousměrná synchronizace do minuty): pohledy Den, Týden, Měsíc a Agenda, schůzky a hovory z úkolů zapsané do Googlu, vrstvy z ostatních modulů (úkoly s termínem, termíny zakázek), vazby událostí na obchody, klienty a kontakty, cizí soukromé události jako „Obsazeno“.",
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
      description:
        "Rozsah „jen moje“ = jen kalendáře mého Google účtu; „vše“ i kalendáře ostatních (jejich soukromé události jako „Obsazeno“)",
    },
    {
      key: "kalendar.write",
      label: "Upravuje události",
      description:
        "Připojení vlastního Google účtu, zakládání a přesouvání schůzek, vazby na klienty a obchody; rozsah „jen moje“ = jen vlastní události",
    },
  ],
});
