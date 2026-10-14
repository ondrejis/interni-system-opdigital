import { defineModule } from "@rebar/core/manifest";

export const manifest = defineModule({
  id: "sablony-emailu",
  name: "Šablony e-mailů",
  description:
    "Šablony e-mailů s proměnnými z klienta, kontaktu, obchodu a zakázky; otevření připraveného e-mailu v Gmailu nebo kopie do schránky.",
  icon: "mail-template",
  dependsOn: ["kontakty"],
  nav: [
    {
      label: "Šablony e-mailů",
      href: "/sablony-emailu",
      icon: "mail-template",
      permission: "sablony-emailu.read",
      group: "Marketing",
      order: 20,
    },
  ],
  entities: ["email_template"],
  permissions: [
    { key: "sablony-emailu.read", label: "Vidí šablony e-mailů" },
    { key: "sablony-emailu.create", label: "Zakládá šablony e-mailů" },
    { key: "sablony-emailu.write", label: "Upravuje šablony e-mailů" },
    { key: "sablony-emailu.delete", label: "Maže šablony e-mailů" },
  ],
});
