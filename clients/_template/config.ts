import { defineClientConfig } from "@rebar/core";

/**
 * Konfigurace klienta. Validuje se při startu aplikace; neplatná konfigurace
 * aplikaci nenastartuje a vypíše, co je špatně.
 * Vytvoření nového klienta: `pnpm client:new <slug>`.
 */
const MODULES = ["kontakty", "zakazky"] as const;

export default defineClientConfig({
  slug: "novy-klient",

  branding: {
    name: "Název systému klienta", // název systému, jak ho uvidí uživatelé klienta
    shortName: "Systém",
    accentColor: "#2563eb",
    // logo: "logo.svg", // soubor v branding/
    // supportEmail: "podpora@klient.cz",
  },

  // Zapnuté moduly (závislosti se kontrolují při startu).
  modules: [...MODULES],

  // Pořadí sekcí postranního panelu (sekce, které tu nejsou, jdou za nimi v pořadí modulů).
  // navigation: { groupOrder: ["Práce", "CRM"] },

  // Upozornění (push, zvoneček, e-mail): výchozí pravidla firmy; správce je dál upravuje v Nastavení → Pravidla upozornění.
  // Seznam událostí (klíče, příjemci, parametry textu) je v docs/NOTIFICATIONS.md a v Nastavení → Pravidla upozornění.
  // Neznámý klíč události nebo příjemce nenechá aplikaci nastartovat (hlídá to i `pnpm config:check`).
  // notifications: {
  //   quietHours: { enabled: true, start: "20:00", end: "06:00" },
  //   digestTimes: ["07:00", "16:00"],
  //   events: { "task.assigned": { title: "Nový úkol od {author}", body: "{title}\nTermín: {due}" } },
  // },

  // security: { idleTimeoutMinutes: 480, require2faRoles: ["owner", "admin"] },
  // agency: { serviceAccess: "off" },

  // Vlastní nástěnky: výchozí sady podle rolí. Zakládají se jednou při instalaci a aktualizaci; správce je pak upravuje
  // v aplikaci. Sadu složíte přes `seedDashboard` z `@rebar/core/dashboards-shared` (docs/DASHBOARDY.md).
  dashboards: { enabled: true, defaults: [] },

  // Exporty: oddělovač CSV (`;` pro českou verzi Excelu, `,` pro anglickou), plánované exporty, doba uchování souborů.
  exports: {
    enabled: true,
    csvDelimiter: ";",
    scheduled: true,
    syncMaxRows: 5000,
    retentionDays: 7,
  },
});
