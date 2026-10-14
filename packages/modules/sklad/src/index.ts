import { defineModule } from "@rebar/core/manifest";
import { SKLAD_NOTIFICATIONS } from "./notifications";

export const manifest = defineModule({
  id: "sklad",
  name: "Sklad",
  description:
    "Materiál na několika umístěních (sklad, dílna, vozidlo, stavba), příjem, výdej na zakázku, převody, vratky, objednávky u dodavatelů, minimální zásoby a inventura.",
  icon: "package",
  dependsOn: ["kontakty"],
  nav: [
    { label: "Sklad", href: "/sklad", icon: "package", permission: "sklad.read", group: "Provoz" },
    {
      label: "Skladové karty",
      href: "/sklad/karty",
      icon: "tag",
      permission: "sklad.read",
      parent: "/sklad",
    },
    {
      label: "Skladové doklady",
      href: "/sklad/doklady",
      icon: "file-stack",
      permission: "sklad.read",
      parent: "/sklad",
    },
    {
      label: "Objednávky",
      href: "/sklad/objednavky",
      icon: "shopping-cart",
      permission: "sklad.read",
      parent: "/sklad",
    },
    {
      label: "Inventury",
      href: "/sklad/inventury",
      icon: "clipboard-list",
      permission: "sklad.read",
      parent: "/sklad",
    },
    {
      label: "Umístění",
      href: "/sklad/umisteni",
      icon: "map-pin",
      permission: "sklad.read",
      parent: "/sklad",
    },
  ],
  pages: [{ path: "/sklad", title: "Sklad", permission: "sklad.read" }],
  permissions: [
    { key: "sklad.read", label: "Vidí sklad" },
    {
      key: "sklad.issue",
      label: "Vydává materiál na zakázky",
      description: "Výdejky a vratky",
    },
    {
      key: "sklad.write",
      label: "Spravuje sklad",
      description: "Karty, umístění, příjem, převody, objednávky",
    },
    { key: "sklad.inventory", label: "Provádí inventuru" },
  ],
  entities: ["stock_item", "warehouse", "stock_doc", "purchase_order", "stock_count"],
  notifications: SKLAD_NOTIFICATIONS,
  terminalWidgets: [
    {
      key: "sklad.issue",
      label: "Materiál",
      description: "Rychlý výdej materiálu ze skladu na zakázku.",
      icon: "package",
      permission: "sklad.issue",
      commands: ["sklad.post"],
      page: true,
    },
  ],
  seed: {
    series: [
      { key: "sklad.prijemka", pattern: "PR-{YYYY}-{NNNN}" },
      { key: "sklad.vydejka", pattern: "VY-{YYYY}-{NNNN}" },
      { key: "sklad.prevodka", pattern: "PV-{YYYY}-{NNNN}" },
      { key: "sklad.vratka", pattern: "VR-{YYYY}-{NNNN}" },
      { key: "sklad.inventurni-rozdil", pattern: "IN-{YYYY}-{NNNN}" },
      { key: "sklad.objednavka", pattern: "OB-{YYYY}-{NNN}" },
      { key: "sklad.inventura", pattern: "INV-{YYYY}-{NNN}" },
    ],
    lookups: [
      {
        key: "sklad.category",
        name: "Kategorie materiálu",
        items: [
          { value: "zdivo", label: "Zdivo a tvárnice" },
          { value: "suche-smesi", label: "Suché směsi a omítky" },
          { value: "izolace", label: "Izolace" },
          { value: "obklady", label: "Obklady a dlažby" },
          { value: "chemie", label: "Stavební chemie" },
          { value: "instalace", label: "Instalatérský materiál" },
          { value: "elektro", label: "Elektroinstalace" },
          { value: "sadrokarton", label: "Sádrokarton" },
          { value: "rezivo", label: "Řezivo a deskový materiál" },
          { value: "spojovaci", label: "Spojovací materiál" },
          { value: "barvy", label: "Barvy a nátěry" },
          { value: "bozp", label: "Ochranné pomůcky" },
          { value: "spotrebni", label: "Spotřební materiál" },
        ],
      },
      {
        key: "sklad.unit",
        name: "Jednotky materiálu",
        items: ["ks", "m", "m²", "m³", "kg", "t", "l", "bal", "pal", "sada", "role", "pytel"].map(
          (u) => ({ value: u, label: u }),
        ),
      },
    ],
  },
});
