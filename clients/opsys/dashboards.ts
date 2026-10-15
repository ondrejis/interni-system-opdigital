import { seedDashboard, type DashboardSeed, type SeedWidget } from "@rebar/core/dashboards-shared";

/*
  Výchozí přehledy OPSYS (PRE-03). Jsou to vzory pro role `owner` a `partner`: při prvním otevření Přehledu dostane
  každý uživatel jejich osobní kopie a dál je upravuje sám (`ensurePersonalBoards`). Widgety mají stejné definice jako
  katalog v `@rebar/prehled/presets` (hlídá je `tests/prehled.int.test.ts`); zdroje jsou jen metriky a dlaždice zapnutých
  modulů, takže widget vypnutého modulu ukáže větu, ne chybu.

  Soukromí: partner nedostane widgety Expirace ani Retainery z Můj prostor (jen vlastník) a žádný widget nevrací
  součty se soukromými záznamy (metriky i entity jdou přes `privateScope`).
*/

const tile = (title: string, id: string, w: number, h: number): SeedWidget => ({
  type: "builtin",
  title,
  w,
  h,
  source: { kind: "builtin", builtin: "tiles", params: { tileIds: [id] } },
});

const metric = (
  type: SeedWidget["type"],
  title: string,
  key: string,
  w: number,
  h: number,
  params?: Record<string, string | number | boolean>,
  options?: SeedWidget["options"],
): SeedWidget => ({
  type,
  title,
  w,
  h,
  source: { kind: "metric", metric: key, ...(params ? { params } : {}) },
  ...(options ? { options } : {}),
});

/** „Den“: úkoly na dnes, pipeline, příjmy, zakázky ve skluzu, saldo a poslední změny. */
const den = (): SeedWidget[] => [
  {
    type: "list",
    title: "Úkoly na dnes",
    w: 6,
    h: 3,
    source: { kind: "builtin", builtin: "my_tasks" },
  },
  tile("Pipeline v Kč", "obchody.pipeline", 6, 2),
  metric("kpi", "Příjmy tento měsíc", "finance.income_month", 6, 1, { view: "mine" }),
  tile("Zakázky ve skluzu", "zakazky.slipping", 6, 2),
  tile("Saldo vyrovnání", "finance.balance", 6, 2),
  metric("list", "Poslední změny", "prehled.recent_changes", 12, 3, { scope: "all" }),
];

/** „Finance“ pro oba: příjmy, saldo, nezaplacené platby, příjmy podle osoby a retainery. */
const finance = (): SeedWidget[] => [
  metric("kpi", "Příjmy tento měsíc", "finance.income_month", 4, 1, { view: "mine" }),
  metric("kpi", "Retainery (měsíčně)", "finance.retainers", 4, 1),
  metric("kpi", "Aktivní retainery", "finance.retainers_count", 4, 1),
  tile("Saldo vyrovnání", "finance.balance", 6, 2),
  tile("Nezaplacené platby", "finance.unpaid", 6, 2),
  metric("chart", "Příjmy podle osoby", "finance.income_by_person", 12, 3, undefined, {
    chart: "stacked",
    format: "money",
  }),
];

/** Jen vlastník: expirace domén a hostingů a opakovaný příjem z hostingu (Můj prostor). */
const ownerOnly = (): SeedWidget[] => [
  metric("kpi", "Hosting a údržba (měsíčně)", "muj-prostor.retainers", 4, 1),
  metric("table", "Expirace domén a hostingů", "muj-prostor.expirations", 8, 3, { days: 60 }),
];

export function opsysDashboards(): DashboardSeed[] {
  return [
    seedDashboard({ key: "owner-den", name: "Den", role: "owner", widgets: den() }),
    seedDashboard({
      key: "owner-finance",
      name: "Finance",
      role: "owner",
      widgets: [...finance(), ...ownerOnly()],
    }),
    seedDashboard({ key: "partner-den", name: "Den", role: "partner", widgets: den() }),
    seedDashboard({ key: "partner-finance", name: "Finance", role: "partner", widgets: finance() }),
  ];
}
