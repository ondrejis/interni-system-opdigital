import type { ModuleId, ModuleManifest } from "@rebar/core";
import type { ContributionMap, ServiceMap } from "@rebar/core/contracts";
import {
  applyEntityExtensions,
  createEntityRegistry,
  registerEntityPolicies,
  setDeleteBlockers,
  setPhaseHooks,
  type DeleteBlocker,
  type EntityDef,
  type PhaseTransitionHook,
} from "@rebar/core/entities";
import type { DomainEventHandlers } from "@rebar/core/events";
import type {
  AttentionProvider,
  CalendarLayerProvider,
  CommandDef,
  DashboardMetricDef,
  IngestDef,
  ModuleJob,
  ModuleServer,
  NavBadgeDef,
  PrivatePathDef,
  ServiceSources,
  WidgetProvider,
} from "@rebar/core/module-server";
import { registerStageUsageFromEntities } from "@rebar/core/config-data";
import { server as disk } from "@rebar/disk/server";
import { server as finance } from "@rebar/finance/server";
import { server as hodiny } from "@rebar/hodiny/server";
import { server as kalendar } from "@rebar/kalendar/server";
import { server as klienti } from "@rebar/klienti/server";
import { server as kontakty } from "@rebar/kontakty/server";
import { server as muj_prostor } from "@rebar/muj-prostor/server";
import { server as obchody } from "@rebar/obchody/server";
import { server as prehled } from "@rebar/prehled/server";
import { server as reklama } from "@rebar/reklama/server";
import { server as sablony_emailu } from "@rebar/sablony-emailu/server";
import { server as ukoly } from "@rebar/ukoly/server";
import { server as zakazky } from "@rebar/zakazky/server";

/**
 * Serverová část modulů (entity, příkazy, poskytovatelé, úlohy). Bez `server-only`, protože ji čte i worker.
 * Do běžící aplikace se dostanou jen zapnuté moduly.
 */
const SERVERS: Partial<Record<ModuleId, ModuleServer>> = {
  kontakty,
  klienti,
  disk,
  zakazky,
  obchody,
  ukoly,
  kalendar,
  hodiny,
  finance,
  reklama,
  "sablony-emailu": sablony_emailu,
  "muj-prostor": muj_prostor,
  prehled,
};

/** Další předpony příkazů modulu kromě jeho id (výjimka z pravidla „příkaz začíná id modulu“; dnes žádná). */
export const COMMAND_PREFIXES: Partial<Record<ModuleId, readonly string[]>> = {};

/** Modul, který smí nabízet danou službu (D §2.3); jiný modul ji registrovat nesmí. */
export const SERVICE_OWNERS: Record<keyof ServiceMap, ModuleId> = {
  clients: "klienti",
  disk: "disk",
  tasks: "ukoly",
  finance: "finance",
  emailTemplates: "sablony-emailu",
};

export type Collected = {
  entities: EntityDef[];
  commands: Map<string, CommandDef>;
  attention: AttentionProvider[];
  widgets: WidgetProvider[];
  dashboardMetrics: DashboardMetricDef[];
  calendarLayers: CalendarLayerProvider[];
  jobs: ModuleJob[];
  phaseHooks: PhaseTransitionHook[];
  deleteBlockers: DeleteBlocker[];
  ensure: NonNullable<ModuleServer["ensure"]>[number][];
  /** Služby zapnutých modulů (`deps.services`); každá má jediného vlastníka. */
  services: ServiceSources["services"];
  /** Příspěvky modulů pro jiné moduly (karta klienta, proměnné e-mailů), v pořadí modulů. */
  contributions: { [K in keyof ContributionMap]?: ContributionMap[K][] };
  /** Obsluhy doménových událostí (`emitDomain`), v pořadí modulů. */
  eventHandlers: DomainEventHandlers;
  ingests: IngestDef[];
  navBadges: NavBadgeDef[];
  privatePaths: PrivatePathDef[];
};

export function collectServers(modules: readonly ModuleManifest[]): Collected {
  const out: Collected = {
    entities: [],
    commands: new Map(),
    attention: [],
    widgets: [],
    dashboardMetrics: [],
    calendarLayers: [],
    jobs: [],
    phaseHooks: [],
    deleteBlockers: [],
    ensure: [],
    services: {},
    contributions: {},
    eventHandlers: {},
    ingests: [],
    navBadges: [],
    privatePaths: [],
  };
  const entityItems: NonNullable<ModuleServer["entities"]>[number][] = [];
  for (const m of modules) {
    const s = SERVERS[m.id];
    if (!s) continue;
    entityItems.push(...(s.entities ?? []));
    for (const c of s.commands ?? []) {
      if (![m.id, ...(COMMAND_PREFIXES[m.id] ?? [])].some((p) => c.name.startsWith(`${p}.`)))
        throw new Error(`Příkaz „${c.name}“ musí začínat „${m.id}.“.`);
      if (out.commands.has(c.name)) throw new Error(`Příkaz „${c.name}“ je definovaný dvakrát.`);
      out.commands.set(c.name, c);
    }
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
    out.jobs.push(...(s.jobs ?? []));
    out.phaseHooks.push(...(s.phaseHooks ?? []));
    out.deleteBlockers.push(...(s.deleteBlockers ?? []));
    out.ensure.push(...(s.ensure ?? []));
    for (const [key, factory] of Object.entries(s.services ?? {})) {
      const owner = SERVICE_OWNERS[key as keyof ServiceMap];
      if (owner !== m.id)
        throw new Error(`Službu „${key}“ smí nabízet jen modul „${owner ?? "?"}“, ne „${m.id}“.`);
      (out.services as Record<string, unknown>)[key] = factory;
    }
    for (const [key, list] of Object.entries(s.contributions ?? {}))
      ((out.contributions as Record<string, unknown[]>)[key] ??= []).push(...(list as unknown[]));
    for (const [name, handler] of Object.entries(s.eventHandlers ?? {}))
      if (handler) ((out.eventHandlers as Record<string, unknown[]>)[name] ??= []).push(handler);
    out.ingests.push(...(s.ingests ?? []));
    for (const ingest of s.ingests ?? [])
      if (out.ingests.filter((x) => x.source === ingest.source).length > 1)
        throw new Error(`Příchozí zdroj „${ingest.source}“ je definovaný dvakrát.`);
    out.navBadges.push(...(s.navBadges ?? []));
    for (const p of s.privatePaths ?? []) {
      if (out.privatePaths.some((x) => x.name === p.name))
        throw new Error(`Soukromá cesta „${p.name}“ je definovaná dvakrát.`);
      out.privatePaths.push(p);
    }
  }
  out.entities = applyEntityExtensions(entityItems);
  setPhaseHooks(out.phaseHooks);
  setDeleteBlockers(out.deleteBlockers);
  return out;
}

/** Registr entit zapnutých modulů s zaregistrovanými politikami přístupu (společné pro web i worker). */
export function buildRegistry(entities: readonly EntityDef[]) {
  const registry = createEntityRegistry([...entities]);
  registerEntityPolicies(registry);
  // správa stavů v Nastavení: kolik záznamů stav používá a které fáze zakázky musí mít stav
  registerStageUsageFromEntities(entities);
  return registry;
}
