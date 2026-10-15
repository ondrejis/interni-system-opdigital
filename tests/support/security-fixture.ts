import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { collectPermissions } from "@rebar/core";
import { schema, type Db } from "@rebar/core/db";
import {
  clearEntityPolicies,
  createEntityRegistry,
  registerEntityPolicies,
} from "@rebar/core/entities";
import { createModuleDeps, type ModuleDeps } from "@rebar/core/module-server";
import { createCtx, loadActor, type Ctx } from "@rebar/core/rbac";
import { runSeed } from "@rebar/core/seed";
import { createCipher, parseKeyRing } from "@rebar/core/security";
import { createSettings } from "@rebar/core/settings";
import opsysSeed from "../../clients/opsys/seed/index";
import { ALL_MODULES } from "../../apps/web/src/modules";
import { buildRegistry, collectServers } from "../../apps/web/src/server/modules-server";

/** Role OPSYS (`clients/opsys/seed/roles.ts`): vlastník, partner (Patrik) a externí spolupracovník. */
export const ROLE_KEYS = ["owner", "partner", "external"] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export type Person = { id: string; ctx: Ctx; role: RoleKey; name: string };

/**
 * Základ pro testy napříč moduly: uživatelé `owner`, `partner` a `external` s oprávněními ze seedu klienta a hotová
 * `ModuleDeps`. Data modulů (klienti, obchody, zakázky, soukromé záznamy…) si staví testy sami, popř. je doplní
 * QA-SEC do `tests/support/fixture.ts` (D §3.1). Dřívější sestava stavebních modulů je jen v historii gitu (tag `opsys-s0`).
 */
export type Fixture = Awaited<ReturnType<typeof buildFixture>>;

export async function buildFixture(db: Db) {
  clearEntityPolicies();
  const collected = collectServers(ALL_MODULES);
  const registry = buildRegistry(collected.entities);
  createEntityRegistry(collected.entities); // ověří konzistenci registru
  registerEntityPolicies(registry);
  const catalog = new Set(collectPermissions(ALL_MODULES).map((p) => p.key));
  // role mají v testu vlastní klíče (`sec-owner`…), aby se nepletly s rolemi, které zakládají jiné soubory testů
  await runSeed(
    db,
    { roles: (opsysSeed.roles ?? []).map((r) => ({ ...r, key: `sec-${r.key}` })) },
    {
      config: { security: { require2faRoles: [], idleTimeoutMinutes: 480 } } as never,
      catalog,
      moduleSeeds: ALL_MODULES.flatMap((m) => (m.seed ? [m.seed] : [])),
    },
  );

  const cipher = createCipher(
    parseKeyRing({ APP_ENCRYPTION_KEY: randomBytes(32).toString("base64") }),
  );
  const deps: ModuleDeps = createModuleDeps(
    {
      registry,
      queue: { send: async () => null },
      storage: {
        put: async () => {},
        get: async () => null,
        delete: async () => {},
      } as never,
      settings: createSettings(cipher),
      cipher,
      baseURL: "http://localhost:3100",
      emit: async () => {},
      calendarLayers: collected.calendarLayers,
    },
    // služby ostatních modulů nejsou zapnuté, dokud je modul neimplementuje; testy si je doplní z `createStubServices`
    { services: {}, contributions: {} },
  );

  async function addUser(key: string, role: RoleKey): Promise<Person> {
    const [r] = await db
      .select()
      .from(schema.role)
      .where(eq(schema.role.key, `sec-${role}`));
    const [u] = await db
      .insert(schema.user)
      .values({
        name: `Uživatel ${key}`,
        email: `${key}-${randomBytes(3).toString("hex")}@test.example`,
        roleId: r!.id,
      })
      .returning();
    const actor = (await loadActor(db, u!.id, { catalog }))!;
    return { id: u!.id, ctx: createCtx(db, actor), role, name: u!.name };
  }
  const people = {
    owner: await addUser("owner", "owner"),
    partner: await addUser("partner", "partner"),
    external: await addUser("external", "external"),
  };
  /** Kontext člověka, volitelně nad jinou databází (transakcí). */
  const ctxOf = (person: Person, tx?: Db): Ctx => (tx ? { ...person.ctx, db: tx } : person.ctx);

  return {
    deps,
    registry,
    collected,
    catalog,
    people,
    ctxOf,
    /** Id záznamů sestavy podle jména (zatím prázdné; doplní QA-SEC). Probes se jen kontrolují na úplnost. */
    ids: {} as Record<string, string>,
  };
}

class Discard extends Error {}

/**
 * Celý soubor testů běží v jedné transakci, která se na konci vždy vrátí: sestava (lidé, data) není vidět ostatním
 * souborům testů a po testu nezůstane nic.
 */
export async function isolatedDb(open: Db): Promise<{ db: Db; discard: () => Promise<void> }> {
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  let db!: Db;
  const done = open
    .transaction(async (tx) => {
      db = tx as unknown as Db;
      await held;
      throw new Discard();
    })
    .catch((e) => {
      if (!(e instanceof Discard)) throw e;
    });
  // transakce se otevře asynchronně; počkáme, až je `db` k dispozici
  for (let i = 0; i < 200 && !db; i++) await new Promise((r) => setTimeout(r, 5));
  if (!db) throw new Error("Transakci se nepodařilo otevřít.");
  return {
    db,
    discard: async () => {
      release();
      await done;
    },
  };
}
