// Výchozí sady nástěnek pro role stavebních a řemeslných firem. Klient je v `config.ts` použije tak, jak jsou
// (`standardDashboards(modules)`), upraví, nebo nahradí vlastními; nástěnky se zakládají jen jednou (viz `ensureSeedDashboards`).

import type { ModuleId } from "../modules/ids";
import { seedDashboard, type DashboardSeed, type SeedWidget } from "./seed";

type Tagged = SeedWidget & {
  /** Moduly, které widget potřebuje; bez nich se do nástěnky nedostane. */
  needs?: readonly ModuleId[];
};

const jobFilterActive = {
  op: "and" as const,
  conditions: [{ attr: "phase", op: "is_any_of" as const, value: ["execution", "handover"] }],
};

const OWNER: Tagged[] = [
  {
    needs: ["zakazky"],
    type: "kpi",
    title: "Marže zakázek",
    source: { kind: "metric", metric: "zakazky.margin_total" },
  },
  {
    needs: ["zakazky"],
    type: "kpi",
    title: "Marže v %",
    source: { kind: "metric", metric: "zakazky.margin_pct" },
  },
  {
    needs: ["zakazky"],
    type: "kpi",
    title: "Nevyfakturováno",
    source: { kind: "metric", metric: "zakazky.unbilled" },
  },
  {
    needs: ["fakturace"],
    type: "kpi",
    title: "Faktury po splatnosti",
    source: { kind: "metric", metric: "fakturace.overdue" },
  },
  {
    needs: ["zakazky"],
    type: "chart",
    title: "Zakázky: marže",
    w: 6,
    h: 3,
    source: { kind: "metric", metric: "zakazky.margin", limit: 8 },
    options: { chart: "bar" },
  },
  {
    needs: ["zakazky"],
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
  {
    needs: ["fakturace"],
    type: "chart",
    title: "Cashflow proti plánu",
    w: 8,
    h: 3,
    source: { kind: "metric", metric: "fakturace.cashflow_plan", bucket: "month" },
    options: { chart: "bar" },
  },
  {
    needs: ["fakturace"],
    type: "table",
    title: "Faktury po splatnosti",
    w: 4,
    h: 3,
    source: {
      kind: "metric",
      metric: "fakturace.overdue_by_customer",
      limit: 8,
    },
  },
  {
    needs: ["dochazka"],
    type: "chart",
    title: "Využití lidí",
    w: 6,
    h: 3,
    source: { kind: "metric", metric: "dochazka.utilization", limit: 10 },
    options: { chart: "bar" },
  },
  {
    needs: ["stroje"],
    type: "chart",
    title: "Využití strojů",
    w: 6,
    h: 3,
    source: { kind: "metric", metric: "stroje.utilization", limit: 10 },
    options: { chart: "bar" },
  },
];

const OFFICE: Tagged[] = [
  {
    needs: ["poptavky"],
    type: "kpi",
    title: "Poptávky celkem",
    source: { kind: "entity", entity: "inquiry", agg: { fn: "count" } },
  },
  {
    needs: ["poptavky"],
    type: "status",
    title: "Poptávky podle stavu",
    source: {
      kind: "entity",
      entity: "inquiry",
      agg: { fn: "count" },
      groupBy: { attr: "stage" },
      limit: 20,
    },
  },
  {
    needs: ["zakazky"],
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
  {
    needs: ["zakazky"],
    type: "chart",
    title: "Zakázky k fakturaci",
    w: 6,
    h: 3,
    source: { kind: "metric", metric: "zakazky.unbilled_by_job", limit: 8 },
    options: { chart: "bar" },
  },
  {
    needs: ["fakturace"],
    type: "list",
    title: "Faktury po splatnosti",
    w: 6,
    h: 3,
    source: {
      kind: "records",
      entity: "invoice",
      filters: { op: "and", conditions: [{ attr: "overdue", op: "is_true" }] },
      columns: ["number", "company", "dueDate", "state"],
      sort: [{ attr: "dueDate", dir: "asc" }],
      limit: 8,
    },
  },
  {
    type: "builtin",
    title: "Vyžaduje pozornost (schvalování, termíny)",
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
];

const FOREMAN: Tagged[] = [
  {
    needs: ["zakazky"],
    type: "list",
    title: "Dnešní stavby",
    w: 6,
    h: 3,
    source: {
      kind: "records",
      entity: "job",
      filters: jobFilterActive,
      columns: ["title", "address", "endDate", "stage"],
      sort: [{ attr: "endDate", dir: "asc" }],
      limit: 8,
    },
  },
  {
    type: "list",
    title: "Moje úkoly",
    w: 6,
    h: 3,
    source: { kind: "builtin", builtin: "my_tasks" },
  },
  {
    needs: ["dochazka"],
    type: "kpi",
    title: "Odpracováno v období",
    source: { kind: "metric", metric: "dochazka.hours" },
  },
  {
    needs: ["dochazka"],
    type: "chart",
    title: "Docházka týmu (hodiny)",
    w: 8,
    h: 3,
    source: { kind: "metric", metric: "dochazka.hours_by", params: { by: "person" }, limit: 10 },
    options: { chart: "bar" },
  },
  {
    needs: ["realizace"],
    type: "table",
    title: "Otevřené vady",
    w: 6,
    h: 3,
    source: {
      kind: "records",
      entity: "defect",
      columns: ["title", "job", "state"],
      limit: 8,
    },
  },
];

const ACCOUNTANT: Tagged[] = [
  {
    needs: ["fakturace"],
    type: "kpi",
    title: "Přijaté faktury k úhradě",
    source: { kind: "metric", metric: "fakturace.received_open" },
  },
  {
    needs: ["fakturace"],
    type: "kpi",
    title: "Vydané po splatnosti",
    source: { kind: "metric", metric: "fakturace.overdue" },
  },
  {
    needs: ["fakturace"],
    type: "kpi",
    title: "Splatné do 14 dní",
    source: { kind: "metric", metric: "fakturace.due_soon", params: { days: "14" } },
  },
  {
    needs: ["fakturace"],
    type: "kpi",
    title: "Vystaveno v období (bez DPH)",
    source: { kind: "metric", metric: "fakturace.issued" },
    options: { compare: "previous_period" },
  },
  {
    needs: ["fakturace"],
    type: "list",
    title: "Přijaté faktury podle splatnosti",
    w: 6,
    h: 4,
    source: {
      kind: "records",
      entity: "received_invoice",
      filters: { op: "and", conditions: [{ attr: "state", op: "is_any_of", value: ["approved"] }] },
      columns: ["number", "supplier", "dueDate", "gross"],
      sort: [{ attr: "dueDate", dir: "asc" }],
      limit: 10,
    },
  },
  {
    needs: ["fakturace"],
    type: "list",
    title: "Vydané faktury po splatnosti",
    w: 6,
    h: 4,
    source: {
      kind: "records",
      entity: "invoice",
      filters: { op: "and", conditions: [{ attr: "overdue", op: "is_true" }] },
      columns: ["number", "company", "dueDate", "gross"],
      sort: [{ attr: "dueDate", dir: "asc" }],
      limit: 10,
    },
  },
];

const SETS: {
  key: string;
  name: string;
  role: string;
  widgets: Tagged[];
  period?: "this_month";
}[] = [
  {
    key: "majitel-prehled",
    name: "Majitel: marže a cashflow",
    role: "owner",
    widgets: OWNER,
    period: "this_month",
  },
  { key: "kancelar-provoz", name: "Kancelář: obchod a fakturace", role: "office", widgets: OFFICE },
  {
    key: "mistr-stavby",
    name: "Mistr: stavby a tým",
    role: "foreman",
    widgets: FOREMAN,
    period: "this_month",
  },
  {
    key: "ucetni-faktury",
    name: "Účetní: faktury a splatnosti",
    role: "accountant",
    widgets: ACCOUNTANT,
    period: "this_month",
  },
];

/**
 * Výchozí nástěnky podle rolí (majitel, kancelář, mistr, účetní) pro zapnuté moduly. Widgety modulů, které klient
 * nemá zapnuté, se vynechají; nástěnka, které nezbyde žádný widget, se nezakládá. Žádná se neotevírá na úvodní stránce
 * (zůstává klasický Přehled), uživatel ji najde v přepínači nástěnek.
 */
export function standardDashboards(modules: readonly ModuleId[]): DashboardSeed[] {
  const on = new Set<string>(modules);
  return SETS.flatMap((s) => {
    const widgets = s.widgets
      .filter((w) => (w.needs ?? []).every((m) => on.has(m)))
      .map(({ needs: _needs, ...w }) => w as SeedWidget);
    if (!widgets.length) return [];
    return [
      seedDashboard({
        key: s.key,
        name: s.name,
        role: s.role,
        ...(s.period ? { defaultPeriod: s.period } : {}),
        widgets,
      }),
    ];
  });
}
