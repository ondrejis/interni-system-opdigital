import {
  NO_VIEW_ID,
  type DashboardWidget,
  type WidgetPresetDef,
} from "@rebar/core/dashboards-shared";

/*
  Katalog hotových widgetů Přehledu (PRE-04, PRE-05, PRE-06). Každý widget je jen definice nad tím, co dodávají moduly:
  jejich `dashboardMetrics` (čísla, grafy), dlaždice (`widgets`, builtin „tiles“) a seznamy. Nic se tu nepočítá a žádný
  modul se neimportuje: widget je v nabídce, jen když jeho metriky existují (modul je zapnutý) a aktér na ně má
  oprávnění (`presetAvailable` v `@rebar/core/dashboards`). Widget zapnutého modulu bez oprávnění se proto nenabízí a
  Patrik nikdy nedostane Expirace ani Retainery z Můj prostor (oprávnění `muj-prostor.*` partner nemá).
  Reklama (REK-A) a Kalendář (KAL-A/B) dodají metriky `reklama.*` a `kalendar.upcoming` samy; zde jsou jen vazby.
*/

const tile = (...tileIds: string[]) => ({
  kind: "builtin" as const,
  builtin: "tiles" as const,
  params: { tileIds },
});
const metric = (key: string, params?: Record<string, string | number | boolean>) => ({
  kind: "metric" as const,
  metric: key,
  ...(params ? { params } : {}),
});

/** Příjmy tento měsíc podle R-41: můj podíl zaplaceno / vystaveno / plánováno. */
export const INCOME: Omit<DashboardWidget, "id">[] = [
  {
    type: "kpi",
    title: "Příjmy tento měsíc: zaplaceno",
    w: 4,
    h: 1,
    source: metric("finance.income_month", { view: "mine" }),
  },
  {
    type: "kpi",
    title: "Příjmy tento měsíc: vystaveno",
    w: 4,
    h: 1,
    source: metric("finance.income_month_issued"),
  },
  {
    type: "kpi",
    title: "Příjmy tento měsíc: plánováno",
    w: 4,
    h: 1,
    source: metric("finance.income_month_planned"),
  },
];

/** Nezaplacené platby: dlaždice financí (po splatnosti) a součet plateb blízko splatnosti. */
export const UNPAID: Omit<DashboardWidget, "id">[] = [
  { type: "builtin", title: "Nezaplacené platby", w: 6, h: 2, source: tile("finance.unpaid") },
  {
    type: "kpi",
    title: "Blízko splatnosti (7 dní)",
    w: 6,
    h: 1,
    source: metric("finance.unpaid_soon", { days: 7 }),
  },
];

export const WIDGET_PRESETS: readonly WidgetPresetDef[] = [
  /* ---------- MVP ---------- */
  {
    key: "ukoly-dnes",
    group: "Úkoly",
    phase: "mvp",
    title: "Úkoly na dnes",
    description:
      "Moje úkoly na dnes a po termínu; odškrtnout jdou přímo ve widgetu. V nastavení jde přidat i delegované.",
    widget: {
      type: "list",
      title: "Úkoly na dnes",
      w: 6,
      h: 3,
      source: { kind: "builtin", builtin: "my_tasks" },
    },
    requires: { builtins: ["my_tasks"], entities: ["task"] },
    configure: false,
  },
  {
    key: "ukoly-po-terminu",
    group: "Úkoly",
    phase: "mvp",
    title: "Úkoly po termínu",
    description: "Počet mých otevřených úkolů po termínu.",
    widget: { type: "kpi", title: "Úkoly po termínu", w: 3, h: 1, source: metric("ukoly.overdue") },
    requires: { metrics: ["ukoly.overdue"] },
  },
  {
    key: "pipeline",
    group: "Obchody",
    phase: "mvp",
    title: "Pipeline v Kč",
    description: "Součet hodnoty otevřených obchodů a vážený součet podle pravděpodobnosti fází.",
    widget: {
      type: "builtin",
      title: "Pipeline v Kč",
      w: 4,
      h: 1,
      source: tile("obchody.pipeline"),
    },
    requires: { metrics: ["obchody.pipeline_total", "obchody.pipeline_weighted"] },
  },
  {
    key: "pipeline-faze",
    group: "Obchody",
    phase: "mvp",
    title: "Pipeline podle fází",
    description: "Hodnota a vážená hodnota otevřených obchodů v jednotlivých fázích.",
    widget: {
      type: "chart",
      title: "Pipeline podle fází",
      w: 6,
      h: 3,
      source: metric("obchody.pipeline_value"),
      options: { chart: "bar", format: "money" },
    },
    requires: { metrics: ["obchody.pipeline_value"] },
  },
  {
    key: "moje-obchody",
    group: "Obchody",
    phase: "mvp",
    title: "Moje otevřené obchody",
    description: "Počet mých otevřených obchodů a kolik z nich nemá naplánovanou další aktivitu.",
    widget: {
      type: "builtin",
      title: "Moje otevřené obchody",
      w: 4,
      h: 1,
      source: tile("obchody.my_open"),
    },
    requires: { metrics: ["obchody.my_open"] },
  },
  {
    key: "zakazky-skluz",
    group: "Zakázky",
    phase: "mvp",
    title: "Zakázky ve skluzu",
    description: "Živé zakázky po termínu nebo s úkoly po termínu.",
    widget: {
      type: "builtin",
      title: "Zakázky ve skluzu",
      w: 4,
      h: 1,
      source: tile("zakazky.slipping"),
    },
    requires: { metrics: ["zakazky.slipping"] },
  },
  {
    key: "zakazky-stavy",
    group: "Zakázky",
    phase: "mvp",
    title: "Zakázky podle stavu",
    description: "Kolik zakázek je v jakém stavu.",
    widget: {
      type: "status",
      title: "Zakázky podle stavu",
      w: 6,
      h: 2,
      source: metric("zakazky.by_status"),
    },
    requires: { metrics: ["zakazky.by_status"] },
  },
  {
    key: "prijmy-mesic",
    group: "Finance",
    phase: "mvp",
    title: "Příjmy tento měsíc",
    description:
      "Můj podíl tento měsíc: zaplaceno, vystaveno (čeká na zaplacení) a plánováno. Přidá tři čísla vedle sebe.",
    widget: INCOME[0]!,
    widgets: INCOME,
    requires: {
      metrics: [
        "finance.income_month",
        "finance.income_month_issued",
        "finance.income_month_planned",
      ],
    },
  },
  {
    key: "prijmy-osoby",
    group: "Finance",
    phase: "mvp",
    title: "Příjmy podle osoby",
    description: "Příjmy po měsících v roce podle osoby.",
    widget: {
      type: "chart",
      title: "Příjmy podle osoby",
      w: 6,
      h: 3,
      source: metric("finance.income_by_person"),
      options: { chart: "stacked", format: "money" },
    },
    requires: { metrics: ["finance.income_by_person"] },
  },
  {
    key: "saldo",
    group: "Finance",
    phase: "mvp",
    title: "Saldo vyrovnání",
    description: "Kdo komu dluží a kolik; odkaz na vyrovnání.",
    widget: {
      type: "builtin",
      title: "Saldo vyrovnání",
      w: 4,
      h: 1,
      source: tile("finance.balance"),
    },
    requires: { metrics: ["finance.balance"] },
  },
  {
    key: "nezaplacene",
    group: "Finance",
    phase: "mvp",
    title: "Nezaplacené platby",
    description:
      "Vystavené a nezaplacené platby, kolik z nich je po splatnosti, a součet plateb blízko splatnosti (7 dní).",
    widget: UNPAID[0]!,
    widgets: UNPAID,
    requires: { metrics: ["finance.unpaid", "finance.unpaid_soon"] },
  },
  {
    key: "posledni-zmeny",
    group: "Přehled",
    phase: "mvp",
    title: "Poslední změny",
    description: "Co se v systému naposledy dělo (jen sdílené záznamy; soukromé vidí jen Ondřej).",
    widget: {
      type: "list",
      title: "Poslední změny",
      w: 6,
      h: 3,
      source: metric("prehled.recent_changes", { scope: "all" }),
    },
    requires: { metrics: ["prehled.recent_changes"] },
  },
  {
    key: "rychle-odkazy",
    group: "Přehled",
    phase: "mvp",
    title: "Rychlé odkazy",
    description: "Vlastní odkazy a uložené pohledy po ruce.",
    widget: {
      type: "list",
      title: "Rychlé odkazy",
      w: 4,
      h: 2,
      source: { kind: "links", links: [], viewIds: [] },
    },
    configure: true,
  },
  {
    key: "cislo-z-pohledu",
    group: "Pohledy",
    phase: "mvp",
    title: "Číslo z pohledu",
    description: "Jedno číslo (počet nebo součet pole) z libovolného uloženého pohledu.",
    widget: {
      type: "kpi",
      title: "Číslo z pohledu",
      w: 3,
      h: 1,
      source: { kind: "view", viewId: NO_VIEW_ID, agg: { fn: "count" } },
    },
    configure: true,
  },
  {
    key: "seznam-z-pohledu",
    group: "Pohledy",
    phase: "mvp",
    title: "Seznam z pohledu",
    description: "Prvních N řádků libovolného uloženého pohledu.",
    widget: {
      type: "table",
      title: "Seznam z pohledu",
      w: 6,
      h: 3,
      source: { kind: "view", viewId: NO_VIEW_ID, limit: 10 },
    },
    configure: true,
  },

  /* ---------- v2 ---------- */
  {
    key: "schuzky",
    group: "Kalendář",
    phase: "v2",
    title: "Nadcházející schůzky",
    description: "Schůzky dnes a zítra.",
    widget: {
      type: "list",
      title: "Nadcházející schůzky",
      w: 6,
      h: 2,
      source: metric("kalendar.upcoming"),
    },
    requires: { metrics: ["kalendar.upcoming"] },
  },
  {
    key: "leady-cpl",
    group: "Reklama",
    phase: "v2",
    title: "Leady a CPL",
    description: "Leady z reklam za posledních 30 dní, útrata a cena za lead.",
    widget: { type: "builtin", title: "Leady a CPL", w: 4, h: 1, source: tile("reklama.leads") },
    requires: { metrics: ["reklama.leads", "reklama.cpl"] },
  },
  {
    key: "naklad-na-vyhru",
    group: "Reklama",
    phase: "v2",
    title: "Náklad na vyhraný obchod",
    description: "Útrata na reklamy dělená počtem vyhraných obchodů z leadů.",
    widget: {
      type: "kpi",
      title: "Náklad na vyhraný obchod",
      w: 3,
      h: 1,
      source: metric("reklama.cost_per_won"),
      options: { compare: "none" },
    },
    requires: { metrics: ["reklama.cost_per_won"] },
  },
  {
    key: "hodiny-tyden",
    group: "Hodiny",
    phase: "v2",
    title: "Hodiny tento týden",
    description: "Odpracovaný čas tento týden.",
    widget: { type: "kpi", title: "Hodiny tento týden", w: 3, h: 1, source: metric("hodiny.week") },
    requires: { metrics: ["hodiny.week"] },
  },
  {
    key: "hodiny-zakazky",
    group: "Hodiny",
    phase: "v2",
    title: "Hodiny podle zakázky",
    description: "Kolik času se odpracovalo na jednotlivých zakázkách.",
    widget: {
      type: "chart",
      title: "Hodiny podle zakázky",
      w: 6,
      h: 3,
      source: metric("hodiny.by_job", { by: "job" }),
      options: { chart: "bar", format: "minutes" },
    },
    requires: { metrics: ["hodiny.by_job"] },
  },
  {
    key: "expirace",
    group: "Můj prostor",
    phase: "v2",
    title: "Expirace",
    description: "Domény a hostingy, kterým do 60 dní vyprší platnost (jen Ondřej).",
    widget: {
      type: "table",
      title: "Expirace domén a hostingů",
      w: 6,
      h: 3,
      source: metric("muj-prostor.expirations", { days: 60 }),
    },
    requires: { metrics: ["muj-prostor.expirations"] },
  },
  {
    key: "retainery",
    group: "Finance",
    phase: "v2",
    title: "Retainery (měsíčně)",
    description: "Měsíční součet aktivních retainerů.",
    widget: {
      type: "kpi",
      title: "Retainery (měsíčně)",
      w: 3,
      h: 1,
      source: metric("finance.retainers"),
    },
    requires: { metrics: ["finance.retainers"] },
  },
  {
    key: "retainery-pocet",
    group: "Finance",
    phase: "v2",
    title: "Aktivní retainery",
    description: "Počet aktivních retainerů.",
    widget: {
      type: "kpi",
      title: "Aktivní retainery",
      w: 3,
      h: 1,
      source: metric("finance.retainers_count"),
    },
    requires: { metrics: ["finance.retainers_count"] },
  },
  {
    key: "hosting-prijem",
    group: "Můj prostor",
    phase: "v2",
    title: "Hosting a údržba (měsíčně)",
    description: "Opakovaný měsíční příjem z hostingu a údržby (jen Ondřej).",
    widget: {
      type: "kpi",
      title: "Hosting a údržba (měsíčně)",
      w: 3,
      h: 1,
      source: metric("muj-prostor.retainers"),
    },
    requires: { metrics: ["muj-prostor.retainers"] },
  },
];
