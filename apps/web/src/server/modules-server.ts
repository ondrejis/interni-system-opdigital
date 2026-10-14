import type { ModuleId, ModuleManifest } from "@rebar/core";
import {
  createEntityRegistry,
  registerEntityPolicies,
  setDeleteBlockers,
  setPhaseHooks,
  type DeleteBlocker,
  type EntityDef,
  type PhaseTransitionHook,
} from "@rebar/core/entities";
import type {
  AttentionProvider,
  CalendarLayerProvider,
  CommandDef,
  CostProvider,
  DashboardMetricDef,
  DiaryPrefillProvider,
  JobInvoicingProvider,
  ModuleJob,
  ModuleServer,
  WidgetProvider,
} from "@rebar/core/module-server";
import { setJobFinanceProviders } from "@rebar/core/module-server";
import { coreTerminalCommands } from "@rebar/core/terminal";
import { registerStageUsageFromEntities, setPipelinePhases } from "@rebar/core/config-data";
import { PHASE_LIST } from "@rebar/zakazky/phases";
import { server as dochazka } from "@rebar/dochazka/server";
import { server as fakturace } from "@rebar/fakturace/server";
import { server as kalendar } from "@rebar/kalendar/server";
import { server as kontakty } from "@rebar/kontakty/server";
import { server as poptavky } from "@rebar/poptavky/server";
import { server as realizace } from "@rebar/realizace/server";
import { server as sklad } from "@rebar/sklad/server";
import { server as stroje } from "@rebar/stroje/server";
import { server as zakazky } from "@rebar/zakazky/server";

/**
 * Serverová část modulů (entity, příkazy, poskytovatelé, úlohy). Bez `server-only`, protože ji čte i worker.
 * Do běžící aplikace se dostanou jen zapnuté moduly.
 */
const SERVERS: Partial<Record<ModuleId, ModuleServer>> = {
  kontakty,
  poptavky,
  zakazky,
  realizace,
  fakturace,
  dochazka,
  sklad,
  stroje,
  kalendar,
};

/** Další předpony příkazů modulu kromě jeho id (CRM je modul `poptavky`, jeho příkazy se jmenují `crm.<oblast>.<akce>`). */
export const COMMAND_PREFIXES: Partial<Record<ModuleId, readonly string[]>> = {
  poptavky: ["crm"],
};

export type Collected = {
  entities: NonNullable<ModuleServer["entities"]>[number][];
  commands: Map<string, CommandDef>;
  costProviders: CostProvider[];
  attention: AttentionProvider[];
  widgets: WidgetProvider[];
  dashboardMetrics: DashboardMetricDef[];
  calendarLayers: CalendarLayerProvider[];
  diaryPrefill: DiaryPrefillProvider[];
  jobs: ModuleJob[];
  phaseHooks: PhaseTransitionHook[];
  deleteBlockers: DeleteBlocker[];
  jobInvoicing: JobInvoicingProvider[];
  ensure: NonNullable<ModuleServer["ensure"]>[number][];
};

export function collectServers(modules: readonly ModuleManifest[]): Collected {
  const out: Collected = {
    entities: [],
    commands: new Map(),
    costProviders: [],
    attention: [],
    widgets: [],
    dashboardMetrics: [],
    calendarLayers: [],
    diaryPrefill: [],
    jobs: [],
    phaseHooks: [],
    deleteBlockers: [],
    jobInvoicing: [],
    ensure: [],
  };
  for (const m of modules) {
    const s = SERVERS[m.id];
    if (!s) continue;
    out.entities.push(...(s.entities ?? []));
    for (const c of s.commands ?? []) {
      if (![m.id, ...(COMMAND_PREFIXES[m.id] ?? [])].some((p) => c.name.startsWith(`${p}.`)))
        throw new Error(`Příkaz „${c.name}“ musí začínat „${m.id}.“.`);
      if (out.commands.has(c.name)) throw new Error(`Příkaz „${c.name}“ je definovaný dvakrát.`);
      out.commands.set(c.name, c);
    }
    out.costProviders.push(...(s.costProviders ?? []));
    out.attention.push(...(s.attention ?? []));
    out.widgets.push(...(s.widgets ?? []));
    for (const metric of s.dashboardMetrics ?? []) {
      if (!metric.key.startsWith(`${m.id}.`))
        throw new Error(`Metrika „${metric.key}“ musí začínat „${m.id}.“.`);
      if (out.dashboardMetrics.some((x) => x.key === metric.key))
        throw new Error(`Metrika „${metric.key}“ je definovaná dvakrát.`);
      out.dashboardMetrics.push(metric);
    }
    out.calendarLayers.push(...(s.calendarLayers ?? []));
    out.diaryPrefill.push(...(s.diaryPrefill ?? []));
    out.jobs.push(...(s.jobs ?? []));
    out.phaseHooks.push(...(s.phaseHooks ?? []));
    out.deleteBlockers.push(...(s.deleteBlockers ?? []));
    out.jobInvoicing.push(...(s.jobInvoicing ?? []));
    out.ensure.push(...(s.ensure ?? []));
  }
  // příkazy platformy pro terminál řemeslníka (úkoly); moduly je nedodávají
  for (const c of coreTerminalCommands) out.commands.set(c.name, c);
  setPhaseHooks(out.phaseHooks);
  setDeleteBlockers(out.deleteBlockers);
  setJobFinanceProviders({ costProviders: out.costProviders, invoicing: out.jobInvoicing });
  return out;
}

/** Registr entit zapnutých modulů s zaregistrovanými politikami přístupu (společné pro web i worker). */
export function buildRegistry(entities: readonly EntityDef[]) {
  const registry = createEntityRegistry([...entities]);
  registerEntityPolicies(registry);
  // správa stavů v Nastavení: kolik záznamů stav používá a které fáze zakázky musí mít stav
  registerStageUsageFromEntities(entities);
  if (registry.get("job"))
    setPipelinePhases(
      "job",
      PHASE_LIST.map((p) => ({ key: p.key, label: p.label })),
    );
  return registry;
}
