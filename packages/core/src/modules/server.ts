import type { ZodType, z } from "zod";
import "../zod-locale";
import type { DeleteBlocker, EntityDef, EntityRegistry, PhaseTransitionHook } from "../entities";
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
};

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

/** Co modul nabízí běžícímu systému na serveru. Žádný modul tohle nečte z jiného modulu přímo — jen přes registry v aplikaci. */
export type ModuleServer = {
  entities?: readonly EntityDef[];
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
};

export function defineModuleServer<const M extends ModuleServer>(m: M): M {
  return m;
}

/**
 * Složí serverovou část modulu z oblastí (každá oblast je samostatná složka s vlastním vlastníkem, ADR 015):
 * seznamy se spojí v daném pořadí.
 */
export function mergeServers(...parts: readonly ModuleServer[]): ModuleServer {
  const keys = [
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
  ] as const;
  const out: Record<string, unknown[]> = {};
  for (const k of keys) out[k] = parts.flatMap((p) => [...(p[k] ?? [])]);
  return out as ModuleServer;
}
