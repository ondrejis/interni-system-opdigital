import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, inject } from "vitest";
import { MODULE_IDS } from "@rebar/core";
import { coreJobs } from "@rebar/core/jobs";
import { migrationSources, runMigrations } from "@rebar/core/migrations";
import opsysConfig from "../clients/opsys/config";
import { isValidIco } from "../clients/opsys/seed/ico";
import { Kit, sql } from "../clients/opsys/seed/kit";
import { seedDemo, type SeedReport } from "../clients/opsys/seed/run";
import { DEMO_USERS } from "../clients/opsys/seed/users";
import { createDemoServices } from "../scripts/lib/demo-services";

/**
 * Demo data klienta OPSYS: seed se spustí do čerstvé databáze a ověří se, že proběhne, založí uživatele podle rolí
 * a ukázkové kontakty, že je opakované spuštění odmítnuto a že `--reset` smaže jen demo data.
 */
const shared = inject("rebarDb");

/**
 * Seed odmítá databázi s cizími daty a ostatní integrační testy sdílenou testovací databázi plní, proto má tento test
 * vlastní čerstvou databázi (vytvoří se a po testu zahodí), stejně jako to dělá globální příprava testů.
 */
const dbName = `rebar_demo_${Math.random().toString(36).slice(2, 10)}`;
const withDb = (url: string) => url.replace(/\/[^/?]+(\?.*)?$/, `/${dbName}$1`);
const urls = { admin: shared.admin, migrator: withDb(shared.migrator), app: withDb(shared.app) };
{
  const admin = postgres(shared.admin, { max: 1, onnotice: () => {} });
  await admin.unsafe(
    `CREATE DATABASE "${dbName}" OWNER rebar_migrator TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER icu ICU_LOCALE 'cs-CZ' LOCALE 'en_US.UTF-8'`,
  );
  await admin.end({ timeout: 5 });
  await runMigrations({
    url: urls.migrator,
    appRole: "rebar_app",
    queues: coreJobs,
    folders: migrationSources(path.resolve(import.meta.dirname, ".."), MODULE_IDS),
  });
}
const filesDir = mkdtempSync(path.join(tmpdir(), "opsys-demo-seed-"));
const demo = createDemoServices({
  config: opsysConfig,
  databaseUrl: urls.app,
  appUrl: "http://localhost:3100",
  authSecret: "test-secret-test-secret-test-secret-0123456789",
  encryption: { APP_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64") },
  filesDir,
});
const s = demo.services;
const kit = new Kit(s, () => {});
let report: SeedReport;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- řádky dotazů a výsledky příkazů mají volný tvar
type Row = Record<string, any>;
const q = async (query: ReturnType<typeof sql>) => (await s.db.execute(query)) as unknown as Row[];

afterAll(async () => {
  await demo.close();
  rmSync(filesDir, { recursive: true, force: true });
  const admin = postgres(shared.admin, { max: 1, onnotice: () => {} });
  await admin.unsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.end({ timeout: 5 });
});

beforeAll(async () => {
  report = await seedDemo(s, { migratorUrl: urls.migrator });
}, 120_000);

describe("demo data OPSYS", () => {
  it("založí uživatele podle rolí a ukázkové kontakty", async () => {
    expect(report.users.map((u) => u.role).sort()).toEqual(["externista", "owner", "partner"]);
    for (const u of DEMO_USERS) {
      const [row] = await q(
        sql`select r.key as role from "user" u join role r on r.id = u.role_id where u.email = ${u.email}`,
      );
      expect(row?.role).toBe(u.role);
    }
    expect(report.counts.company).toBeGreaterThanOrEqual(3);
    expect(report.counts.person).toBeGreaterThanOrEqual(3);
  });

  it("IČO ukázkových firem je formálně platné a všechna data jsou označená jako demo", async () => {
    const rows = await q(sql`select ico, custom from company where deleted_at is null`);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(isValidIco(String(r.ico))).toBe(true);
      expect(r.custom?.demo).toBe(true);
    }
  });

  it("opakované spuštění bez přepínače se odmítne a nic nepřepíše", async () => {
    await expect(seedDemo(s, { migratorUrl: urls.migrator })).rejects.toThrow(/Demo data už/);
  });

  it("--reset smaže demo data a nasype je znovu (jen jednou od každé firmy)", async () => {
    await seedDemo(s, { reset: true, migratorUrl: urls.migrator });
    const [r] = await q(sql`select count(*)::int as n from company where deleted_at is null`);
    expect(r?.n).toBe(report.counts.company);
  }, 120_000);

  it("kit volá příkazy modulů jako uživatel (hledání kontaktů)", async () => {
    const [owner] = await q(sql`select id from "user" where email = ${DEMO_USERS[0]!.email}`);
    const { loadActor, createCtx } = await import("@rebar/core/rbac");
    const ctx = createCtx(s.db, (await loadActor(s.db, owner!.id, { catalog: s.catalog }))!);
    const found = await kit.run(ctx, "kontakty.search", { q: "Pekárna" });
    expect(found.companies.map((c: { name: string }) => c.name)).toContain(
      "Pekárna Vondráček s.r.o.",
    );
  });
});
