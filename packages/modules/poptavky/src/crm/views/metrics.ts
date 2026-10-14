import { and, sql } from "drizzle-orm";
import { choiceParam, scopedEntity } from "@rebar/core/dashboards";
import {
  defineDashboardMetric,
  type DashboardMetricInput,
  type ModuleDeps,
} from "@rebar/core/module-server";
import { PermissionError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { job } from "@rebar/zakazky/schema";
import { openDealWhere } from "./scope";

const ECONOMICS = "zakazky.economics";
const PHASES = ["all", "inquiry", "offer"] as const;

const phaseParam = {
  key: "phase",
  label: "Fáze",
  type: "select" as const,
  choices: [
    { value: "all", label: "Poptávka i nabídka" },
    { value: "inquiry", label: "Jen poptávka" },
    { value: "offer", label: "Jen nabídka" },
  ],
  default: "all",
};

/**
 * Otevřené obchody v rozsahu aktéra (a volitelně jednoho vlastníka z filtru nástěnky). Peníze smí číst jen ten, kdo má
 * `zakazky.economics`: atribut, který aktér nevidí, v entitě neexistuje, takže ho nesečte ani úpravou definice widgetu.
 */
async function dealScope(ctx: Ctx, deps: ModuleDeps, input: DashboardMetricInput, money: boolean) {
  const scope = await scopedEntity(ctx, deps, "job");
  if (money && !(scope.entity.byKey.has("sumContract") && scope.entity.byKey.has("crmWeighted")))
    throw new PermissionError("Na ekonomiku zakázek nemáte oprávnění.");
  const phase = choiceParam(input.params, "phase", PHASES, "all");
  return and(
    scope.where,
    openDealWhere({ phase: phase === "all" ? null : phase, managerId: input.userId }),
  )!;
}

const num = (v: unknown) => Number(v ?? 0);

/**
 * Pojmenované metriky nástěnek pro obchodní část CRM (prefix modulu `poptavky`). Čtou jen nearchivované otevřené obchody
 * (zakázky ve fázi poptávka a nabídka) v rozsahu aktéra; částky vyžadují `zakazky.economics`. Filtr osoby nástěnky
 * zužuje na vlastníka obchodu. Vážená hodnota je uložená cena nabídky × pravděpodobnost stavu (nebo ruční přepsání).
 */
export const crmDashboardMetrics = [
  defineDashboardMetric({
    key: "poptavky.pipeline_value",
    label: "Hodnota obchodů",
    description:
      "Součet cen nabídek otevřených obchodů (poptávka a nabídka, bez archivovaných) v Kč. U poptávky bez rozpočtu je to odhad hodnoty.",
    format: "money",
    shape: "scalar",
    permissions: ["zakazky.read", ECONOMICS],
    supports: { person: true },
    params: [phaseParam],
    compute: async (ctx, input, deps) => {
      const where = await dealScope(ctx, deps, input, true);
      const [r] = await ctx.db
        .select({ v: sql<number>`coalesce(sum(${job.sumContractMinor}), 0)::float8` })
        .from(job)
        .where(where);
      return { kind: "scalar", value: num(r?.v) };
    },
  }),
  defineDashboardMetric({
    key: "poptavky.pipeline_weighted",
    label: "Vážená hodnota obchodů",
    description:
      "Součet cen nabídek otevřených obchodů vynásobených pravděpodobností jejich stavu (nebo ručně zadanou pravděpodobností) v Kč.",
    format: "money",
    shape: "scalar",
    permissions: ["zakazky.read", ECONOMICS],
    supports: { person: true },
    params: [phaseParam],
    compute: async (ctx, input, deps) => {
      const where = await dealScope(ctx, deps, input, true);
      const [r] = await ctx.db
        .select({ v: sql<number>`coalesce(sum(${job.crmWeightedMinor}), 0)::float8` })
        .from(job)
        .where(where);
      return { kind: "scalar", value: num(r?.v) };
    },
  }),
  defineDashboardMetric({
    key: "poptavky.rotting",
    label: "Zhnilé obchody",
    description:
      "Počet otevřených obchodů, které se ve stavu nehnuly déle, než dovoluje stav (dny do zhnití), a nemají novou dokončenou aktivitu.",
    format: "number",
    shape: "scalar",
    permissions: ["zakazky.read"],
    supports: { person: true },
    params: [phaseParam],
    compute: async (ctx, input, deps) => {
      const where = await dealScope(ctx, deps, input, false);
      const [r] = await ctx.db
        .select({ n: sql<number>`count(*) filter (where ${job.crmRotting})::int` })
        .from(job)
        .where(where);
      return { kind: "scalar", value: num(r?.n) };
    },
  }),
  defineDashboardMetric({
    key: "poptavky.no_next_activity",
    label: "Obchody bez další aktivity",
    description:
      "Počet otevřených obchodů, které nemají žádnou naplánovanou (nedokončenou) aktivitu. Každý otevřený obchod má mít další krok.",
    format: "number",
    shape: "scalar",
    permissions: ["zakazky.read"],
    supports: { person: true },
    params: [phaseParam],
    compute: async (ctx, input, deps) => {
      const where = await dealScope(ctx, deps, input, false);
      const [r] = await ctx.db
        .select({ n: sql<number>`count(*) filter (where ${job.crmOpenActivities} = 0)::int` })
        .from(job)
        .where(where);
      return { kind: "scalar", value: num(r?.n) };
    },
  }),
];
