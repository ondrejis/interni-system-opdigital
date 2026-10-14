import postgres from "postgres";
import type { TestProject } from "vitest/node";
import path from "node:path";
import { MODULE_IDS } from "../modules/ids";
import type { TestDbUrls } from "./index";
import { runMigrations } from "../db/migrate";
import { migrationSources } from "../db/migrations";
import { coreJobs } from "../jobs/core-jobs";

/**
 * Připraví čistou testovací databázi: znovu ji vytvoří, spustí migrace pod uživatelem migrací
 * a přidělí práva aplikační roli. Lokálně `pnpm db:up`, v CI služba postgres:17.
 */
export default async function setup(project: TestProject) {
  const env = process.env;
  const host = env.REBAR_TEST_DB_HOST ?? "localhost:5433";
  const db = env.REBAR_TEST_DB_NAME ?? "rebar_test";
  const urls: TestDbUrls = {
    admin: env.REBAR_TEST_ADMIN_URL ?? `postgres://postgres@${host}/postgres`,
    migrator: env.REBAR_TEST_MIGRATOR_URL ?? `postgres://rebar_migrator:migrator@${host}/${db}`,
    app: env.REBAR_TEST_APP_URL ?? `postgres://rebar_app:app@${host}/${db}`,
  };

  const admin = postgres(urls.admin, { max: 1, onnotice: () => {} });
  try {
    await admin`select 1`;
  } catch (err) {
    await admin.end({ timeout: 1 }).catch(() => {});
    throw new Error(
      `Testovací databáze není dostupná (${urls.admin.replace(/:[^:@/]*@/, ":***@")}). Spusťte ji příkazem „pnpm db:up“. ${String(err)}`,
      { cause: err },
    );
  }
  await admin.unsafe(`DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
  await admin.unsafe(
    `CREATE DATABASE "${db}" OWNER rebar_migrator TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER icu ICU_LOCALE 'cs-CZ' LOCALE 'en_US.UTF-8'`,
  );
  await admin.end({ timeout: 5 });

  const repoRoot = path.resolve(import.meta.dirname, "../../../..");
  await runMigrations({
    url: urls.migrator,
    appRole: "rebar_app",
    queues: coreJobs,
    folders: migrationSources(repoRoot, MODULE_IDS),
  });
  project.provide("rebarDb", urls);
}
