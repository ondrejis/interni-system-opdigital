import { seedDashboard, type DashboardSeed } from "@rebar/core/dashboards-shared";

/**
 * Výchozí nástěnky OPSYS: majitel a partner. Zdroje jsou jen entity a vestavěné bloky jádra, takže přežijí
 * přepracování modulů; metriky modulů se doplní, až budou hotové.
 */
export function opsysDashboards(): DashboardSeed[] {
  return [
    seedDashboard({
      key: "majitel-prehled",
      name: "Majitel: přehled",
      role: "owner",
      widgets: [
        {
          type: "builtin",
          title: "Vyžaduje pozornost",
          w: 6,
          h: 3,
          source: { kind: "builtin", builtin: "attention" },
        },
        {
          type: "list",
          title: "Moje úkoly",
          w: 6,
          h: 3,
          source: { kind: "builtin", builtin: "my_tasks" },
        },
        {
          type: "status",
          title: "Zakázky podle stavu",
          source: {
            kind: "entity",
            entity: "job",
            agg: { fn: "count" },
            groupBy: { attr: "stage" },
            limit: 20,
          },
        },
      ],
    }),
    seedDashboard({
      key: "partner-prehled",
      name: "Partner: přehled",
      role: "partner",
      widgets: [
        {
          type: "builtin",
          title: "Vyžaduje pozornost",
          w: 6,
          h: 3,
          source: { kind: "builtin", builtin: "attention" },
        },
        {
          type: "list",
          title: "Moje úkoly",
          w: 6,
          h: 3,
          source: { kind: "builtin", builtin: "my_tasks" },
        },
      ],
    }),
  ];
}
