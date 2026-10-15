import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveModules } from "@rebar/core";
import { createAuth, DEFAULT_TWO_FACTOR_POLICY } from "@rebar/core/auth";
import type { Db } from "@rebar/core/db";
import { connectAppDb, rebarDbUrls } from "@rebar/core/testing";
import { createCipher, parseKeyRing } from "@rebar/core/security";
import config from "../clients/opsys/config";
import { devSeedProblems } from "../clients/opsys/seed/dev/guard";
import { disableTwoFactorRequirement, ensureDevUsers } from "../clients/opsys/seed/dev/users";
import { ALL_MODULES } from "../apps/web/src/modules";
import { buildDevRuntime, runDevSeed } from "../scripts/dev-seed";

/*
  Výchozí data klienta OPSYS a vývojová data (SEED): `pnpm db:seed` je idempotentní a zakládá, co spec chce
  (role, pipeline, typy aktivit, šablony zakázek, řadu, přehledy, pohledy); `pnpm dev:seed` na čisté databázi proběhne
  přes příkazy modulů, partner nevidí soukromá data a saldo vychází. `db:seed` se spouští jako skutečný skript (podproces),
  dev seed v procesu nad stejnou databází (kopie šablony pro tento soubor testů).
*/

const root = path.resolve(import.meta.dirname, "..");
const urls = rebarDbUrls();
const app = connectAppDb();
const db: Db = app.db;
const modules = resolveModules(config.modules, ALL_MODULES);
const secret = () => randomBytes(24).toString("base64url");
const appEncryptionKey = randomBytes(32).toString("base64");
const authSecret = secret() + secret();
const ownerEmail = `owner-${randomBytes(3).toString("hex")}@test.example`;
const ownerPassword = secret();
let filesDir: string;

const rows = async <T = Record<string, unknown>>(q: ReturnType<typeof sql>) =>
  (await db.execute(q)) as unknown as T[];

/** Spustí skutečný `scripts/db-seed.ts` nad databází tohoto souboru testů. */
function dbSeed() {
  return execFileSync(path.join(root, "node_modules", ".bin", "tsx"), ["scripts/db-seed.ts"], {
    cwd: root,
    env: {
      ...process.env,
      CLIENT: "opsys",
      DATABASE_URL: urls.app,
      APP_URL: "http://localhost:3100",
      AUTH_SECRET: authSecret,
      APP_ENCRYPTION_KEY: appEncryptionKey,
      FILES_DIR: filesDir,
      OWNER_EMAIL: ownerEmail,
      OWNER_NAME: "Test Vlastník",
      OWNER_PASSWORD: ownerPassword,
    },
    encoding: "utf8",
  });
}

/** Otisk výchozích dat: seznamy id a klíčů, ne jen počty (zdvojený řádek i znovu založená položka se projeví). */
async function snapshot() {
  const ids = async (table: string, expr = "id::text") =>
    (await rows<{ v: string }>(sql.raw(`select ${expr} as v from ${table} order by 1`))).map(
      (r) => r.v,
    );
  return {
    role: await ids("role"),
    rolePermission: await ids("role_permission", "role_id::text || permission || scope"),
    pipeline: await ids("pipeline"),
    pipelineStage: await ids("pipeline_stage"),
    lookupList: await ids("lookup_list"),
    lookupItem: await ids("lookup_item"),
    series: await ids("number_series", "key"),
    taskType: await ids("task_type"),
    jobTemplate: await ids("job_template"),
    dashboard: await ids("dashboard"),
    savedView: await ids("saved_view"),
    setting: await ids("setting", "key"),
    user: await ids('"user"'),
    account: await ids("account"),
  };
}

beforeAll(() => {
  filesDir = fs.mkdtempSync(path.join(os.tmpdir(), "opsys-seed-"));
}, 60_000);

afterAll(async () => {
  fs.rmSync(filesDir, { recursive: true, force: true });
  await app.close();
});

describe("pnpm db:seed (výchozí data klienta)", () => {
  let first: Awaited<ReturnType<typeof snapshot>>;

  it("na čisté databázi založí, co spec chce, a běží podruhé beze změny", async () => {
    dbSeed();
    first = await snapshot();
    const out = dbSeed();
    expect(out).toContain("Uživatel");
    expect(await snapshot()).toEqual(first);
  }, 120_000);

  it("pipeline Obchody: pět fází s pravděpodobností a dobou do zvýraznění", async () => {
    const stages = await rows<{ name: string; p: number; r: number }>(
      sql`select s.name, s.probability_pct as p, s.rotting_days as r
          from pipeline_stage s join pipeline p on p.id = s.pipeline_id
          where p.entity_type = 'deal' and p.key = 'default' and p.name = 'Obchody' and s.deleted_at is null
          order by s.position`,
    );
    expect(stages.map((s) => [s.name, s.p, s.r])).toEqual([
      ["Nová poptávka", 10, 1],
      ["Kontaktováno", 20, 5],
      ["Schůzka / konzultace", 40, 7],
      ["Nabídka odeslaná", 60, 7],
      ["Vyjednávání", 80, 10],
    ]);
  });

  it("důvody prohry, typy aktivit a řada čísel zakázek", async () => {
    const reasons = await rows<{ label: string }>(
      sql`select i.label from lookup_item i join lookup_list l on l.id = i.list_id
          where l.key = 'deal.lost_reason' and i.deleted_at is null`,
    );
    expect(reasons.length).toBeGreaterThanOrEqual(5);
    const types = await rows<{ key: string; name: string }>(
      sql`select key, name from task_type order by position`,
    );
    expect(types.map((t) => t.name)).toEqual(["Úkol", "Hovor", "Schůzka", "E-mail", "Termín"]);
    const [series] = await rows<{ pattern: string }>(
      sql`select pattern from number_series where key = 'zakazky.cislo'`,
    );
    expect(series?.pattern).toBe("Z-{YYYY}-{NNN}");
  });

  it("šablony zakázek: Web, Marketing (úvodní fáze 2 × 7 000 Kč, retainer), Systémy", async () => {
    const tpl = await rows<{ name: string; type: string; payload: { payments?: unknown[] } }>(
      sql`select name, type, payload from job_template where archived_at is null order by name`,
    );
    expect(tpl.map((t) => t.name).sort()).toEqual(
      ["Marketing – retainer", "Marketing – úvodní fáze", "Systémy", "Web"].sort(),
    );
    const intro = tpl.find((t) => t.name === "Marketing – úvodní fáze")!;
    expect(intro.payload.payments).toEqual([
      expect.objectContaining({ amountMinor: 700_000, issuer: { rule: "owner" } }),
      expect.objectContaining({ amountMinor: 700_000, issuer: { rule: "other" } }),
    ]);
  });

  it("role: owner (systémová), partner podle NAS-02 bez Můj prostor a soukromé části, external bez práv", async () => {
    const roles = await rows<{ key: string; is_system: boolean; require_2fa: boolean }>(
      sql`select key, is_system, require_2fa from role where deleted_at is null`,
    );
    expect(roles.map((r) => r.key).sort()).toEqual(["external", "owner", "partner"]);
    expect(roles.find((r) => r.key === "owner")).toMatchObject({
      is_system: true,
      require_2fa: true,
    });
    expect(roles.find((r) => r.key === "partner")?.require_2fa).toBe(true);
    const perms = new Set(
      (
        await rows<{ permission: string }>(
          sql`select rp.permission from role_permission rp join role r on r.id = rp.role_id where r.key = 'partner'`,
        )
      ).map((p) => p.permission),
    );
    for (const k of [
      "obchody.read",
      "obchody.write",
      "kontakty.read",
      "klienti.write",
      "zakazky.create",
      "ukoly.write",
      "kalendar.write",
      "hodiny.write",
      "finance.read",
      "finance.payments_write",
      "sablony-emailu.write",
      "activity.read",
    ])
      expect(perms.has(k), k).toBe(true);
    for (const k of [
      "private.read",
      "finance.splits_edit",
      "finance.settlements_write",
      "finance.settings",
      "users.manage",
      "roles.manage",
      "settings.integrations",
      "obchody.delete",
      "kontakty.delete",
      "kontakty.export",
      "zakazky.delete",
    ])
      expect(perms.has(k), k).toBe(false);
    expect([...perms].filter((k) => k.startsWith("muj-prostor."))).toEqual([]);
    const [ext] = await rows<{ n: number }>(
      sql`select count(*)::int as n from role_permission rp join role r on r.id = rp.role_id where r.key = 'external'`,
    );
    expect(ext?.n).toBe(0);
    // `private.read` nemá žádná role v tabulce oprávnění (owner ho má jako systémová role)
    const [priv] = await rows<{ n: number }>(
      sql`select count(*)::int as n from role_permission where permission = 'private.read'`,
    );
    expect(priv?.n).toBe(0);
  });

  it("první uživatel z OWNER_* je owner; pozvánka partnera se nezakládá; výchozí přehledy a pohledy jsou", async () => {
    const users = await rows<{ email: string; role: string }>(
      sql`select u.email, r.key as role from "user" u join role r on r.id = u.role_id where u.deleted_at is null`,
    );
    expect(users).toEqual([{ email: ownerEmail, role: "owner" }]);
    const [inv] = await rows<{ n: number }>(sql`select count(*)::int as n from invitation`);
    expect(inv?.n).toBe(0);
    const boards = await rows<{ role: string | null }>(
      sql`select default_for_role as role from dashboard where default_for_role is not null`,
    );
    expect(new Set(boards.map((b) => b.role))).toEqual(new Set(["owner", "partner"]));
    const [views] = await rows<{ n: number }>(sql`select count(*)::int as n from saved_view`);
    expect(views?.n).toBeGreaterThan(0);
  });
});

describe("pnpm dev:seed (vývojová data)", () => {
  let result: Awaited<ReturnType<typeof runDevSeed>>;
  let ids: { owner: string; partner: string };
  let cipher: ReturnType<typeof createCipher>;

  beforeAll(async () => {
    cipher = createCipher(parseKeyRing({ APP_ENCRYPTION_KEY: appEncryptionKey }));
    const auth = createAuth({
      db,
      baseURL: "http://localhost:3100",
      secret: authSecret,
      appName: "OPSYS",
      idleTimeoutMinutes: 480,
      mailer: { send: async () => {} },
    });
    const users = await ensureDevUsers({ db, auth, credentialsFile: null });
    ids = users.ids;
    result = await runDevSeed({ db, modules, cipher, ids });
  }, 180_000);

  it("proběhne na čisté databázi a založí všechny druhy dat", () => {
    expect(result.skipped).toBe(false);
    expect(result).toMatchObject({ companies: 9, people: 7 });
    expect(result.deals).toBeGreaterThanOrEqual(8);
    expect(result.jobs).toBeGreaterThanOrEqual(5);
    expect(result.payments).toBeGreaterThanOrEqual(5);
    expect(result.tasks).toBeGreaterThanOrEqual(8);
    expect(result.timeEntries).toBeGreaterThanOrEqual(8);
    expect(result.privateJobId).toBeTruthy();
  });

  it("zakázky všech tří typů, obchody v různých fázích a výsledcích, retainer a úvodní fáze", async () => {
    const types = await rows<{ type: string }>(
      sql`select distinct type from job where deleted_at is null`,
    );
    expect(types.map((t) => t.type).sort()).toEqual(["marketing", "systemy", "web"]);
    const results = await rows<{ result: string }>(
      sql`select distinct result from deal where deleted_at is null`,
    );
    expect(results.map((r) => r.result).sort()).toEqual(["lost", "open", "won"]);
    const [stagesUsed] = await rows<{ n: number }>(
      sql`select count(distinct stage_id)::int as n from deal where result = 'open' and deleted_at is null`,
    );
    expect(stagesUsed?.n).toBeGreaterThanOrEqual(5);
    const kinds = await rows<{ kind: string }>(
      sql`select distinct kind from payment where deleted_at is null`,
    );
    expect(kinds.map((k) => k.kind)).toEqual(
      expect.arrayContaining(["intro", "retainer", "one_off"]),
    );
    const [ret] = await rows<{ n: number }>(
      sql`select count(*)::int as n from retainer where active`,
    );
    expect(ret?.n).toBe(1);
    const history = await rows<{ n: number }>(
      sql`select count(*)::int as n from deal_stage_history`,
    );
    expect(history[0]?.n).toBeGreaterThan(5);
    const [phases] = await rows<{ n: number }>(
      sql`select count(*)::int as n from job_phase where status = 'done'`,
    );
    expect(phases?.n).toBeGreaterThan(3);
  });

  it("data jsou zjevně fiktivní: e-maily jen v doméně .example nebo .test, telefony +420 999 000, název „(ukázka)“", async () => {
    const mails = await rows<{ value: string }>(
      sql`select value from person_contact_point where kind = 'email'`,
    );
    expect(mails.length).toBeGreaterThan(0);
    for (const m of mails) expect(m.value, m.value).toMatch(/\.example$/);
    const phones = await rows<{ value_norm: string }>(
      sql`select value_norm from person_contact_point where kind = 'phone'`,
    );
    for (const p of phones) expect(p.value_norm, p.value_norm).toMatch(/^\+420999000\d{3}$/);
    const names = await rows<{ name: string; ico: string | null }>(
      sql`select name, ico from company where deleted_at is null`,
    );
    for (const c of names) {
      expect(c.name, c.name).toContain("(ukázka)");
      expect(c.ico).toBeNull();
    }
    const dev = await rows<{ email: string }>(
      sql`select email from "user" where id in (${ids.owner}, ${ids.partner})`,
    );
    for (const u of dev) expect(u.email).toMatch(/@opsys\.test$/);
  });

  it("partner nevidí soukromá data, vlastník ano", async () => {
    const { runtime, dispose } = await buildDevRuntime({ db, modules, cipher, ids });
    try {
      const { run, owner, partner } = runtime;
      const queries: [string, unknown][] = [
        ["zakazky.board", { by: "status", includeClosed: true }],
        ["obchody.board", {}],
        ["finance.payment.list", {}],
        ["ukoly.list", { view: "all", scope: "all" }],
        ["kontakty.search", { q: "Soukrom" }],
        ["hodiny.report", { period: "month", scope: "all", by: "job" }],
        ["ukoly.note.list", { standalone: true, limit: 50 }],
      ];
      for (const [name, input] of queries) {
        const asPartner = JSON.stringify(await run(name, partner, input).catch(() => null));
        const asOwner = JSON.stringify(await run(name, owner, input).catch(() => null));
        expect(asPartner, `${name} (partner)`).not.toMatch(/Soukrom/);
        expect(asOwner, `${name} (owner)`).toMatch(/Soukrom/);
      }
      // také přímý dotaz na to, že soukromé záznamy v databázi jsou a mají zámek
      const priv = await rows<{ n: number }>(
        sql`select (select count(*) from job where is_private) + (select count(*) from deal where is_private) +
                   (select count(*) from company where is_private) + (select count(*) from task where is_private) +
                   (select count(*) from note where is_private) + (select count(*) from payment where is_private) as n`,
      );
      expect(Number(priv[0]?.n)).toBeGreaterThanOrEqual(6);
    } finally {
      dispose();
    }
  }, 60_000);

  it("saldo vychází: rozdíly lidí se sečtou na nulu, pár i částka odpovídají platbám a vyrovnání", async () => {
    const { runtime, dispose } = await buildDevRuntime({ db, modules, cipher, ids });
    try {
      const { run, owner, partner } = runtime;
      const view = await run<{
        perPerson: {
          userId: string;
          invoicedMinor: number;
          entitledMinor: number;
          differenceMinor: number;
        }[];
        pairs: { debtorId: string; creditorId: string; amountMinor: number }[];
        grossPairs: { debtorId: string; creditorId: string; amountMinor: number }[];
        settlementsApplied: number;
      }>("finance.balance", owner, { basis: "paid" });
      // nezávisle z databáze: zaplacené platby a jejich rozdělení, mimo soukromé
      const paid = await rows<{ issuer_id: string; user_id: string; amount_minor: string }>(
        sql`select p.issuer_id, a.user_id, a.amount_minor
            from payment p join payment_allocation a on a.payment_id = p.id
            where p.status = 'paid' and p.deleted_at is null and not p.is_private`,
      );
      const diff = new Map<string, number>();
      for (const r of paid) {
        const amount = Number(r.amount_minor);
        diff.set(r.user_id, (diff.get(r.user_id) ?? 0) - amount); // patří mu
        diff.set(r.issuer_id, (diff.get(r.issuer_id) ?? 0) + amount); // přijal od klienta
      }
      expect([...diff.values()].reduce((a, b) => a + b, 0)).toBe(0);
      expect(diff.get(ids.owner)).toBeGreaterThan(0); // vlastník vyfakturoval víc, než mu patří, dluží partnerovi
      const people = view.perPerson.filter(
        (p) => p.userId === ids.owner || p.userId === ids.partner,
      );
      for (const p of people) expect(p.differenceMinor, p.userId).toBe(diff.get(p.userId));
      // kdo vyfakturoval víc, než mu patří, dluží druhému; vyrovnání 5 000 Kč dluh snižuje
      const gross = view.grossPairs.find(
        (g) => g.debtorId === ids.owner && g.creditorId === ids.partner,
      );
      expect(gross?.amountMinor).toBe(diff.get(ids.owner));
      const net = view.pairs.find((g) => g.debtorId === ids.owner && g.creditorId === ids.partner);
      expect(net?.amountMinor).toBe((diff.get(ids.owner) ?? 0) - 500_000);
      expect(view.settlementsApplied).toBe(1);
      // partner vidí totéž číslo (soukromá platba do salda nepatří)
      const forPartner = await run<typeof view>("finance.balance", partner, { basis: "paid" });
      expect(forPartner.pairs).toEqual(view.pairs);
    } finally {
      dispose();
    }
  }, 60_000);

  it("rozdělení plateb: součet podílů = částka, výchozí 50/50, soukromá platba jen vlastníkovi", async () => {
    const off = await rows<{ id: string }>(
      sql`select p.id::text from payment p
          where p.deleted_at is null
            and p.amount_minor <> (select coalesce(sum(a.amount_minor), 0) from payment_allocation a where a.payment_id = p.id)`,
    );
    expect(off).toEqual([]);
    const [priv] = await rows<{ partner_share: string }>(
      sql`select coalesce(sum(a.amount_minor), 0) as partner_share
          from payment p join payment_allocation a on a.payment_id = p.id
          where p.is_private and a.user_id = ${ids.partner}`,
    );
    expect(Number(priv?.partner_share)).toBe(0);
    const [web] = await rows<{ share: string; amount: string }>(
      sql`select a.amount_minor as share, p.amount_minor as amount
          from payment p join payment_allocation a on a.payment_id = p.id
          where p.description like 'Záloha 50 %%' and a.user_id = ${ids.partner}`,
    );
    expect(Number(web?.share) * 2).toBe(Number(web?.amount));
  });

  it("druhé spuštění nic nepřidá; db:seed po dev seedu zůstává idempotentní", async () => {
    const before = await snapshot();
    const [c1] = await rows<{ n: number }>(sql`select count(*)::int as n from company`);
    const again = await runDevSeed({ db, modules, cipher, ids });
    expect(again.skipped).toBe(true);
    const [c2] = await rows<{ n: number }>(sql`select count(*)::int as n from company`);
    expect(c2?.n).toBe(c1?.n);
    dbSeed();
    expect(await snapshot()).toEqual(before);
  }, 120_000);

  it("2FA nejde vypnout: politika je „all“ a skript dev:seed už žádný přepínač nemá; db:seed vynutí příznak rolí", async () => {
    expect(DEFAULT_TWO_FACTOR_POLICY).toBe("all");
    expect(
      fs.readFileSync(path.resolve(import.meta.dirname, "../scripts/dev-seed.ts"), "utf8"),
    ).not.toMatch(/disableTwoFactorRequirement\(/);
    const need2fa = async () =>
      (
        await rows<{ require_2fa: boolean }>(
          sql`select require_2fa from role where key in ('owner','partner')`,
        )
      ).map((r) => r.require_2fa);
    expect(await need2fa()).toEqual([true, true]); // dev seed ho sám nevypíná
    await disableTwoFactorRequirement(db);
    expect(await need2fa()).toEqual([false, false]);
    dbSeed();
    expect(await need2fa()).toEqual([true, true]);
  }, 120_000);
});

describe("pojistka vývojového seedu", () => {
  const ok = {
    nodeEnv: "development",
    databaseUrl: "postgres://u:p@localhost:5434/rebar_dev",
    appUrl: "http://localhost:3100",
  };

  it("povolí lokální vývoj (i bez NODE_ENV a přes socket)", () => {
    expect(devSeedProblems(ok)).toEqual([]);
    expect(devSeedProblems({ ...ok, nodeEnv: undefined })).toEqual([]);
    expect(devSeedProblems({ ...ok, databaseUrl: "postgres://u@127.0.0.1/db" })).toEqual([]);
    expect(devSeedProblems({ ...ok, databaseUrl: "postgres:///db?host=/tmp/opsys-pg" })).toEqual(
      [],
    );
  });

  it("odmítne produkci, test, cizí databázi i veřejnou adresu", () => {
    expect(devSeedProblems({ ...ok, nodeEnv: "production" })).toHaveLength(1);
    expect(devSeedProblems({ ...ok, nodeEnv: "test" })).toHaveLength(1);
    expect(
      devSeedProblems({ ...ok, databaseUrl: "postgres://u:p@db.example.com/rebar" }),
    ).toHaveLength(1);
    expect(devSeedProblems({ ...ok, appUrl: "https://system.opdigital.cz" })).toHaveLength(1);
    expect(devSeedProblems({ ...ok, databaseUrl: undefined })).toHaveLength(1);
  });
});
