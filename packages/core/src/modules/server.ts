import type { ZodType, z } from "zod";
import "../zod-locale";
import type { ContributionMap, ServiceMap } from "../contracts/services";
import type {
  DeleteBlocker,
  EntityDef,
  EntityExtension,
  EntityRegistry,
  PhaseTransitionHook,
} from "../entities";
import type { DomainEventHandler } from "../events";
import type { DomainEventName } from "../contracts/events";
import type { StorageDriver } from "../files";
import type { QueueClient, JobDef } from "../jobs";
import type { Ctx } from "../rbac/types";
import type { Cipher } from "../security/crypto";
import type { SettingsService } from "../settings";
import type { Db, Executor } from "../db/client";
import type { EventMap, EventName } from "../extensions/types";
import type { Bucket, ChartCategory, ChartSeriesData, ValueFormat } from "../dashboards/types";

export { createEventEmitter, emitEvent, setEventEmitter } from "../extensions/events";
export type { EventEmitter } from "../extensions/events";

/**
 * Služby, které aplikace předává modulům (příkazy, poskytovatelé, úlohy). Moduly je dostávají jako parametr;
 * nikdy neimportují jeden druhého kvůli službám (vypnutý modul nesmí zanechat stopu).
 */
export type ModuleDeps = {
  registry: EntityRegistry;
  queue: Pick<QueueClient, "send">;
  storage: StorageDriver;
  settings: SettingsService;
  /** Šifrování tajemství v DB (adresy cizích kalendářů…). */
  cipher: Cipher;
  /** Adresa aplikace (odkazy v e-mailech a upozorněních). */
  baseURL: string;
  /** Oznámí událost rozšířením klienta (chyba rozšíření nesmí zrušit akci). */
  emit: <K extends EventName>(name: K, payload: EventMap[K]) => Promise<void>;
  /** Poskytovatelé zapnutých modulů (kalendářní vrstvy). */
  calendarLayers: readonly CalendarLayerProvider[];
  /** Služby a příspěvky ostatních modulů (D §2.3, §2.5). */
  services: ServiceRegistry;
};

/**
 * Přístup ke službám a příspěvkům ostatních modulů. Modul nikdy neimportuje cizí modul kvůli službě: vypnutý nebo
 * zatím nehotový modul službu nemá, proto `optional`.
 */
export type ServiceRegistry = {
  /** Služba zapnutého modulu; vyhodí, když ji žádný zapnutý modul nenabízí. */
  get<K extends keyof ServiceMap>(key: K): ServiceMap[K];
  /** Služba, nebo `undefined`, když modul není zapnutý. */
  optional<K extends keyof ServiceMap>(key: K): ServiceMap[K] | undefined;
  /** Příspěvky všech zapnutých modulů daného druhu (v pořadí modulů). */
  all<K extends keyof ContributionMap>(key: K): readonly ContributionMap[K][];
};

/** Co modul nabízí ostatním (`ModuleServer.services` + `contributions`) v podobě, ze které se skládá `ServiceRegistry`. */
export type ServiceSources = {
  services: { [K in keyof ServiceMap]?: (deps: ModuleDeps) => ServiceMap[K] };
  contributions: { [K in keyof ContributionMap]?: readonly ContributionMap[K][] };
};

/**
 * Doplní `ModuleDeps` o `services`. Služby se vyrábí líně při prvním použití (továrna dostane hotové `deps`),
 * takže nevadí, že služba sama volá další služby.
 */
export function createModuleDeps(
  base: Omit<ModuleDeps, "services">,
  sources: ServiceSources,
): ModuleDeps {
  const cache = new Map<string, unknown>();
  const deps = { ...base } as ModuleDeps;
  const optional = <K extends keyof ServiceMap>(key: K): ServiceMap[K] | undefined => {
    if (cache.has(key)) return cache.get(key) as ServiceMap[K];
    const factory = sources.services[key] as ((d: ModuleDeps) => ServiceMap[K]) | undefined;
    if (!factory) return undefined;
    const service = factory(deps);
    cache.set(key, service);
    return service;
  };
  deps.services = {
    optional,
    get(key) {
      const service = optional(key);
      if (!service) throw new Error(`Služba „${key}“ není k dispozici (modul není zapnutý).`);
      return service;
    },
    all: (key) => sources.contributions[key] ?? [],
  };
  return deps;
}

/**
 * Příkaz modulu: pojmenovaná akce nebo dotaz volaný z UI (`api.command(name, input)`).
 * Oprávnění a validaci vstupu hlídá jednotný vstupní bod; handler je čistá funkce nad `ctx`.
 */
export type CommandDef<S extends ZodType = ZodType, R = unknown> = {
  /** `<modul>.<akce>`. */
  name: string;
  /** Stačí kterékoli z uvedených oprávnění; bez něj stačí přihlášení (oprávnění pak řeší data). */
  permission?: string | readonly string[];
  input: S;
  handler: (ctx: Ctx, input: z.output<S>, deps: ModuleDeps) => Promise<R>;
};

export function defineCommand<S extends ZodType, R>(def: CommandDef<S, R>): CommandDef<S, R> {
  return def;
}

/** Položka „Vyžaduje pozornost“ na přehledu. */
export type AttentionItem = {
  id: string;
  /** Modul původu. */
  module: string;
  severity: "info" | "warning" | "danger";
  title: string;
  detail?: string;
  href: string;
};

export type AttentionProvider = (ctx: Ctx, deps: ModuleDeps) => Promise<AttentionItem[]>;

/** Dlaždice přehledu: modul dodá data, UI dlaždici vykreslí podle `kind`. */
export type WidgetData = {
  id: string;
  module: string;
  title: string;
  /** Hlavní číslo nebo text dlaždice. */
  value: string;
  hint?: string;
  href?: string;
  tone?: "default" | "warning" | "danger" | "success";
  /** Pořadí na přehledu (nižší dřív). */
  order?: number;
};
export type WidgetProvider = (ctx: Ctx, deps: ModuleDeps) => Promise<WidgetData[]>;

/** Vstup výpočtu pojmenované metriky nástěnky (období a filtry z hlavičky nástěnky, parametry z widgetu). */
export type DashboardMetricInput = {
  /** Období (včetně obou konců); `null` = bez omezení. Metrika bez `supports.period` ho dostane vždy `null`. */
  from: string | null;
  to: string | null;
  jobId: string | null;
  userId: string | null;
  bucket: Bucket | null;
  /** Nejvíc řádků / skupin, které widget ukáže. */
  limit: number;
  params: Record<string, string | number | boolean>;
  /** Dnešní datum v české zóně. */
  today: string;
};

export type DashboardMetricResult =
  | { kind: "scalar"; value: number | null }
  | {
      kind: "series";
      categories: ChartCategory[];
      series: ChartSeriesData[];
    };

/**
 * Pojmenovaná metrika nástěnky: výpočet, který nejde složit z jedné entity (marže zakázek, nevyfakturováno, využití
 * strojů…). Modul ji deklaruje ve své serverové části (`dashboardMetrics`). Metrika **nikdy nevidí víc než aktér**:
 * jádro ji nevyhodnotí bez všech `permissions` a výpočet musí čerpat data přes entity a datovou vrstvu (rozsah „jen moje“).
 */
export type DashboardMetricDef = {
  /** `<modul>.<metrika>`; prefix musí odpovídat modulu. */
  key: string;
  label: string;
  description?: string;
  format: ValueFormat;
  /** `scalar` = jedno číslo (KPI, měřidlo, srovnání období); `series` = kategorie × řady (grafy, tabulka). */
  shape: "scalar" | "series";
  /** Aktér musí mít VŠECHNA uvedená oprávnění; jinak metrika pro něj neexistuje (ani v nabídce, ani při vyhodnocení). */
  permissions: readonly string[];
  supports?: { period?: boolean; job?: boolean; person?: boolean; bucket?: boolean };
  params?: readonly {
    key: string;
    label: string;
    type: "select" | "number" | "boolean";
    choices?: readonly { value: string; label: string }[];
    default?: string | number | boolean;
  }[];
  compute: (
    ctx: Ctx,
    input: DashboardMetricInput,
    deps: ModuleDeps,
  ) => Promise<DashboardMetricResult>;
};

export function defineDashboardMetric(def: DashboardMetricDef): DashboardMetricDef {
  return def;
}

/** Položka kalendářní vrstvy (fáze, rezervace, termíny, splatnosti…). */
export type CalendarItem = {
  id: string;
  layer: string;
  title: string;
  /** ISO datum (`YYYY-MM-DD`) nebo čas (`YYYY-MM-DDTHH:mm`). */
  start: string;
  end?: string;
  allDay: boolean;
  color?: string;
  href?: string;
};
export type CalendarLayerProvider = {
  key: string;
  label: string;
  color: string;
  items: (
    ctx: Ctx,
    range: { from: string; to: string },
    deps: ModuleDeps,
  ) => Promise<CalendarItem[]>;
};

/** Úloha modulu na pozadí (připomínky, uzávěrky…); běží ve workeru s právy systému. */
export type ModuleJobDeps = {
  /** Služby ostatních modulů (úlohy volají služby a vysílají události stejně jako příkazy). */
  services?: ServiceRegistry;
  db: Db;
  registry: EntityRegistry;
  queue: Pick<QueueClient, "send">;
  settings: SettingsService;
  cipher: Cipher;
  baseURL: string;
};
export type ModuleJob = JobDef<ZodType, ModuleJobDeps>;

/** Úloha modulu na pozadí: stejná jako `defineJob`, jen s typovanými službami workeru. */
export function defineModuleJob<S extends ZodType>(def: JobDef<S, ModuleJobDeps>): ModuleJob {
  return def as unknown as ModuleJob;
}

/** Položka „odznaku“ u položky navigace (počet záznamů po termínu apod.); bez soukromých záznamů cizích aktérů. */
export type NavBadgeDef = {
  /** Adresa položky navigace, ke které se odznak přidá. */
  href: string;
  tone: "warning" | "danger";
  count: (ctx: Ctx, deps: ModuleDeps) => Promise<number>;
};

/** Pojmenovaná ruční čtecí cesta modulu pro test soukromí (D §5.4): widget, metrika, vrstva, služba, příspěvek karty. */
export type PrivatePathDef = {
  name: string;
  run: (ctx: Ctx, deps: ModuleDeps) => Promise<unknown>;
};

/**
 * Příchozí požadavek od n8n a dalších (`POST /api/ingest/<source>`, podepsaný). Duplicita (`source`, `externalId`)
 * se vyřídí bez zpracování. Trasu a zápis do `inbound_event` doplní C2.
 */
export type IngestDef<S extends ZodType = ZodType> = {
  source: string;
  schema: S;
  externalId: (body: z.output<S>) => string;
  handle: (
    ctx: Ctx,
    body: z.output<S>,
    deps: ModuleDeps,
  ) => Promise<{ entity?: { type: string; id: string } } | void>;
};

/** Pomocník pro typově bezpečnou definici příchozího zdroje (`ModuleServer.ingests`). */
export function defineIngest<S extends ZodType>(def: IngestDef<S>): IngestDef<S> {
  return def;
}

/** Co modul nabízí běžícímu systému na serveru. Žádný modul tohle nečte z jiného modulu přímo — jen přes registry v aplikaci. */
export type ModuleServer = {
  /** Definice entit, případně rozšíření cizích entit (`extendEntity`). */
  entities?: readonly (EntityDef | EntityExtension)[];
  commands?: readonly CommandDef[];
  attention?: readonly AttentionProvider[];
  widgets?: readonly WidgetProvider[];
  /** Pojmenované metriky pro vlastní nástěnky (viz `DashboardMetricDef`). */
  dashboardMetrics?: readonly DashboardMetricDef[];
  calendarLayers?: readonly CalendarLayerProvider[];
  jobs?: readonly ModuleJob[];
  /** Hooky přechodu fáze záznamu (zakázky): kontroly a automatické akce, které zná tento modul. */
  phaseHooks?: readonly PhaseTransitionHook[];
  /** Blokace smazání: záznamy tohoto modulu, které odkazují na firmu, osobu nebo zakázku (viz `DeleteBlocker`). */
  deleteBlockers?: readonly DeleteBlocker[];
  /**
   * Idempotentní doplnění dat modulu do existující databáze (`db:seed`, `demo:seed`): výchozí stavy, typy aktivit,
   * úprava dat po změně výchozí sady. Běží po `runSeed`; nesmí přepisovat to, co správce změnil v administraci.
   */
  ensure?: readonly ((db: Executor) => Promise<unknown>)[];
  /** Služby pro ostatní moduly (`deps.services.get/optional`). */
  services?: ServiceSources["services"];
  /** Příspěvky pro ostatní moduly (karta klienta, proměnné e-mailů). Čtou se `deps.services.all`. */
  contributions?: ServiceSources["contributions"];
  /** Reakce na doménové události jiných modulů; běží v transakci emitenta (chyba = vrácení). */
  eventHandlers?: { [K in DomainEventName]?: DomainEventHandler<K> };
  /** Příchozí požadavky (`/api/ingest/<source>`). */
  ingests?: readonly IngestDef[];
  /** Odznaky u položek navigace. */
  navBadges?: readonly NavBadgeDef[];
  /** Ruční čtecí cesty pro canary test soukromí. */
  privatePaths?: readonly PrivatePathDef[];
};

export function defineModuleServer<const M extends ModuleServer>(m: M): M {
  return m;
}

/**
 * Složí serverovou část modulu z oblastí (každá oblast je samostatná složka s vlastním vlastníkem, ADR 015):
 * seznamy se spojí v daném pořadí; `services` a `contributions` se spojí podle klíče (stejná služba ve dvou oblastech
 * je chyba), `eventHandlers` téže události se zřetězí.
 */
export function mergeServers(...parts: readonly ModuleServer[]): ModuleServer {
  const listKeys = [
    "entities",
    "commands",
    "attention",
    "widgets",
    "dashboardMetrics",
    "calendarLayers",
    "jobs",
    "phaseHooks",
    "deleteBlockers",
    "ensure",
    "ingests",
    "navBadges",
    "privatePaths",
  ] as const;
  const out: Record<string, unknown> = {};
  for (const k of listKeys) out[k] = parts.flatMap((p) => [...(p[k] ?? [])]);

  const services: Record<string, unknown> = {};
  for (const p of parts)
    for (const [k, f] of Object.entries(p.services ?? {})) {
      if (k in services) throw new Error(`Služba „${k}“ je ve dvou oblastech modulu.`);
      services[k] = f;
    }
  out.services = services;

  const contributions: Record<string, unknown[]> = {};
  for (const p of parts)
    for (const [k, list] of Object.entries(p.contributions ?? {}))
      (contributions[k] ??= []).push(...(list as unknown[]));
  out.contributions = contributions;

  const handlers: Record<string, DomainEventHandler<never>[]> = {};
  for (const p of parts)
    for (const [k, h] of Object.entries(p.eventHandlers ?? {}))
      if (h) (handlers[k] ??= []).push(h as DomainEventHandler<never>);
  out.eventHandlers = Object.fromEntries(
    Object.entries(handlers).map(([k, list]) => [
      k,
      list.length === 1
        ? list[0]
        : async (ctx: Ctx, e: never, deps: ModuleDeps) => {
            for (const h of list) await h(ctx, e, deps);
          },
    ]),
  );
  return out as ModuleServer;
}
