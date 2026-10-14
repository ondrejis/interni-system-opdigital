import { defineModule } from "@rebar/core/manifest";
import { strojeNotifications } from "./notifications";

export const manifest = defineModule({
  id: "stroje",
  name: "Stroje a vozidla",
  description:
    "Evidence strojů a vozidel, kniha jízd a motohodiny, tankování se spotřebou, servis a servisní intervaly, termíny STK a pojištění, rezervace s kontrolou kolizí a závady z terénu.",
  icon: "truck",
  nav: [
    {
      label: "Stroje a vozidla",
      href: "/stroje",
      icon: "truck",
      permission: "stroje.read",
      group: "Provoz",
    },
    {
      label: "Evidence strojů",
      href: "/stroje/evidence",
      icon: "wrench",
      permission: "stroje.read",
      parent: "/stroje",
    },
    {
      label: "Závady strojů",
      href: "/stroje/zavady",
      icon: "alert-triangle",
      permission: "stroje.read",
      parent: "/stroje",
    },
  ],
  pages: [{ path: "/stroje", title: "Stroje a vozidla", permission: "stroje.read" }],
  permissions: [
    {
      key: "stroje.read",
      label: "Vidí stroje a vozidla",
      description: "Rozsah „jen moje“ = stroje, za které odpovídá",
    },
    {
      key: "stroje.log",
      label: "Zapisuje jízdy a tankování",
      description: "Také nahlašuje závady",
    },
    {
      key: "stroje.write",
      label: "Spravuje vozový park",
      description: "Karty, servis, rezervace, zápisy za ostatní, závady",
    },
  ],
  entities: ["asset", "asset_defect"],
  notifications: strojeNotifications,
  terminalWidgets: [
    {
      key: "stroje.fleet",
      label: "Stroje",
      description: "Zápis provozu stroje nebo vozidla a hlášení závady.",
      icon: "truck",
      permission: ["stroje.log", "stroje.read"],
      commands: ["stroje.log.save", "stroje.defect.report"],
      page: true,
    },
  ],
});
