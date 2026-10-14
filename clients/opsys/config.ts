import { defineClientConfig } from "@rebar/core";
import { opsysDashboards } from "./dashboards";

/** Interní systém agentury OP Digital (vlastník Ondřej Dvořák, partner Patrik Šilhánek). */
const MODULES = ["kontakty", "zakazky", "poptavky", "dochazka", "kalendar"] as const;

export default defineClientConfig({
  slug: "opsys",

  branding: {
    name: "OPSYS",
    shortName: "OPSYS",
    accentColor: "#2563eb",
    supportEmail: "info@opdigital.cz",
  },

  modules: [...MODULES],

  // Pořadí sekcí postranního panelu (sekce, které tu nejsou, jdou za nimi).
  navigation: { groupOrder: ["Práce", "CRM", "Realizace", "Finance", "Marketing", "Můj prostor"] },

  // OPSYS nepoužívá upozornění (e-mail, push, zvonek): moduly neregistrují události; platformní kód zůstává v jádru.

  security: { require2faRoles: ["owner", "partner"] },

  // Výchozí nástěnky rolí (zakládají se jednou, správce je pak upravuje v aplikaci). Podrobně docs/DASHBOARDY.md.
  dashboards: { enabled: true, defaults: opsysDashboards() },

  exports: {
    enabled: true,
    csvDelimiter: ";",
    scheduled: true,
    syncMaxRows: 5000,
    retentionDays: 7,
  },
});
