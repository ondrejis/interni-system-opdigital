import path from "node:path";
import { pathToFileURL } from "node:url";
import { resolveModules, type ClientConfig } from "@rebar/core";
import { migrationSources } from "@rebar/core/migrations";
import { runMigrations } from "@rebar/core/migrations";
import { coreJobs } from "@rebar/core/jobs";
import { ALL_MODULES } from "../apps/web/src/modules";
import { collectServers } from "../apps/web/src/server/modules-server";

/**
 * Migrace jádra a zapnutých modulů klienta (`CLIENT`), práva aplikační role a fronty.
 * Pouští se jako samostatný krok pod vlastníkem schématu.
 */
const url = process.env.DATABASE_MIGRATE_URL;
const appRole = process.env.DATABASE_APP_ROLE ?? "rebar_app";
if (!url) {
  console.error("Chybí DATABASE_MIGRATE_URL (připojení pod uživatelem migrací).");
  process.exit(1);
}
const slug = process.env.CLIENT ?? "opsys";
const root = path.resolve(import.meta.dirname, "..");
const config = (
  (await import(pathToFileURL(path.join(root, "clients", slug, "config.ts")).href)) as {
    default: ClientConfig;
  }
).default;
const modules = resolveModules(config.modules, ALL_MODULES);

await runMigrations({
  url,
  appRole,
  queues: [...coreJobs, ...collectServers(modules).jobs],
  folders: migrationSources(
    root,
    modules.map((m) => m.id),
  ),
});
console.log(`Migrace hotové (klient „${slug}“, moduly: ${modules.map((m) => m.id).join(", ")}).`);
