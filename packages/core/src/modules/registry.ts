import type { ModuleId } from "./ids";
import {
  CORE_PERMISSIONS,
  type ModuleManifest,
  type NavItem,
  type PermissionDef,
} from "./manifest";

export class ModuleResolutionError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Neplatná sestava modulů:\n - ${problems.join("\n - ")}`);
    this.name = "ModuleResolutionError";
  }
}

/**
 * Z dostupných manifestů vybere zapnuté moduly a seřadí je tak, aby závislosti
 * šly vždy před modulem, který je potřebuje. Vypnutý modul se nikde neobjeví.
 */
export function resolveModules(
  enabled: readonly ModuleId[],
  available: readonly ModuleManifest[],
): ModuleManifest[] {
  const problems: string[] = [];
  const byId = new Map(available.map((m) => [m.id, m] as const));
  const wanted = new Set(enabled);

  for (const id of wanted) {
    if (!byId.has(id)) problems.push(`Modul „${id}“ není v tomto sestavení k dispozici.`);
  }
  for (const id of wanted) {
    for (const dep of byId.get(id)?.dependsOn ?? []) {
      if (!wanted.has(dep)) problems.push(`Modul „${id}“ vyžaduje zapnutý modul „${dep}“.`);
    }
  }
  if (problems.length) throw new ModuleResolutionError(problems);

  const ordered: ModuleManifest[] = [];
  const state = new Map<ModuleId, "visiting" | "done">();
  const visit = (id: ModuleId, path: ModuleId[]) => {
    if (state.get(id) === "done") return;
    if (state.get(id) === "visiting") {
      throw new ModuleResolutionError([`Cyklická závislost modulů: ${[...path, id].join(" → ")}`]);
    }
    state.set(id, "visiting");
    const manifest = byId.get(id)!;
    for (const dep of manifest.dependsOn ?? []) visit(dep, [...path, id]);
    state.set(id, "done");
    ordered.push(manifest);
  };
  for (const id of enabled) visit(id, []);
  return ordered;
}

export function collectNav(modules: readonly ModuleManifest[]): NavItem[] {
  return modules.flatMap((m) => m.nav);
}

/** Katalog všech oprávnění dostupných v dané sestavě (platforma + zapnuté moduly). */
export function collectPermissions(modules: readonly ModuleManifest[]): PermissionDef[] {
  return [...CORE_PERMISSIONS, ...modules.flatMap((m) => m.permissions)];
}
