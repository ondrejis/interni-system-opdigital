import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { afterAll, inject } from "vitest";
import type { TestDbUrls } from "./index";

/**
 * Pro každý soubor integračních testů vytvoří vlastní databázi jako kopii připravené šablony (migrace proběhly jednou
 * v globálním nastavení). Soubory si tak nesdílejí řádky ani počítadla a testy nejsou závislé na pořadí a souběhu
 * jiných souborů. Po skončení souboru se databáze smaže.
 */
const shared = inject("rebarDb");
const name = `${new URL(shared.app).pathname.slice(1)}_${randomBytes(4).toString("hex")}`;
const swap = (url: string) => {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
};

const admin = postgres(shared.admin, { max: 1, onnotice: () => {} });
const template = new URL(shared.app).pathname.slice(1);
await admin.unsafe(`CREATE DATABASE "${name}" OWNER rebar_migrator TEMPLATE "${template}"`);
await admin.end({ timeout: 5 });

const urls: TestDbUrls = {
  admin: shared.admin,
  app: swap(shared.app),
  migrator: swap(shared.migrator),
};
(globalThis as { __rebarFileDb?: TestDbUrls }).__rebarFileDb = urls;

afterAll(async () => {
  const a = postgres(shared.admin, { max: 1, onnotice: () => {} });
  try {
    await a.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  } finally {
    await a.end({ timeout: 5 });
  }
});
