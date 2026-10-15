import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  collectPermissions,
  resolveModules,
  type ClientConfig,
  type ModuleManifest,
} from "@rebar/core";
import { createAuth } from "@rebar/core/auth";
import { createDb, type Db } from "@rebar/core/db";
import { setDomainEvents } from "@rebar/core/events";
import { createModuleDeps, type CommandDef, type ModuleDeps } from "@rebar/core/module-server";
import { createCtx, loadActor, type Ctx } from "@rebar/core/rbac";
import { createCipher, parseKeyRing, type Cipher } from "@rebar/core/security";
import { createSettings } from "@rebar/core/settings";
import { assertDevEnvironment } from "../clients/opsys/seed/dev/guard";
import {
  DEV_CREDENTIALS_FILE,
  DEV_USERS,
  devRolesExist,
  disableTwoFactorRequirement,
  ensureDevUsers,
} from "../clients/opsys/seed/dev/users";
import { seedDevData } from "../clients/opsys/seed/dev/data";
import type { DevSeedResult, DevSeedRuntime } from "../clients/opsys/seed/dev/runtime";
import { ALL_MODULES } from "../apps/web/src/modules";
import { loadEnv } from "../apps/web/src/server/env";
import { buildRegistry, collectServers } from "../apps/web/src/server/modules-server";

/**
 * `pnpm dev:seed`: smyšlená vývojová data pro lokální vývoj (jen NODE_ENV=development a lokální databáze).
 * Zakládá dva vývojové uživatele (`owner`, `partner`) s náhodnými hesly a pak vývojová data přes příkazy modulů, takže
 * platí hooky (rozdělení plateb, historie fází, viditelnost). Žádná reálná data, žádná reálná e-mailová ani telefonní čísla.
 *
 *   pnpm db:migrate && pnpm db:seed && pnpm dev:seed
 *
 * Hesla se generují lokálně a zapíšou do gitignorovaného `.data/dev-credentials.txt` (práva 600); do výpisu ani do repa
 * se nedostanou. Povinné 2FA rolí owner a partner se vypne jen výslovně (`--no-2fa` nebo `DEV_SEED_NO_2FA=1`); další
 * `pnpm db:seed` ho znovu zapne. Vývojová data se zakládají jednou (druhé spuštění nic nepřidá, jen doplní chybějící
 * uživatele); od začátku: `pnpm db:reset && pnpm db:migrate && pnpm db:seed && pnpm dev:seed`.
 */

export type BuildRuntimeOptions = {
  db: Db;
  modules: readonly ModuleManifest[];
  cipher: Cipher;
  ids: { owner: string; partner: string };
  log?: (message: string) => void;
};

/**
 * Sestaví prostředí pro příkazy modulů (registr entit, služby, obsluhy událostí) stejně jako aplikace. Fronta a úložiště
 * jsou prázdné náhražky: vývojový seed nic neodesílá ven. `dispose` vrátí obsluhu událostí do původního stavu.
 */
export async function buildDevRuntime(opts: BuildRuntimeOptions) {
  const { db, modules, cipher, ids } = opts;
  const collected = collectServers(modules);
  const registry = buildRegistry(collected.entities);
  const catalog = new Set(collectPermissions(modules).map((p) => p.key));
  const deps: ModuleDeps = createModuleDeps(
    {
      registry,
      queue: { send: async () => null },
      storage: { put: async () => {}, get: async () => null, delete: async () => {} } as never,
      settings: createSettings(cipher),
      cipher,
      baseURL: "http://localhost:3100",
      emit: async () => {},
      calendarLayers: collected.calendarLayers,
    },
    collected,
  );
  setDomainEvents(collected.eventHandlers, () => deps);
  const ctxOf = async (userId: string): Promise<Ctx> => {
    const actor = await loadActor(db, userId, { catalog });
    if (!actor) throw new Error(`Uživatel ${userId} nejde načíst.`);
    // Seed jedná jménem uživatele i dřív, než si nastaví 2FA (omezení relace se týká přihlášení, ne tohoto skriptu).
    return createCtx(db, { ...actor, restriction: null });
  };
  const run = async (name: string, ctx: Ctx, input: unknown) => {
    const cmd = collected.commands.get(name) as CommandDef | undefined;
    if (!cmd) throw new Error(`Příkaz „${name}“ neexistuje (je modul zapnutý?).`);
    try {
      return await cmd.handler(
        ctx as never,
        (cmd.input as { parse: (v: unknown) => never }).parse(input),
        deps,
      );
    } catch (err) {
      // Drizzle obaluje chyby PostgreSQL do „Failed query“; skutečná příčina je v `cause`.
      const reasons: string[] = [];
      for (let e: unknown = err; e instanceof Error; e = e.cause) reasons.push(e.message.split("\n")[0]!);
      throw new Error(`Příkaz ${name} selhal: ${reasons.join(" | ")}`, { cause: err });
    }
  };
  const runtime: DevSeedRuntime = {
    db,
    registry,
    owner: await ctxOf(ids.owner),
    partner: await ctxOf(ids.partner),
    run: run as DevSeedRuntime["run"],
    log: opts.log,
  };
  return { runtime, collected, deps, dispose: () => setDomainEvents(undefined, undefined) };
}

/**
 * Založí vývojová data (viz `seedDevData`) nad hotovými uživateli. Vše v jedné transakci: když cokoli selže, v databázi
 * nezůstane polovina dat (a druhé spuštění ji nepovažuje za hotovou).
 */
export async function runDevSeed(opts: BuildRuntimeOptions): Promise<DevSeedResult> {
  return opts.db.transaction(async (tx) => {
    const { runtime, dispose } = await buildDevRuntime({ ...opts, db: tx as unknown as Db });
    try {
      return await seedDevData(runtime);
    } finally {
      dispose();
    }
  });
}

async function main() {
  const slug = process.env.CLIENT ?? "opsys";
  const root = path.resolve(import.meta.dirname, "..");
  const config = (
    (await import(pathToFileURL(path.join(root, "clients", slug, "config.ts")).href)) as {
      default: ClientConfig;
    }
  ).default;
  const env = loadEnv();
  assertDevEnvironment({
    nodeEnv: process.env.NODE_ENV,
    databaseUrl: env.DATABASE_URL,
    appUrl: env.APP_URL,
  });
  const noTwoFactor = process.argv.includes("--no-2fa") || process.env.DEV_SEED_NO_2FA === "1";
  const modules = resolveModules(config.modules, ALL_MODULES);
  const cipher = createCipher(parseKeyRing(env));

  const { db, close } = createDb(env.DATABASE_URL, { max: 4 });
  try {
    if (!(await devRolesExist(db)))
      throw new Error("Role owner a partner chybí. Nejdřív spusťte `pnpm db:migrate && pnpm db:seed`.");
    const auth = createAuth({
      db,
      baseURL: env.APP_URL,
      secret: env.AUTH_SECRET,
      appName: config.branding.name,
      idleTimeoutMinutes: config.security.idleTimeoutMinutes,
      mailer: { send: async () => {} },
    });
    const { ids, fresh } = await ensureDevUsers({ db, auth, credentialsFile: DEV_CREDENTIALS_FILE });
    if (fresh.length)
      console.log(
        `Vývojoví uživatelé (${fresh.map((w) => DEV_USERS[w].email).join(", ")}): hesla jsou v ${path.relative(root, DEV_CREDENTIALS_FILE)}.`,
      );
    if (noTwoFactor) {
      await disableTwoFactorRequirement(db);
      console.log("Povinné 2FA rolí owner a partner je vypnuto (jen tato lokální databáze).");
    }
    const result = await runDevSeed({ db, modules, cipher, ids, log: console.log });
    console.log(result.skipped ? "Vývojová data už v databázi jsou, nic se nepřidalo." : "Vývojová data založena.");
  } finally {
    await close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
