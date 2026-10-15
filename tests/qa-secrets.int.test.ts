import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@rebar/core/db";
import type { CommandDef, ModuleDeps } from "@rebar/core/module-server";
import type { Ctx } from "@rebar/core/rbac";
import { connectAppDb } from "@rebar/core/testing";
import { assertCommandPermission } from "../apps/web/src/server/command-gate";
import { serialize } from "./support/canary";
import { fullDeps } from "./support/fixture";
import { buildFixture, isolatedDb, type Fixture } from "./support/security-fixture";

/*
  Tajemství (QA-SEC): přístupové tokeny a klíče integrací se ukládají jen šifrované a nikdy se nevrací v odpovědi API,
  nepíšou se do historie změn, do protokolů příchozích událostí ani do těl webhooků. Test uloží známé „tajemství“
  příkazy modulů a prohledá celou databázi (každou tabulku) i odpovědi příkazů.
*/

const app = connectAppDb();
let f: Fixture;
let db: Db;
let deps: ModuleDeps;
let discard: () => Promise<void>;
let owner: Ctx;
const META = "SECRET-QASEC-META-TOKEN-0001-abcdefghij";
const FAKT = "SECRET-QASEC-FAKTUROID-0002-abcdefghij";

async function run(name: string, input: unknown = {}): Promise<unknown> {
  const cmd = f.collected.commands.get(name) as CommandDef | undefined;
  if (!cmd) throw new Error(`Příkaz ${name} neexistuje.`);
  assertCommandPermission(owner, cmd);
  return cmd.handler(owner, cmd.input.parse(input), deps);
}

const outputs: Record<string, string> = {};

beforeAll(async () => {
  ({ db, discard } = await isolatedDb(app.db));
  f = await buildFixture(db);
  deps = fullDeps(f);
  owner = f.people.owner.ctx;
  const save = async (label: string, name: string, input: unknown = {}) => {
    try {
      outputs[label] = serialize(await run(name, input));
    } catch (e) {
      outputs[label] = `chyba: ${(e as Error).message}`;
    }
  };
  await save("reklama.save", "reklama.connection.save", { accessToken: META });
  await save("reklama.get", "reklama.connection.get");
  await save("reklama.test", "reklama.connection.test");
  await save("fakturoid.save", "muj-prostor.fakturoid.save", {
    account: "test-account",
    clientId: "client-id-123",
    clientSecret: FAKT,
    contactEmail: "kontakt@example.test",
  });
  await save("fakturoid.status", "muj-prostor.fakturoid.status");
}, 120_000);
afterAll(async () => {
  await discard();
  await app.close();
});

describe("tajemství integrací", () => {
  it("příkazy tajemství přijmou (jinak test nic neověřuje)", () => {
    expect(outputs["reklama.save"], outputs["reklama.save"]).not.toMatch(/^chyba/);
    expect(outputs["fakturoid.save"], outputs["fakturoid.save"]).not.toMatch(/^chyba/);
  });

  it("odpovědi příkazů tajemství nevracejí", () => {
    for (const [label, out] of Object.entries(outputs)) {
      expect(out, label).not.toContain("SECRET-QASEC");
    }
  });

  it("žádná tabulka databáze (ani historie změn, příchozí události, doručení webhooků) neobsahuje tajemství v čitelné podobě", async () => {
    const tables = (await db.execute(
      sql`select tablename from pg_tables where schemaname = 'public'`,
    )) as unknown as { tablename: string }[];
    const hits: string[] = [];
    for (const { tablename } of tables) {
      const rows = (await db.execute(
        sql`select count(*)::int as n from ${sql.identifier(tablename)} t where t::text like '%SECRET-QASEC%'`,
      )) as unknown as { n: number }[];
      if (rows[0]!.n > 0) hits.push(`${tablename} (${rows[0]!.n})`);
    }
    expect(hits, "tabulky s tajemstvím v čitelné podobě").toEqual([]);
  });

  it("šifrovaná tajemství existují (nejde o to, že se nic neuložilo) a jsou v obálce šifry", async () => {
    const rows = (await db.execute(
      sql`select provider, left(data_enc, 12) as head from integration_credential`,
    )) as unknown as { provider: string; head: string }[];
    expect(rows.length, "uložené přihlašovací údaje integrací").toBeGreaterThan(0);
    for (const r of rows) expect(r.head, r.provider).not.toMatch(/SECRET|^\{/);
  });
});
