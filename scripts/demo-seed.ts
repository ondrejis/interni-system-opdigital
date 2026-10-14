import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ClientConfig } from "@rebar/core";
import { seedDemo } from "../clients/opsys/seed/run";
import { DEMO_PASSWORD, DEMO_USERS } from "../clients/opsys/seed/users";
import { loadEnv } from "../apps/web/src/server/env";
import { createDemoServices } from "./lib/demo-services";

/**
 * Nasype do databáze minimální demo data OPSYS (demo uživatelé podle rolí, ukázkové firmy a osoby). Vše přes příkazy
 * a entity modulů.
 *
 *   pnpm demo:seed              nasadí data do prázdné databáze; jinak skončí s vysvětlením
 *   pnpm demo:seed --reset      smaže dřívější demo data (jen když jsou všechna obchodní data označená jako demo) a nasype nová
 *   pnpm demo:seed --wipe       smaže VŠECHNA obchodní data (jen vývojová databáze!) a nasype demo data
 *   pnpm demo:seed --keep-2fa   ponechá povinné 2FA rolí (výchozí: demo uživatelé se přihlašují jen heslem)
 *   pnpm demo:seed --quiet      bez průběžného výpisu
 *
 * Mazání potřebuje DATABASE_MIGRATE_URL (připojení pod vlastníkem schématu). Klient: CLIENT (výchozí „opsys“).
 */
const args = new Set(process.argv.slice(2));
const known = new Set(["--reset", "--wipe", "--keep-2fa", "--quiet", "--help", "-h"]);
for (const a of args)
  if (!known.has(a)) {
    console.error(`Neznámý přepínač ${a}. Použijte --help.`);
    process.exit(2);
  }
if (args.has("--help") || args.has("-h")) {
  console.log(
    "Použití: pnpm demo:seed [--reset | --wipe] [--keep-2fa] [--quiet]\nPodrobnosti: clients/opsys/README.md",
  );
  process.exit(0);
}

const slug = process.env.CLIENT ?? "opsys";
if (slug !== "opsys") {
  console.error(`Demo data patří jen klientovi „opsys“ (CLIENT=${slug}).`);
  process.exit(2);
}
const root = path.resolve(import.meta.dirname, "..");
const config = (
  (await import(pathToFileURL(path.join(root, "clients", slug, "config.ts")).href)) as {
    default: ClientConfig;
  }
).default;

const env = loadEnv();
if (env.NODE_ENV === "production" && process.env.DEMO_SEED_ALLOW_PRODUCTION !== "1") {
  console.error(
    "Demo data se do produkčního prostředí nenasazují (NODE_ENV=production). " +
      "Chcete-li přesto nasadit ukázkovou instanci, nastavte DEMO_SEED_ALLOW_PRODUCTION=1.",
  );
  process.exit(2);
}
if (args.has("--wipe")) {
  const host = new URL(env.DATABASE_URL.replace(/^postgres(ql)?:/, "http:")).hostname;
  if (
    !["localhost", "127.0.0.1", "::1", "[::1]"].includes(host) &&
    process.env.DEMO_SEED_ALLOW_REMOTE_WIPE !== "1"
  ) {
    console.error(
      `--wipe maže všechna obchodní data a databáze neběží lokálně (${host}). ` +
        "Pokud je to ukázková instance, nastavte DEMO_SEED_ALLOW_REMOTE_WIPE=1.",
    );
    process.exit(2);
  }
}

const { services, close } = createDemoServices({
  config,
  databaseUrl: env.DATABASE_URL,
  appUrl: env.APP_URL,
  authSecret: env.AUTH_SECRET,
  encryption: {
    APP_ENCRYPTION_KEY: env.APP_ENCRYPTION_KEY,
    APP_ENCRYPTION_KEYS: env.APP_ENCRYPTION_KEYS,
  },
  filesDir: env.FILES_DIR,
});

let code = 0;
try {
  const quiet = args.has("--quiet");
  const report = await seedDemo(services, {
    reset: args.has("--reset"),
    wipe: args.has("--wipe"),
    keep2fa: args.has("--keep-2fa"),
    ...(process.env.DATABASE_MIGRATE_URL ? { migratorUrl: process.env.DATABASE_MIGRATE_URL } : {}),
    log: quiet ? () => {} : (m) => console.log(m),
  });
  console.log(`Demo data nasazena za ${report.seconds} s:`);
  console.log(
    Object.entries(report.counts)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", "),
  );
  console.log("\nPřihlášení (testovací hodnoty jen pro demo data, viz clients/opsys/README.md):");
  for (const u of DEMO_USERS) console.log(`  ${u.email.padEnd(32)} ${u.name} (${u.role})`);
  console.log(`  společné heslo: ${DEMO_PASSWORD}`);
} catch (err) {
  console.error(`Demo seed selhal: ${err instanceof Error ? err.message : String(err)}`);
  if (process.env.DEMO_SEED_DEBUG && err instanceof Error) console.error(err.stack);
  code = 1;
} finally {
  await close();
}
process.exit(code);
