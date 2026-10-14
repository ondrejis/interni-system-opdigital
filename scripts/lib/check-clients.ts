import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  ClientConfigError,
  resolveModules,
  type ClientConfig,
  type ModuleManifest,
} from "@rebar/core";
import {
  CORE_NOTIFICATION_EVENTS,
  collectNotificationEvents,
  validateEventDefs,
  validateNotificationsConfig,
} from "@rebar/core/notifications";

export type ClientCheck = { dir: string; ok: boolean; problems: string[] };

/** Načte a ověří konfiguraci každého klienta v `clients/` (včetně šablony). */
export async function checkClients(
  root: string,
  modules: readonly ModuleManifest[],
): Promise<ClientCheck[]> {
  const clientsDir = path.join(root, "clients");
  const dirs = fs
    .readdirSync(clientsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d) => d.name)
    .sort();

  const results: ClientCheck[] = [];
  for (const dir of dirs) {
    const configPath = path.join(clientsDir, dir, "config.ts");
    if (!fs.existsSync(configPath)) {
      results.push({ dir, ok: false, problems: ["chybí config.ts"] });
      continue;
    }
    try {
      const mod = (await import(pathToFileURL(configPath).href)) as { default: ClientConfig };
      const problems: string[] = [];
      if (dir !== "_template" && mod.default.slug !== dir) {
        problems.push(`slug „${mod.default.slug}“ neodpovídá názvu složky „${dir}“`);
      }
      resolveModules(mod.default.modules, modules);
      const events = [
        ...CORE_NOTIFICATION_EVENTS,
        ...collectNotificationEvents(resolveModules(mod.default.modules, modules)),
      ];
      problems.push(
        ...validateEventDefs(events),
        ...validateNotificationsConfig(mod.default.notifications, events),
      );
      results.push({ dir, ok: problems.length === 0, problems });
    } catch (err) {
      const problems = err instanceof ClientConfigError ? err.issues : [(err as Error).message];
      results.push({ dir, ok: false, problems });
    }
  }
  return results;
}
