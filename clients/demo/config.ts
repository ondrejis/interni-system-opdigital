import { defineClientConfig } from "@rebar/core";
import { standardDashboards } from "@rebar/core/dashboards-shared";

/** Ukázkový klient pro prezentace: fiktivní stavební firma s realistickými daty (seed ve fázi 6). */
const MODULES = [
  "kontakty",
  "poptavky",
  "zakazky",
  "realizace",
  "fakturace",
  "dochazka",
  "sklad",
  "stroje",
  "kalendar",
] as const;

export default defineClientConfig({
  slug: "demo",

  branding: {
    name: "Demo firma s.r.o.",
    shortName: "Demo firma",
    accentColor: "#2563eb",
    supportEmail: "info@opdigital.cz",
  },

  modules: [...MODULES],

  // Upozornění (push, zvoneček, e-mail): výchozí pravidla firmy. Správce je dál upravuje v Nastavení → Pravidla upozornění,
  // každý uživatel si nastaví předvolby v Nastavení → Upozornění. Podrobně docs/NOTIFICATIONS.md.
  notifications: {
    quietHours: { enabled: true, start: "20:00", end: "06:00" }, // push se v noci zdrží (naléhavé projdou)
    digestTimes: ["07:00", "16:00"], // kdy chodí shrnutí těm, kdo si zvolili „Shrnutí“
    events: {
      // povinné: nejdou vypnout (schválení a splatné faktury nesmí uniknout)
      "approval.request": { mandatory: true },
      "invoice.overdue": { mandatory: true },
    },
  },

  // Mobilní terminál řemeslníka: montér (role worker) po přihlášení vidí jen terminál, mistr si ho může otevřít.
  terminal: {
    roles: ["worker"],
    tiles: [
      { widget: "dochazka.clock" },
      { widget: "zakazky.today" },
      { widget: "core.tasks" },
      { widget: "realizace.diary" },
      { widget: "sklad.issue" },
      { widget: "realizace.report" },
      { widget: "stroje.fleet" },
    ],
    attendance: { requireJob: false, allowJobChange: true, showHours: true },
    diary: { requirePhoto: false },
  },

  // Vlastní nástěnky: výchozí sady podle rolí (majitel, kancelář, mistr, účetní) pro zapnuté moduly. Zakládají se jednou
  // při instalaci a aktualizaci; správce je pak upravuje v aplikaci. Vlastní sadu složíte přes `seedDashboard` (docs/DASHBOARDY.md).
  dashboards: { enabled: true, defaults: standardDashboards(MODULES) },

  // Exporty: oddělovač CSV (`;` pro českou verzi Excelu, `,` pro anglickou), plánované exporty, doba uchování souborů.
  exports: {
    enabled: true,
    csvDelimiter: ";",
    scheduled: true,
    syncMaxRows: 5000,
    retentionDays: 7,
  },
});
