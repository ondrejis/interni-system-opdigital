import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { collectPermissions } from "@rebar/core";
import { schema, type Db } from "@rebar/core/db";
import {
  clearEntityPolicies,
  createEntityRegistry,
  registerEntityPolicies,
} from "@rebar/core/entities";
import type { ModuleDeps } from "@rebar/core/module-server";
import { createCtx, loadActor } from "@rebar/core/rbac";
import { runSeed } from "@rebar/core/seed";
import { createCipher, parseKeyRing } from "@rebar/core/security";
import { createSettings } from "@rebar/core/settings";
// Původní seed rolí (owner, partner, externista) je dnes v tests/support/legacy/fixture.ts (LEGACY_ROLES).
const opsysSeed = { roles: [] as never[] };
import { ALL_MODULES } from "../../apps/web/src/modules";
import { buildRegistry, collectServers } from "../../apps/web/src/server/modules-server";
import { dochazkaPart } from "./fixture/dochazka";
import { ROLE_KEYS, type FixtureEnv, type Person, type RoleKey } from "./fixture/env";
import { kalendarPart } from "./fixture/kalendar";
import { kontaktyPart } from "./fixture/kontakty";
import { poptavkyPart } from "./fixture/poptavky";
import { zakazkyPart } from "./fixture/zakazky";

/** Částky ve fixtuře jsou „podpisové“ (7 777 700), aby je testy v odpovědích spolehlivě našly. */
export const MONEY = { value: 7_777_700 };

export { ROLE_KEYS };
export type { RoleKey };

/**
 * Pevná sestava pro matici oprávnění: role OPSYS (`clients/opsys/seed`: owner, partner, externista) a dvě zakázky.
 * Zakázka A patří externistovi A, zakázka B externistovi B (cizí zakázka z pohledu A). Sestava je složená po modulech
 * (`tests/support/fixture/<modul>.ts`): odstranění nebo přepracování modulu = úprava jeho souboru a jednoho řádku níže.
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
  const deps: ModuleDeps = {
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
  };

  const entityDef = (key: string) => collected.entities.find((e) => e.key === key)!;

  /* ---------- lidé ---------- */
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
    externistaA: await addUser("externistaA", "externista"),
    externistaB: await addUser("externistaB", "externista"),
  };
  const env: FixtureEnv = { db, collected, entityDef, people };

  /* ---------- data po modulech ---------- */
  const kontakty = await kontaktyPart(env);
  const zakazky = await zakazkyPart(env, kontakty.client);
  const poptavky = await poptavkyPart(env, zakazky.jobB);
  const dochazka = await dochazkaPart(env, zakazky.jobA, zakazky.jobB);
  const kalendar = await kalendarPart(env, zakazky.jobA, zakazky.jobB);

  return {
    deps,
    registry,
    collected,
    catalog,
    people,
    jobA: zakazky.jobA,
    jobB: zakazky.jobB,
    ids: {
      client: kontakty.client,
      supplier: kontakty.supplier,
      contact: kontakty.contact,
      template: zakazky.template,
      ...poptavky,
      ...dochazka,
      ...kalendar,
    },
  };
}

class Discard extends Error {}

/**
 * Celý soubor testů běží v jedné transakci, která se na konci vždy vrátí: sestava (zakázky, faktury, lidé) není vidět
 * ostatním souborům testů (např. kontrola čistoty databáze v testu demo dat) a po testu nezůstane nic.
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
