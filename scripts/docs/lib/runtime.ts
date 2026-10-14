import { CORE_PERMISSIONS, type ModuleManifest, type PermissionDef } from "@rebar/core";
import { coreJobs } from "@rebar/core/jobs";
import { DEFAULT_ROLES } from "@rebar/core/seed";
import { ALL_MODULES } from "../../../apps/web/src/modules";
import { MODULE_UI } from "../../../apps/web/src/modules-ui";
import { collectServers, type Collected } from "../../../apps/web/src/server/modules-server";

/*
  Běhový pohled na kód: skutečné manifesty, serverové části a UI modulů, tak jak je skládá aplikace. Generátor tedy
  nepopisuje, co by v kódu mělo být, ale co v něm skutečně je. Registry se čtou obecně (podle klíčů), takže nová
  položka v manifestu nebo v `ModuleServer` se objeví v referenci bez úpravy generátoru.
*/

export type Runtime = {
  /** Manifesty všech modulů v pořadí, v jakém je skládá aplikace. */
  manifests: readonly ModuleManifest[];
  /** Serverová část každého modulu zvlášť (příkazy jen s prefixem modulu). */
  servers: ReadonlyMap<string, Collected>;
  /** Příkazy platformy (prefix `core.`), které aplikace přidává ke všem modulům. */
  platformCommands: ReadonlyMap<
    string,
    Collected["commands"] extends Map<string, infer C> ? C : never
  >;
  ui: typeof MODULE_UI;
  coreJobs: typeof coreJobs;
  defaultRoles: typeof DEFAULT_ROLES;
  /** Oprávnění platformy a modulů včetně vlastníka (`core` nebo id modulu). */
  permissions: readonly (PermissionDef & { owner: string })[];
};

let cached: Runtime | null = null;

export function loadRuntime(): Runtime {
  if (cached) return cached;
  const servers = new Map<string, Collected>();
  for (const m of ALL_MODULES) {
    const s = collectServers([m]);
    // `collectServers` přidává ke každému volání i příkazy platformy; do modulu patří jen ty s jeho prefixem
    s.commands = new Map([...s.commands].filter(([name]) => name.startsWith(`${m.id}.`)));
    servers.set(m.id, s);
  }
  const everything = collectServers(ALL_MODULES);
  const platformCommands = new Map(
    [...everything.commands].filter(
      ([name]) => !ALL_MODULES.some((m) => name.startsWith(`${m.id}.`)),
    ),
  );
  cached = {
    manifests: ALL_MODULES,
    servers,
    platformCommands,
    ui: MODULE_UI,
    coreJobs,
    defaultRoles: DEFAULT_ROLES,
    permissions: [
      ...CORE_PERMISSIONS.map((p) => ({ ...p, owner: "core" })),
      ...ALL_MODULES.flatMap((m) => m.permissions.map((p) => ({ ...p, owner: m.id }))),
    ],
  };
  return cached;
}

/** Klíče registru `Collected`, které generátor zná a vykresluje podrobně. */
export const KNOWN_SERVER_KEYS = new Set([
  "entities",
  "commands",
  "costProviders",
  "attention",
  "widgets",
  "calendarLayers",
  "diaryPrefill",
  "jobs",
  "phaseHooks",
  "deleteBlockers",
  "jobInvoicing",
]);

/** Klíče manifestu, které generátor zná. */
export const KNOWN_MANIFEST_KEYS = new Set([
  "id",
  "name",
  "description",
  "icon",
  "dependsOn",
  "nav",
  "pages",
  "permissions",
  "entities",
  "seed",
  "terminalWidgets",
]);

/** Klíče `ModuleUi`, které generátor zná. */
export const KNOWN_UI_KEYS = new Set([
  "recordTabs",
  "recordActions",
  "bulkActions",
  "recordTabGroups",
  "recordHeader",
  "recordOverview",
  "hiddenCoreTabs",
  "pages",
  "terminalWidgets",
]);

/** Příkazy serverové části modulu jako pole (v registru jsou v mapě podle názvu). */
export function commandsOf(server: Collected | undefined) {
  return server ? [...server.commands.values()] : [];
}

export const asArray = <T>(v: T | readonly T[] | undefined): T[] =>
  v === undefined ? [] : Array.isArray(v) ? [...v] : [v as T];

/** Počet prvků registru (pole, mapa, objekt). */
export function sizeOf(v: unknown): number {
  if (Array.isArray(v)) return v.length;
  if (v instanceof Map || v instanceof Set) return v.size;
  if (v && typeof v === "object") return Object.keys(v).length;
  return 0;
}
