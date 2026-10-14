import { defineClientConfig } from "@rebar/core";
import { standardDashboards } from "@rebar/core/dashboards-shared";

/**
 * Konfigurace klienta. Validuje se při startu aplikace; neplatná konfigurace
 * aplikaci nenastartuje a vypíše, co je špatně.
 * Vytvoření nového klienta: `pnpm client:new <slug>`.
 */
const MODULES = ["kontakty", "poptavky", "zakazky", "realizace", "fakturace", "dochazka"] as const;

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

  // Upozornění (push, zvoneček, e-mail): výchozí pravidla firmy; správce je dál upravuje v Nastavení → Pravidla upozornění.
  // Seznam událostí (klíče, příjemci, parametry textu) je v docs/NOTIFICATIONS.md a v Nastavení → Pravidla upozornění.
  // Neznámý klíč události nebo příjemce nenechá aplikaci nastartovat (hlídá to i `pnpm config:check`).
  // notifications: {
  //   quietHours: { enabled: true, start: "20:00", end: "06:00" },
  //   digestTimes: ["07:00", "16:00"],
  //   events: {
  //     "approval.request": { mandatory: true }, // nejde vypnout
  //     "kalendar.reminder": { channels: { email: false } },
  //     "invoice.overdue": { recipients: ["perm:fakturace.write", "role:owner"], severity: "urgent" },
  //     "task.assigned": { title: "Nový úkol od {author}", body: "{title}\nTermín: {due}" },
  //   },
  // },

  // Mobilní terminál řemeslníka (docs/TERMINAL.md). Výchozí hodnoty; správce je může změnit v Nastavení → Terminál řemeslníka.
  // Dlaždice zapnutých modulů, které tu nejsou uvedené, se přidají na konec. Dlaždice vypnutého modulu se nezobrazí.
  terminal: {
    roles: ["worker"], // role, které po přihlášení vidí jen terminál (ostatní si ho mohou otevřít jako náhled)
    tiles: [
      { widget: "dochazka.clock" },
      { widget: "zakazky.today" },
      { widget: "core.tasks" },
      { widget: "realizace.diary" },
      { widget: "realizace.report" },
      // { widget: "sklad.issue", enabled: false }, // vypnutá dlaždice; label: "Jiný název" ji přejmenuje
    ],
    attendance: { requireJob: false, allowJobChange: true, showHours: true },
    diary: { requirePhoto: false },
  },

  // security: { idleTimeoutMinutes: 480, require2faRoles: ["owner", "admin"] },
  // agency: { serviceAccess: "off" },

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
