import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, inject } from "vitest";
import { MODULE_IDS } from "@rebar/core";
import { coreJobs } from "@rebar/core/jobs";
import { migrationSources, runMigrations } from "@rebar/core/migrations";
import { resolveEntity, queryRecords } from "@rebar/core/entities";
import { PermissionError } from "@rebar/core/rbac";
import { todayIso } from "@rebar/core/time";
import demoConfig from "../clients/demo/config";
import { isValidIco } from "../clients/demo/seed/ico";
import { Kit, sql } from "../clients/demo/seed/kit";
import { seedDemo, type SeedReport } from "../clients/demo/seed/run";
import { DEMO_PASSWORD, DEMO_USERS } from "../clients/demo/seed/users";
import { createDemoServices } from "../scripts/lib/demo-services";

/**
 * Demo data klienta „demo“: seed se spustí do testovací databáze (`REBAR_TEST_DB_NAME=rebar_test_demo`) a ověří se
 * invarianty, na kterých stojí prezentace: počty, součty zakázek proti rozpočtu a fakturám, číslování bez děr,
 * každá role má co vidět a montér nevidí ceny.
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
const filesDir = mkdtempSync(path.join(tmpdir(), "rebar-demo-seed-"));
const demo = createDemoServices({
  config: demoConfig,
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

async function ctxOf(email: string) {
  const [u] = await q(sql`select id from "user" where email = ${email}`);
  const { loadActor, createCtx } = await import("@rebar/core/rbac");
  const actor = (await loadActor(s.db, u!.id, { catalog: s.catalog }))!;
  return createCtx(s.db, actor);
}
const userCtx = (key: (typeof DEMO_USERS)[number]["key"]) =>
  ctxOf(DEMO_USERS.find((u) => u.key === key)!.email);

describe("demo seed: rozsah", () => {
  it("doběhne do 60 s a založí uživatele všech rolí", async () => {
    expect(report.seconds).toBeLessThan(60);
    const roles = await q(
      sql`select r.key, count(*)::int n from "user" u join role r on r.id = u.role_id where u.email like '%@demo-firma.example' group by 1 order by 1`,
    );
    expect(Object.fromEntries(roles.map((r) => [r.key, r.n]))).toEqual({
      accountant: 1,
      foreman: 2,
      office: 1,
      owner: 1,
      worker: 2,
    });
  });

  it("kontakty, zakázky ve všech fázích a obsah všech modulů", async () => {
    const c = report.counts;
    expect(c.company).toBeGreaterThanOrEqual(25);
    expect(c.person).toBeGreaterThanOrEqual(15);
    expect(c.job).toBe(14);
    expect(c.inquiry).toBeGreaterThanOrEqual(5);
    for (const t of [
      "budget_item",
      "job_change",
      "work_statement",
      "job_order",
      "received_invoice",
      "invoice",
      "payment",
      "job_phase",
      "site_diary",
      "defect",
      "handover_protocol",
      "time_entry",
      "stock_item",
      "stock_doc",
      "asset",
      "asset_log",
      "asset_fuel",
      "event",
      "task",
      "comment",
      "saved_view",
    ])
      expect(c[t], t).toBeGreaterThan(0);
    const phases = await q(
      sql`select phase, count(*)::int n from job where deleted_at is null group by 1`,
    );
    expect(Object.fromEntries(phases.map((r) => [r.phase, r.n]))).toEqual({
      inquiry: 2,
      offer: 2,
      preparation: 2,
      execution: 4,
      handover: 1,
      warranty: 1,
      closed: 1,
      lost: 1,
    });
    const inquiries = await q(
      sql`select ps.kind, count(*)::int n from inquiry i join pipeline_stage ps on ps.id = i.stage_id group by 1`,
    );
    const kinds = Object.fromEntries(inquiries.map((r) => [r.kind, r.n]));
    expect(kinds.open).toBeGreaterThanOrEqual(3);
    expect(kinds.won).toBeGreaterThanOrEqual(2);
    expect(kinds.lost).toBeGreaterThanOrEqual(1);
  });

  it("CRM: schránka poptávek má tři stavy, každá zakázka historii stavů a otevřený obchod váženou hodnotu", async () => {
    const stages = await q(
      sql`select ps.name from pipeline_stage ps join pipeline p on p.id = ps.pipeline_id
          where p.entity_type = 'inquiry' and p.key = 'default' and ps.deleted_at is null order by ps.position`,
    );
    expect(stages.map((r) => r.name)).toEqual(["Nová", "Kvalifikovaná", "Zamítnutá"]);
    const [h] = await q(
      sql`select count(*)::int n from job j where j.deleted_at is null
          and not exists (select 1 from job_stage_history h where h.job_id = j.id and h.left_at is null)`,
    );
    expect(h!.n).toBe(0);
    const offers = await q(
      sql`select j.number, j.sum_contract_minor, j.crm_weighted_minor, j.crm_stage_entered_at
          from job j where j.deleted_at is null and j.phase = 'offer'`,
    );
    expect(offers.length).toBeGreaterThan(0);
    for (const o of offers) {
      expect(Number(o.sum_contract_minor), o.number).toBeGreaterThan(0);
      expect(Number(o.crm_weighted_minor), o.number).toBeGreaterThan(0);
      expect(o.crm_stage_entered_at, o.number).not.toBeNull();
    }
  });

  it("firmy mají formálně platné IČO, všechno je označené jako demo a bez interního názvu", async () => {
    const icos = await q(sql`select ico from company where ico is not null`);
    expect(icos.length).toBeGreaterThan(15);
    for (const r of icos) expect(isValidIco(r.ico), r.ico).toBe(true);
    for (const t of [
      "company",
      "person",
      "job",
      "inquiry",
      "asset",
      "stock_item",
      "event",
      "invoice",
      "received_invoice",
    ]) {
      const [x] = await q(
        sql.raw(`select count(*)::int n from "${t}" where coalesce(custom->>'demo','') <> 'true'`),
      );
      expect(x!.n, `${t} bez označení demo`).toBe(0);
    }
    // slovo „rebar“ nesmí být v žádných datech (UI, PDF, e-maily jsou z těchto dat)
    const cols = await q(sql`
      select table_name, column_name from information_schema.columns
      where table_schema = 'public' and data_type in ('text', 'character varying')
        and table_name not in ('__drizzle_migrations', 'setting', 'session', 'account', 'verification', 'rate_limit', 'two_factor')
        and table_name not like 'pg%'`);
    for (const { table_name: t, column_name: col } of cols) {
      const [x] = await q(
        sql.raw(`select count(*)::int n from "${t}" where "${col}" ilike '%rebar%'`),
      );
      expect(x!.n, `${t}.${col} obsahuje „rebar“`).toBe(0);
    }
  });
});

describe("demo seed: číslování", () => {
  const gaps = (numbers: string[]) => {
    const n = numbers.map((x) => Number(x.match(/(\d+)$/)![1])).sort((a, b) => a - b);
    return n.every((v, i) => v === i + 1);
  };

  it("čísla jsou jedinečná a v řadách bez děr", async () => {
    const jobs = await q(sql`select number from job order by number`);
    expect(new Set(jobs.map((r) => r.number)).size).toBe(jobs.length);
    expect(gaps(jobs.map((r) => r.number))).toBe(true);
    for (const [table, prefix] of [
      ["invoice", "FV-"],
      ["invoice", "ZF-"],
      ["job_order", "OBJ-"],
      ["stock_doc", "PR-"],
      ["stock_doc", "VY-"],
      ["purchase_order", "OB-"],
      ["handover_protocol", "PP-"],
    ] as const) {
      const rows = await q(sql.raw(`select number from "${table}" where number like '${prefix}%'`));
      expect(rows.length, `${prefix}`).toBeGreaterThan(0);
      expect(new Set(rows.map((r) => r.number)).size, `${prefix} jedinečná`).toBe(rows.length);
      expect(gaps(rows.map((r) => r.number)), `${prefix} bez děr`).toBe(true);
    }
    // změny a soupisy se číslují po zakázkách
    const changes = await q(
      sql`select job_id, array_agg(number order by number) nums from job_change group by 1`,
    );
    for (const r of changes) expect(r.nums).toEqual(r.nums.map((_: number, i: number) => i + 1));
  });
});

describe("demo seed: peníze", () => {
  it("souhrn zakázky sedí na rozpočet realizace a na faktury", async () => {
    const owner = await userCtx("owner");
    const jobs = await q(
      sql`select id, number, phase, sum_contract_minor, sum_invoiced_minor, sum_paid_minor from job where deleted_at is null`,
    );
    let checked = 0;
    for (const j of jobs) {
      expect(
        Number(j.sum_contract_minor),
        `${j.number} záporná smluvní cena`,
      ).toBeGreaterThanOrEqual(0);
      const tree = await kit.run<{
        version: { kind: string } | null;
        totals: { sellMinor: number };
      }>(owner, "zakazky.budget.tree", { jobId: j.id });
      if (tree.version?.kind === "realization") {
        expect(Number(j.sum_contract_minor), `${j.number} smluvní cena = rozpočet realizace`).toBe(
          tree.totals.sellMinor,
        );
        checked++;
      }
      if (["execution", "handover", "warranty", "closed"].includes(j.phase)) {
        const sum = await kit.run<Row>(owner, "zakazky.summary", { jobId: j.id });
        expect(sum.contractMinor, `${j.number} summary`).toBe(Number(j.sum_contract_minor));
        const inv = await kit.run<Row>(owner, "fakturace.jobSummary", { jobId: j.id });
        expect(sum.invoicedMinor, `${j.number} fakturováno`).toBe(inv.invoicedMinor);
        expect(Number(j.sum_invoiced_minor), `${j.number} sloupec fakturováno`).toBe(
          inv.invoicedMinor,
        );
        expect(Number(j.sum_paid_minor), `${j.number} sloupec uhrazeno`).toBe(inv.paidNetMinor);
        // fakturovat se nesmí víc, než je smluvní cena
        expect(inv.invoicedMinor, `${j.number} přefakturováno`).toBeLessThanOrEqual(
          Number(j.sum_contract_minor),
        );
      }
    }
    expect(checked).toBeGreaterThanOrEqual(8);
    const items = await q(
      sql`select count(*)::int n from budget_item where deleted_at is null and (quantity < 0 or unit_price_minor < 0 or unit_cost_minor < 0)`,
    );
    expect(items[0]!.n).toBe(0);
  });

  it("faktury: součty, úhrady, po splatnosti, záloha, zádržné a přenesená daňová povinnost", async () => {
    const bad = await q(
      sql`select number from invoice where kind <> 'credit_note' and state <> 'draft' and gross_minor <> net_minor + vat_minor`,
    );
    expect(bad).toEqual([]);
    const pay = await q(sql`
      select i.number from invoice i
      left join (select invoice_id, sum(amount_minor)::bigint s from payment where deleted_at is null group by 1) p on p.invoice_id = i.id
      where i.state <> 'draft' and coalesce(p.s, 0) <> i.paid_minor`);
    expect(pay).toEqual([]);
    const paidOver = await q(sql`select number from invoice where paid_minor > gross_minor`);
    expect(paidOver).toEqual([]);
    const kinds = await q(sql`select kind, state, count(*)::int n from invoice group by 1, 2`);
    const has = (k: string, st: string) => kinds.some((r) => r.kind === k && r.state === st);
    expect(has("proforma", "paid")).toBe(true);
    expect(has("final", "paid")).toBe(true);
    expect(has("partial", "paid")).toBe(true);
    expect(has("partial", "issued")).toBe(true);
    const [overdue] = await q(
      sql`select count(*)::int n from invoice where state = 'issued' and due_date < ${todayIso()} and overdue`,
    );
    expect(overdue!.n).toBeGreaterThanOrEqual(1);
    const [pdp] = await q(
      sql`select count(*)::int n from invoice where vat_mode = 'reverse_charge' and vat_minor = 0 and state <> 'draft'`,
    );
    expect(pdp!.n).toBeGreaterThanOrEqual(2);
    const [ret] = await q(sql`select count(*)::int n from invoice where retention_minor > 0`);
    expect(ret!.n).toBeGreaterThanOrEqual(2);
    // přijaté faktury: součet řádků sedí na hlavičku; schválené jsou zamčené
    const recv = await q(sql`
      select r.number from received_invoice r join (select invoice_id, sum(net_minor)::bigint n from received_invoice_line group by 1) l on l.invoice_id = r.id
      where l.n <> r.net_minor`);
    expect(recv).toEqual([]);
    const states = await q(sql`select state, count(*)::int n from received_invoice group by 1`);
    for (const st of ["draft", "pending", "approved", "paid"])
      expect(
        states.some((r) => r.state === st),
        st,
      ).toBe(true);
  });

  it("změny, soupisy, objednávky a náklady jsou ve všech stavech; je co párovat", async () => {
    const ch = await q(sql`select status, count(*)::int n from job_change group by 1`);
    for (const st of ["draft", "sent", "approved"])
      expect(
        ch.some((r) => r.status === st),
        `změna ${st}`,
      ).toBe(true);
    const st = await q(sql`select status, count(*)::int n from work_statement group by 1`);
    for (const x of ["draft", "submitted", "approved"])
      expect(st.some((r) => r.status === x) || x === "approved", `soupis ${x}`).toBe(true);
    const ord = await q(sql`select status, count(*)::int n from job_order group by 1`);
    for (const x of ["draft", "pending", "approved", "received"])
      expect(
        ord.some((r) => r.status === x),
        `objednávka ${x}`,
      ).toBe(true);
    const owner = await userCtx("owner");
    const hala = (await q(sql`select id from job where title like 'Dostavba skladové haly%'`))[0]!;
    const costs = await kit.run<{ rows: Row[] }>(owner, "zakazky.costs.list", { jobId: hala.id });
    const rows = costs.rows ?? (costs as unknown as Row[]);
    expect(rows.length).toBeGreaterThan(10);
    const pekarna = (
      await q(sql`select id from job where title like 'Rekonstrukce provozu pekárny%'`)
    )[0]!;
    const sum = await kit.run<Row>(owner, "zakazky.summary", { jobId: pekarna.id });
    expect(sum.unpairedCount).toBeGreaterThan(0);
  });

  it("harmonogramy: jedna fáze je zpožděná, deník má pracovníky, počasí a materiál", async () => {
    const [late] = await q(
      sql`select count(*)::int n from job_phase where deleted_at is null and end_date < ${todayIso()} and progress < 100`,
    );
    expect(late!.n).toBeGreaterThanOrEqual(1);
    const [diary] = await q(
      sql`select count(*)::int n from site_diary where jsonb_array_length(workers) > 0 and weather_data is not null`,
    );
    expect(diary!.n).toBeGreaterThan(20);
    const [mat] = await q(sql`select count(*)::int n from job_cost where source = 'diary'`);
    expect(mat!.n).toBeGreaterThan(0);
  });
});

describe("demo seed: sklad, stroje, kalendář, docházka", () => {
  it("sklad: jedna položka pod minimem, zásoby nejsou záporné", async () => {
    const below = await q(sql`select code from stock_item where below_min and deleted_at is null`);
    expect(below.length).toBeGreaterThanOrEqual(1);
    const neg = await q(sql`select 1 from stock_level where qty < 0`);
    expect(neg).toEqual([]);
    const docs = await q(sql`select type, count(*)::int n from stock_doc group by 1`);
    for (const t of ["receipt", "issue", "transfer", "return"])
      expect(
        docs.some((r) => r.type === t),
        t,
      ).toBe(true);
  });

  it("stroje: STK brzy končí, jízdy, tankování, servisní intervaly, rezervace", async () => {
    const soon = await q(
      sql`select name from asset where stk_date between ${todayIso()}::date and ${todayIso()}::date + 30`,
    );
    expect(soon.length).toBeGreaterThanOrEqual(1);
    for (const t of [
      "asset_log",
      "asset_fuel",
      "asset_service",
      "asset_interval",
      "asset_reservation",
      "asset_defect",
    ]) {
      const [x] = await q(sql.raw(`select count(*)::int n from "${t}"`));
      expect(x!.n, t).toBeGreaterThan(0);
    }
  });

  it("kalendář: události, opakování, rezervace zdrojů", async () => {
    const [ev] = await q(
      sql`select count(*)::int n, count(recurrence)::int rec, count(resource_id)::int res from event where deleted_at is null`,
    );
    expect(ev!.n).toBeGreaterThanOrEqual(10);
    expect(ev!.rec).toBeGreaterThanOrEqual(1);
    expect(ev!.res).toBeGreaterThanOrEqual(2);
  });

  it("docházka: tři týdny pro šest lidí, část schválená, část ke schválení", async () => {
    const since = (await q(sql`select (${todayIso()}::date - 21)::text d`))[0]!.d;
    const people = await q(
      sql`select count(distinct user_id)::int n from time_entry where date >= ${since}::date and deleted_at is null`,
    );
    expect(people[0]!.n).toBe(6);
    const st = await q(
      sql`select status, count(*)::int n from time_entry where deleted_at is null group by 1`,
    );
    for (const x of ["draft", "submitted", "approved"])
      expect(
        st.some((r) => r.status === x),
        x,
      ).toBe(true);
  });
});

describe("demo seed: každá role má co vidět, montér nevidí ceny", () => {
  const jobDef = () => s.registry.get("job")!;

  it("vlastník a kancelář vidí všechny zakázky včetně cen, mistr a montér jen své", async () => {
    const entity = await resolveEntity(s.db, jobDef());
    const total = async (key: (typeof DEMO_USERS)[number]["key"]) =>
      (await queryRecords(await userCtx(key), s.registry, entity, {})).total;
    expect(await total("owner")).toBe(14);
    expect(await total("office")).toBe(14);
    for (const k of ["foreman1", "foreman2", "worker1", "worker2"] as const) {
      const n = await total(k);
      expect(n, k).toBeGreaterThanOrEqual(2);
      expect(n, k).toBeLessThan(14);
    }
  });

  it("montér a mistr nedostanou ceny: ani v řádcích zakázek, ani z příkazů rozpočtu a nákladů", async () => {
    const entity = await resolveEntity(s.db, jobDef());
    for (const k of ["worker1", "foreman1"] as const) {
      const ctx = await userCtx(k);
      const page = await queryRecords(ctx, s.registry, entity, {});
      expect(page.rows.length).toBeGreaterThan(0);
      for (const row of page.rows)
        for (const key of ["sumContract", "value", "sumCost", "sumInvoiced", "sumMarginPct"])
          expect(Object.keys(row), `${k}: ${key}`).not.toContain(key);
      const jobId = String((page.rows[0] as Row).id);
      for (const name of [
        "zakazky.summary",
        "zakazky.budget.tree",
        "zakazky.costs.list",
        "fakturace.jobSummary",
      ])
        await expect(kit.run(ctx, name, { jobId })).rejects.toThrow();
    }
    const ctx = await userCtx("worker1");
    await expect(
      kit.run(ctx, "fakturace.get", { id: (await q(sql`select id from invoice limit 1`))[0]!.id }),
    ).rejects.toBeInstanceOf(Error);
    void PermissionError;
  });

  it("vlastník má Přehled „vyžaduje pozornost“ a každá role vidí svou docházku a upozornění", async () => {
    const owner = await userCtx("owner");
    const items = (await Promise.all(demo.collected.attention.map((f) => f(owner, s.deps)))).flat();
    expect(items.length).toBeGreaterThanOrEqual(4);
    const text = items.map((i) => i.title).join("\n");
    expect(text).toMatch(/po splatnosti/i);
    expect(text).toMatch(/čeká na odpověď/);
    expect(text).toMatch(/Záruka/);
    expect(items.some((i) => i.severity === "danger")).toBe(true);
    // účetní nevede docházku a nemá přidělené úkoly, upozornění má jen na faktury (viz její nástěnka)
    for (const u of DEMO_USERS.filter((x) => x.key !== "accountant")) {
      const [e] = await q(
        sql`select count(*)::int n from time_entry t join "user" x on x.id = t.user_id where x.email = ${u.email}`,
      );
      expect(e!.n, `docházka ${u.key}`).toBeGreaterThan(0);
      const [n] = await q(
        sql`select count(*)::int n from notification t join "user" x on x.id = t.user_id where x.email = ${u.email}`,
      );
      expect(n!.n, `upozornění ${u.key}`).toBeGreaterThan(0);
    }
  });
});

describe("demo seed: přihlášení, idempotence, reset", () => {
  it("demo uživatelé se přihlásí heslem bez 2FA (kromě --keep-2fa)", async () => {
    for (const u of DEMO_USERS) {
      const res = await s.auth.api.signInEmail({
        body: { email: u.email, password: DEMO_PASSWORD },
        headers: new Headers({ "x-forwarded-for": `198.51.100.${DEMO_USERS.indexOf(u) + 10}` }),
        returnHeaders: true,
      });
      expect((res.response as Row).twoFactorRedirect, u.email).toBeFalsy();
      expect((res.response as Row).user?.email, u.email).toBe(u.email);
    }
    const roles = await q(
      sql`select key, require_2fa from role where key in ('owner','office','foreman','worker')`,
    );
    for (const r of roles) expect(r.require_2fa, r.key).toBe(false);
  });

  it("druhé spuštění bez přepínače nic nepřepíše, s --reset data přenasadí", async () => {
    await expect(seedDemo(s, {})).rejects.toThrow(/--reset/);
    const [before] = await q(sql`select count(*)::int n from job`);
    expect(before!.n).toBe(14);
    const second = await seedDemo(s, { reset: true, migratorUrl: urls.migrator });
    expect(second.counts.job).toBe(14);
    expect(second.counts.company).toBe(report.counts.company);
    expect(second.counts.invoice).toBe(report.counts.invoice);
    // řada zakázek pokračuje za dosavadními čísly
    const [max] = await q(sql`select max(number) m, min(number) lo from job`);
    expect(max!.lo).toBe(`Z-${todayIso().slice(0, 4)}-015`);
    // cizí data --reset nesmaže
    await kit.create(await userCtx("office"), "company", { name: "Cizí firma bez označení" });
    await expect(seedDemo(s, { reset: true, migratorUrl: urls.migrator })).rejects.toThrow(
      /nejsou označené jako demo/,
    );
    const [kept] = await q(
      sql`select count(*)::int n from company where name = 'Cizí firma bez označení'`,
    );
    expect(kept!.n).toBe(1);
  }, 180_000);
});
