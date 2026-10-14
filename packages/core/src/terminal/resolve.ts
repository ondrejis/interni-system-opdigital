import type { ModuleManifest, TerminalWidgetDef } from "../modules/manifest";
import type { TerminalConfig } from "./config";

/** Dlaždice platformy (nepatří žádnému modulu). Jejich příkazy zajišťuje jádro (`core.*`, viz `commands.ts`). */
export const CORE_TERMINAL_WIDGETS: readonly TerminalWidgetDef[] = [
  {
    key: "core.tasks",
    label: "Moje úkoly",
    description: "Úkoly přidělené řemeslníkovi, odškrtnutí jedním ťuknutím.",
    icon: "check-square",
    commands: ["core.tasks.complete"],
    page: true,
  },
];

/** Všechny dlaždice dostupné v sestavě: platforma a zapnuté moduly (v pořadí modulů). */
export function collectTerminalWidgets(
  modules: readonly Pick<ModuleManifest, "terminalWidgets">[],
): TerminalWidgetDef[] {
  return [...CORE_TERMINAL_WIDGETS, ...modules.flatMap((m) => [...(m.terminalWidgets ?? [])])];
}

/** Stav jedné dlaždice po složení konfigurace (pro Nastavení i pro terminál). */
export type ResolvedTile = {
  key: string;
  /** Název, jak ho uvidí řemeslník (přejmenování správcem, jinak výchozí název dlaždice). */
  label: string;
  defaultLabel: string;
  description: string;
  icon: string;
  enabled: boolean;
  page: boolean;
  commands: readonly string[];
  permission: string | readonly string[] | undefined;
};

const permissionKeys = (p: TerminalWidgetDef["permission"]) => (p === undefined ? [] : [p].flat());

/**
 * Seřadí dlaždice podle konfigurace: nejdřív ty, které konfigurace uvádí (v jejím pořadí), pak ostatní dostupné dlaždice
 * v pořadí modulů. Neznámý klíč v konfiguraci (modul není zapnutý) se přeskočí. Oprávnění se tu neposuzují.
 */
export function resolveTerminalTiles(
  defs: readonly TerminalWidgetDef[],
  config: Pick<TerminalConfig, "tiles">,
): ResolvedTile[] {
  const byKey = new Map(defs.map((d) => [d.key, d] as const));
  const out: ResolvedTile[] = [];
  const seen = new Set<string>();
  const push = (d: TerminalWidgetDef, enabled: boolean, label?: string | undefined) => {
    seen.add(d.key);
    out.push({
      key: d.key,
      label: label?.trim() || d.label,
      defaultLabel: d.label,
      description: d.description,
      icon: d.icon,
      enabled,
      page: d.page === true,
      commands: d.commands ?? [],
      permission: d.permission,
    });
  };
  for (const t of config.tiles) {
    const d = byKey.get(t.widget);
    if (d && !seen.has(d.key)) push(d, t.enabled, t.label);
  }
  for (const d of defs) if (!seen.has(d.key)) push(d, d.defaultEnabled !== false);
  return out;
}

/** Dlaždice, které smí aktér vidět: zapnuté a s oprávněním (UI i server používají tutéž funkci). */
export function visibleTerminalTiles(
  defs: readonly TerminalWidgetDef[],
  config: Pick<TerminalConfig, "tiles">,
  can: (permission: string) => boolean,
): ResolvedTile[] {
  return resolveTerminalTiles(defs, config).filter(
    (t) =>
      t.enabled &&
      (permissionKeys(t.permission).length === 0 || permissionKeys(t.permission).some(can)),
  );
}

/** Spodní lišta: Dnes, až tři dlaždice s vlastní obrazovkou (v pořadí dlaždic) a Více. Dohromady nejvýš pět položek. */
export const BOTTOM_TILE_LIMIT = 3;
export function bottomTiles(tiles: readonly ResolvedTile[]): ResolvedTile[] {
  return tiles.filter((t) => t.page).slice(0, BOTTOM_TILE_LIMIT);
}

/** Smí tento příkaz přijít z terminálu? Jen když ho deklaruje některá z viditelných dlaždic. */
export function terminalCommandAllowed(tiles: readonly ResolvedTile[], command: string): boolean {
  return tiles.some((t) => t.commands.includes(command));
}

/** Role, které používají jen terminál. Vypnutý terminál žádnou roli nezamyká. */
export function isTerminalOnlyRole(
  config: Pick<TerminalConfig, "enabled" | "roles">,
  roleKey: string | null,
): boolean {
  return config.enabled && roleKey !== null && config.roles.includes(roleKey);
}

/** Kontroly sestavy při startu: neznámé klíče dlaždic, předpony, příkazy a oprávnění. Prázdné pole = v pořádku. */
export function validateTerminalSetup(
  config: Pick<TerminalConfig, "tiles">,
  allModules: readonly ModuleManifest[],
  knownPermissions: ReadonlySet<string>,
): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const m of allModules) {
    for (const w of m.terminalWidgets ?? []) {
      if (!w.key.startsWith(`${m.id}.`))
        problems.push(`Dlaždice „${w.key}“ musí začínat „${m.id}.“.`);
      if (seen.has(w.key)) problems.push(`Dlaždice „${w.key}“ je definovaná dvakrát.`);
      seen.add(w.key);
      for (const c of w.commands ?? [])
        if (!c.startsWith(`${m.id}.`))
          problems.push(`Příkaz „${c}“ dlaždice „${w.key}“ musí začínat „${m.id}.“.`);
      for (const p of permissionKeys(w.permission))
        if (!knownPermissions.has(p))
          problems.push(`Dlaždice „${w.key}“ požaduje neznámé oprávnění „${p}“.`);
    }
  }
  for (const w of CORE_TERMINAL_WIDGETS) seen.add(w.key);
  for (const t of config.tiles)
    if (!seen.has(t.widget))
      problems.push(`Terminál: dlaždice „${t.widget}“ v konfiguraci neexistuje v žádném modulu.`);
  return problems;
}
