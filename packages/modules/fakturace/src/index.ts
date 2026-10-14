import { defineModule } from "@rebar/core/manifest";
import { FAKTURACE_NOTIFICATIONS } from "./notifications";

export const manifest = defineModule({
  id: "fakturace",
  name: "Fakturace",
  description:
    "Zálohové, průběžné a konečné faktury z položek zakázky, platby, dobropisy, PDF s QR platbou, odesílání e-mailem s upomínkami, export (XLSX, balík pro účetní), šablony dokladů.",
  icon: "receipt",
  dependsOn: ["zakazky", "kontakty"],
  nav: [
    {
      label: "Faktury",
      href: "/fakturace",
      icon: "receipt",
      permission: "fakturace.read",
      group: "Obchod",
    },
    {
      label: "Přijaté faktury",
      href: "/fakturace/prijate",
      icon: "receipt",
      permission: "fakturace.read",
      parent: "/fakturace",
    },
    {
      label: "Export pro účetní",
      href: "/fakturace/export",
      icon: "file-stack",
      permission: "fakturace.export",
      parent: "/fakturace",
    },
  ],
  pages: [
    { path: "/fakturace/export", title: "Export faktur", permission: "fakturace.export" },
    { path: "/fakturace/nastaveni", title: "Nastavení fakturace", permission: "settings.manage" },
  ],
  permissions: [
    { key: "fakturace.read", label: "Vidí faktury" },
    {
      key: "fakturace.write",
      label: "Vystavuje faktury",
      description: "Koncepty, vystavení, úhrady, dobropisy",
    },
    { key: "fakturace.export", label: "Exportuje faktury do účetnictví" },
  ],
  entities: ["invoice", "received_invoice"],
  notifications: FAKTURACE_NOTIFICATIONS,
  seed: {
    series: [
      { key: "fakturace.zalohova", pattern: "ZF-{YYYY}-{NNNN}" },
      { key: "fakturace.faktura", pattern: "FV-{YYYY}-{NNNN}" },
      { key: "fakturace.dobropis", pattern: "DB-{YYYY}-{NNNN}" },
    ],
  },
});
