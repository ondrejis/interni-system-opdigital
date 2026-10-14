import path from "node:path";
import { pathToFileURL } from "node:url";
import { collectPermissions, resolveModules, type ClientConfig } from "@rebar/core";
import { createAuth, bootstrapOwner } from "@rebar/core/auth";
import { createDb } from "@rebar/core/db";
import { runSeed, type Seed } from "@rebar/core/seed";
import { ensureSeedViews } from "@rebar/core/views";
import { ALL_MODULES } from "../apps/web/src/modules";
import { loadEnv } from "../apps/web/src/server/env";
import { collectServers } from "../apps/web/src/server/modules-server";

/**
 * Doplní výchozí data klienta (role, pipeline, číselníky, řady, DPH) a volitelně založí prvního uživatele.
 * Idempotentní — bezpečné spouštět při každé aktualizaci.
 *   CLIENT=opsys OWNER_EMAIL=… OWNER_NAME="Jan Majitel" OWNER_PASSWORD=… pnpm db:seed
 */
const slug = process.env.CLIENT ?? "opsys";
const root = path.resolve(import.meta.dirname, "..");
const config = (
  (await import(pathToFileURL(path.join(root, "clients", slug, "config.ts")).href)) as {
    default: ClientConfig;
  }
).default;
const seed = (
  (await import(pathToFileURL(path.join(root, "clients", slug, "seed", "index.ts")).href)) as {
    default: Seed;
  }
).default;

const env = loadEnv();
const modules = resolveModules(config.modules, ALL_MODULES);
const catalog = new Set(collectPermissions(modules).map((p) => p.key));

const { db, close } = createDb(env.DATABASE_URL, { max: 2 });
try {
  await runSeed(db, seed, {
    config,
    catalog,
    moduleSeeds: modules.flatMap((m) => (m.seed ? [m.seed] : [])),
  });
  // idempotentní doplnění dat modulů do existující databáze (např. nové výchozí stavy CRM)
  for (const ensure of collectServers(modules).ensure) await ensure(db);
  console.log(`Seed klienta „${slug}“ hotový.`);

  const { OWNER_EMAIL: email, OWNER_NAME: name, OWNER_PASSWORD: password } = process.env;
  if (email && password) {
    // Auth se tu používá jen k založení účtu; e-maily se z tohoto procesu neposílají.
    const auth = createAuth({
      db,
      baseURL: env.APP_URL,
      secret: env.AUTH_SECRET,
      appName: config.branding.name,
      idleTimeoutMinutes: config.security.idleTimeoutMinutes,
      mailer: { send: async () => {} },
    });
    const res = await bootstrapOwner({ auth, db }, { email, name: name ?? "Majitel", password });
    console.log(
      res.created ? `Založen první uživatel ${email}.` : `Uživatel ${email} už existuje.`,
    );
    // výchozí pohledy potřebují vlastníka; na čisté databázi existuje až teď
    await ensureSeedViews(
      db,
      modules.flatMap((m) => m.seed?.views ?? []),
    );
  }
} finally {
  await close();
}
