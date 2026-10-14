import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  evaluateWidget,
  metricAvailable,
  sourceCatalog,
  type DashboardEnv,
  type DashboardFilters,
  type WidgetOutcome,
  type WidgetResult,
} from "@rebar/core/dashboards";
import { schema, type Db } from "@rebar/core/db";
import { createCtx, ensureRoles, loadActor, type Ctx } from "@rebar/core/rbac";
import { connectAppDb } from "@rebar/core/testing";
import { monthFundMinutes } from "@rebar/core/time";
import { invoice, payment, receivedInvoice } from "@rebar/fakturace/schema";
import { asset, assetInterval, assetLog } from "@rebar/stroje/schema";
import { inquiry } from "@rebar/poptavky/schema";
import { jobMember } from "@rebar/zakazky/schema";
import { getPipeline } from "@rebar/core/config-data";
import { buildFixture, isolatedDb, type Fixture } from "./support/security-fixture";

/*
  Metriky nástěnek modulů proti skutečné databázi: hodnoty pro vedení a důkaz, že mistr, montér i uživatel s rozsahem
  „jen moje“ nedostanou víc, než smějí. Všechna data jsou v transakci, která se na konci vrátí.
*/

const app = connectAppDb();
let f: Fixture;
let db: Db;
let discard: () => Promise<void>;
let env: DashboardEnv;

const NOW = new Date("2026-10-09T10:00:00Z");
const DENIED = "Tuto metriku nemáte oprávnění zobrazit.";
const SEP = { period: "custom", from: "2026-09-01", to: "2026-09-30" } as const;
const OCT = { period: "custom", from: "2026-10-01", to: "2026-10-31" } as const;

let uid = 0;
const widget = (type: "kpi" | "table", metric: string, extra: Record<string, unknown> = {}) => ({
  id: `w-metrics-${++uid}`,
  type,
  title: "Test",
  w: 4,
  h: 2,
  source: { kind: "metric", metric, ...extra },
});

async function run(
  ctx: Ctx,
  metric: string,
  filters: Partial<DashboardFilters> = {},
  opts: { source?: Record<string, unknown>; options?: Record<string, unknown> } = {},
  type: "kpi" | "table" = "kpi",
): Promise<WidgetOutcome> {
  const w = {
    ...widget(type, metric, opts.source),
    ...(opts.options ? { options: opts.options } : {}),
  };
  return evaluateWidget(ctx, env, w, { period: "all", ...filters });
}
const ok = (o: WidgetOutcome): WidgetResult => {
  if (!o.ok) throw new Error(`Widget selhal: ${o.error}`);
  return o.result;
};
const kpi = async (ctx: Ctx, metric: string, filters: Partial<DashboardFilters> = {}, o = {}) => {
  const r = ok(await run(ctx, metric, filters, o));
  if (r.kind !== "kpi") throw new Error(`Čekán KPI, je ${r.kind}`);
  return r;
};
const table = async (ctx: Ctx, metric: string, filters: Partial<DashboardFilters> = {}, o = {}) => {
  const r = ok(await run(ctx, metric, filters, o, "table"));
  if (r.kind !== "table") throw new Error(`Čekána tabulka, je ${r.kind}`);
  return r;
};

const people = () => f.people;

beforeAll(async () => {
  ({ db, discard } = await isolatedDb(app.db));
  f = await buildFixture(db);
  env = {
    registry: f.registry,
    deps: f.deps,
    metrics: new Map(f.collected.dashboardMetrics.map((m) => [m.key, m])),
    cacheTtlMs: 0,
    now: () => NOW,
  };

  const client = f.ids.client;
  const owner = people().owner.id;
  const mkInvoice = async (v: Record<string, unknown>) => {
    const [r] = await db
      .insert(invoice)
      .values({
        title: "Faktura",
        companyId: client,
        number: `MX${randomBytes(4).toString("hex")}`,
        ...v,
      } as never)
      .returning();
    return r!;
  };
  // zakázka A: po splatnosti 1 000 000, částečně uhrazená 500 000 / 200 000 (splatná za 6 dní), dobropis, koncept
  await mkInvoice({
    kind: "final",
    state: "issued",
    jobId: f.jobA.id,
    issueDate: "2026-09-05",
    dueDate: "2026-09-20",
    netMinor: 826_446,
    grossMinor: 1_000_000,
  });
  const a2 = await mkInvoice({
    kind: "partial",
    state: "partial",
    jobId: f.jobA.id,
    issueDate: "2026-10-01",
    dueDate: "2026-10-15",
    netMinor: 413_223,
    grossMinor: 500_000,
    paidMinor: 200_000,
  });
  await db.insert(payment).values({ invoiceId: a2.id, date: "2026-10-05", amountMinor: 200_000 });
  await mkInvoice({
    kind: "credit_note",
    state: "issued",
    jobId: f.jobA.id,
    issueDate: "2026-09-10",
    dueDate: "2026-09-10",
    netMinor: -82_645,
    grossMinor: -100_000,
  });
  await mkInvoice({
    kind: "partial",
    state: "draft",
    jobId: f.jobA.id,
    issueDate: "2026-09-12",
    dueDate: "2026-09-01",
    netMinor: 999_999,
    grossMinor: 999_999,
  });
  // zakázka B: po splatnosti 2 000 000 (cizí zakázka z pohledu A)
  await mkInvoice({
    kind: "final",
    state: "issued",
    jobId: f.jobB.id,
    issueDate: "2026-08-01",
    dueDate: "2026-08-15",
    netMinor: 1_652_893,
    grossMinor: 2_000_000,
  });
  const mkReceived = (v: Record<string, unknown>) =>
    db.insert(receivedInvoice).values({
      number: `PX${randomBytes(4).toString("hex")}`,
      supplierId: f.ids.supplier,
      jobId: f.jobA.id,
      ...v,
    } as never);
  await mkReceived({
    state: "approved",
    dueDate: "2026-10-20",
    netMinor: 578_512,
    grossMinor: 700_000,
  });
  await mkReceived({
    state: "paid",
    dueDate: "2026-09-25",
    netMinor: 247_934,
    grossMinor: 300_000,
    paidMinor: 300_000,
  });
  await mkReceived({
    state: "pending",
    dueDate: "2026-10-22",
    grossMinor: 111_111,
    netMinor: 111_111,
  });

  // stroj měřený v motohodinách s provozem v říjnu, a vozidlo s blížící se STK
  const [bagr] = await db
    .insert(asset)
    .values({ name: "Bagr metriky", kind: "excavator", meter: "mth", status: "active" })
    .returning();
  await db.insert(assetLog).values([
    { assetId: bagr!.id, date: "2026-10-05", amount: "16", userId: owner, jobId: f.jobA.id },
    { assetId: bagr!.id, date: "2026-10-06", amount: "8", userId: owner },
  ] as never);

  // role „jen moje“ pro fakturaci a pro ekonomiku zakázek
  await ensureRoles(
    db,
    [
      {
        key: "metrics-fakturant",
        name: "Fakturant jen moje",
        permissions: { "fakturace.read": "own" },
      },
      {
        key: "metrics-econ-own",
        name: "Ekonomika jen moje",
        permissions: { "zakazky.read": "own", "zakazky.economics": "own" },
      },
    ],
    { catalog: f.catalog },
  );
  const addUser = async (key: string, roleKey: string) => {
    const [r] = await db.select().from(schema.role).where(eq(schema.role.key, roleKey));
    const [u] = await db
      .insert(schema.user)
      .values({
        name: `Uživatel ${key}`,
        email: `${key}-${randomBytes(3).toString("hex")}@test.example`,
        roleId: r!.id,
      })
      .returning();
    const actor = (await loadActor(db, u!.id, { catalog: f.catalog }))!;
    return { id: u!.id, ctx: createCtx(db, actor) };
  };
  extra.fakturant = await addUser("fakturant", "metrics-fakturant");
  extra.econ = await addUser("econ", "metrics-econ-own");
  await db.insert(jobMember).values({ jobId: f.jobA.id, userId: extra.econ.id });
  // fakturant je autorem jedné faktury zakázky A (ostatní nevidí)
  await mkInvoice({
    kind: "final",
    state: "issued",
    jobId: f.jobA.id,
    issueDate: "2026-09-15",
    dueDate: "2026-09-30",
    netMinor: 100_000,
    grossMinor: 121_000,
    createdBy: extra.fakturant.id,
  });
}, 120_000);

const extra = {} as { fakturant: { id: string; ctx: Ctx }; econ: { id: string; ctx: Ctx } };

afterAll(async () => {
  await discard();
  await app.close();
});

describe("katalog a dostupnost metrik", () => {
  const keys = (ctx: Ctx) => sourceCatalog(ctx, env).metrics.map((m) => m.key);

  it("vedení vidí všechny metriky, klíče mají prefix modulu a jsou jedinečné", () => {
    const all = f.collected.dashboardMetrics.map((m) => m.key);
    expect(new Set(all).size).toBe(all.length);
    for (const k of [
      "zakazky.margin",
      "zakazky.margin_total",
      "zakazky.margin_pct",
      "zakazky.unbilled",
      "zakazky.unbilled_by_job",
      "fakturace.overdue",
      "fakturace.overdue_by_customer",
      "fakturace.cashflow_plan",
      "fakturace.due_soon",
      "fakturace.received_open",
      "fakturace.issued",
      "dochazka.hours",
      "dochazka.hours_by",
      "dochazka.utilization",
      "dochazka.labour_cost",
      "stroje.utilization",
      "stroje.service_due",
      "poptavky.conversion",
      "sklad.stock_value",
    ])
      expect(keys(people().owner.ctx), k).toContain(k);
  });

  it("mistr ani montér nemají metriky s ekonomikou ani fakturací; v katalogu nejsou a vyhodnocení je odmítne", async () => {
    for (const p of [people().foremanA, people().workerA]) {
      const k = keys(p.ctx);
      for (const forbidden of [
        "zakazky.margin",
        "zakazky.margin_total",
        "zakazky.margin_pct",
        "zakazky.unbilled",
        "zakazky.unbilled_by_job",
        "fakturace.overdue",
        "fakturace.cashflow_plan",
        "fakturace.issued",
        "dochazka.labour_cost",
        "sklad.stock_value",
        "poptavky.conversion",
      ]) {
        expect(k, `${p.role}: ${forbidden}`).not.toContain(forbidden);
        expect(metricAvailable(p.ctx, env.metrics.get(forbidden)!)).toBe(false);
        const o = await run(p.ctx, forbidden);
        expect(o.ok).toBe(false);
        if (!o.ok) expect(o.error).toBe(DENIED);
        const t = await run(p.ctx, forbidden, {}, {}, "table");
        expect(t.ok).toBe(false);
      }
    }
  });

  it("mistr má docházku a stroje, montér jen stroje (docházku nečte, jen zapisuje)", () => {
    expect(keys(people().foremanA.ctx)).toEqual(
      expect.arrayContaining([
        "dochazka.hours",
        "dochazka.hours_by",
        "dochazka.utilization",
        "stroje.utilization",
      ]),
    );
    expect(keys(people().workerA.ctx)).not.toContain("dochazka.hours");
    expect(keys(people().workerA.ctx)).toContain("stroje.service_due");
  });

  it("neznámá metrika a parametr mimo výčet nic nevyhodí do SQL", async () => {
    const o = await run(people().owner.ctx, "zakazky.neexistuje");
    expect(o.ok).toBe(false);
    const r = await table(people().owner.ctx, "dochazka.hours_by", SEP, {
      source: { params: { by: "1; drop table time_entry" } },
    });
    expect(r.columns.length).toBeGreaterThan(1);
  });
});

describe("zakázky: ekonomika", () => {
  const A = () => ({ jobId: f.jobA.id });
  it("marže zakázky = smluvní cena − náklady, celkem i vážená v %", async () => {
    const owner = people().owner.ctx;
    const one = await kpi(owner, "zakazky.margin_total", A());
    expect(one.value).toBe(7_777_700 - 3_333_300);
    const pct = await kpi(owner, "zakazky.margin_pct", A());
    expect(pct.value).toBe(57.1);
    const all = await kpi(owner, "zakazky.margin_total");
    expect(all.value).toBeGreaterThanOrEqual(2 * (7_777_700 - 3_333_300));
  });

  it("série marže po zakázkách je seřazená a vede na detail zakázky", async () => {
    const t = await table(people().owner.ctx, "zakazky.margin", {}, { source: { limit: 100 } });
    const row = t.rows.find((r) => r.id === f.jobA.id)!;
    expect(row.cells.margin).toBe(4_444_400);
    expect(row.href).toBe(`/zakazky/${f.jobA.id}`);
    const vals = t.rows.map((r) => Number(r.cells.margin));
    expect(vals).toEqual([...vals].sort((a, b) => b - a));
    const low = await table(
      people().owner.ctx,
      "zakazky.margin",
      {},
      { source: { limit: 100, params: { sort: "lowest" } } },
    );
    const lv = low.rows.map((r) => Number(r.cells.margin));
    expect(lv).toEqual([...lv].sort((a, b) => a - b));
  });

  it("nevyfakturováno: smluvní cena − fakturováno, po zakázkách TOP N s limitem", async () => {
    const owner = people().owner.ctx;
    expect((await kpi(owner, "zakazky.unbilled", A())).value).toBe(7_777_700 - 5_550_000);
    const t = await table(owner, "zakazky.unbilled_by_job", {}, { source: { limit: 1 } });
    expect(t.rows).toHaveLength(1);
    const full = await table(owner, "zakazky.unbilled_by_job", { jobId: f.jobA.id });
    expect(full.rows.map((r) => r.id)).toEqual([f.jobA.id]);
    expect(full.rows[0]!.cells.unbilled).toBe(2_227_700);
  });

  it("uživatel s ekonomikou v rozsahu „jen moje“ vidí jen zakázku, jejímž je členem", async () => {
    const econ = extra.econ.ctx;
    const t = await table(econ, "zakazky.margin", {}, { source: { limit: 100 } });
    expect(t.rows.map((r) => r.id)).toEqual([f.jobA.id]);
    expect((await kpi(econ, "zakazky.margin_total")).value).toBe(4_444_400);
    expect((await kpi(econ, "zakazky.unbilled")).value).toBe(2_227_700);
    // filtr na cizí zakázku nic neodhalí
    expect((await kpi(econ, "zakazky.margin_total", { jobId: f.jobB.id })).value).toBe(0);
    const other = await table(econ, "zakazky.unbilled_by_job", { jobId: f.jobB.id });
    expect(other.rows).toHaveLength(0);
  });
});

describe("fakturace", () => {
  const owner = () => people().owner.ctx;
  const A = () => ({ jobId: f.jobA.id });

  it("po splatnosti: jen vystavené neuhrazené faktury, bez konceptů a dobropisů, zůstatek", async () => {
    expect((await kpi(owner(), "fakturace.overdue", A())).value).toBe(1_000_000 + 121_000);
    expect((await kpi(owner(), "fakturace.overdue", { jobId: f.jobB.id })).value).toBe(2_000_000);
    expect((await kpi(owner(), "fakturace.overdue")).value).toBeGreaterThanOrEqual(3_121_000);
  });

  it("po splatnosti podle zákazníků", async () => {
    const t = await table(owner(), "fakturace.overdue_by_customer", A());
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0]!.id).toBe(f.ids.client);
    expect(t.rows[0]!.cells.overdue).toBe(1_121_000);
    expect(t.rows[0]!.href).toBe(`/kontakty/firmy/${f.ids.client}`);
  });

  it("splatné v příštích dnech: výběr 7 / 14 / 30, neplatná hodnota padá na výchozí", async () => {
    // dnes 9. 10.: částečně uhrazená faktura A je splatná 15. 10. (zbývá 300 000)
    const d = (days: unknown) =>
      kpi(owner(), "fakturace.due_soon", A(), { source: { params: { days } } }).then(
        (r) => r.value,
      );
    expect(await d("7")).toBe(300_000);
    expect(await d("14")).toBe(300_000);
    expect(await d("30")).toBe(300_000);
    expect(await d("3")).toBe(300_000); // není ve výčtu, bere se výchozích 7
    expect(
      (await kpi(owner(), "fakturace.due_soon", A(), { source: { params: { days: "7" } } })).value,
    ).toBe(300_000);
  });

  it("přijaté k úhradě: jen schválené, součet i počet", async () => {
    expect((await kpi(owner(), "fakturace.received_open", A())).value).toBe(700_000);
    expect((await kpi(owner(), "fakturace.received_open_count", A())).value).toBe(1);
  });

  it("vystaveno v období bez DPH, dobropis odečítá; srovnání s předchozím obdobím", async () => {
    const sep = await kpi(owner(), "fakturace.issued", { ...SEP, jobId: f.jobA.id });
    expect(sep.value).toBe(826_446 - 82_645 + 100_000 /* fakturantova */);
    const oct = await kpi(
      owner(),
      "fakturace.issued",
      { ...OCT, jobId: f.jobA.id },
      { options: { compare: "previous_period" } },
    );
    expect(oct.value).toBe(413_223);
    expect(oct.previous).toBe(sep.value);
    expect(oct.delta?.abs).toBe(413_223 - Number(sep.value));
  });

  it("plán peněžních toků po měsících: plán příjmů, skutečné příjmy, plán výdajů", async () => {
    const t = await table(
      owner(),
      "fakturace.cashflow_plan",
      { ...{ period: "custom" as const, from: "2026-09-01", to: "2026-10-31" }, jobId: f.jobA.id },
      { source: { bucket: "month" } },
    );
    expect(t.rows.map((r) => r.id)).toEqual(["2026-09-01", "2026-10-01"]);
    const [sep, oct] = t.rows.map((r) => r.cells);
    expect(sep).toMatchObject({ plan_in: 1_000_000 + 121_000, actual_in: 0, plan_out: 300_000 });
    expect(oct).toMatchObject({ plan_in: 500_000, actual_in: 200_000, plan_out: 700_000 });
  });

  it("plán peněžních toků po týdnech a bez zvoleného období (následujících 6 měsíců)", async () => {
    const w = await table(
      owner(),
      "fakturace.cashflow_plan",
      { period: "custom", from: "2026-10-05", to: "2026-10-25", jobId: f.jobA.id },
      { source: { bucket: "week" } },
    );
    expect(w.rows.map((r) => r.id)).toEqual(["2026-10-05", "2026-10-12", "2026-10-19"]);
    expect(w.rows[1]!.cells).toMatchObject({ plan_in: 500_000 });
    expect(w.rows[2]!.cells).toMatchObject({ plan_out: 700_000 });
    const none = await table(owner(), "fakturace.cashflow_plan", A());
    expect(none.rows).toHaveLength(6);
    expect(none.rows[0]!.id).toBe("2026-10-01");
  });

  it("rozsah „jen moje“: fakturant vidí jen faktury, které sám založil", async () => {
    const fa = extra.fakturant.ctx;
    expect((await kpi(fa, "fakturace.overdue")).value).toBe(121_000);
    expect((await kpi(fa, "fakturace.overdue", { jobId: f.jobB.id })).value).toBe(0);
    expect((await kpi(fa, "fakturace.issued", SEP)).value).toBe(100_000);
    expect((await kpi(fa, "fakturace.received_open")).value).toBe(0);
    const t = await table(fa, "fakturace.overdue_by_customer");
    expect(t.rows).toHaveLength(1);
    // zákazníka (kontakty) fakturant nečte, takže odkaz nedostane
    expect(t.rows[0]!.href).toBeUndefined();
  });
});

describe("docházka", () => {
  const owner = () => people().owner.ctx;
  const foreman = () => people().foremanA.ctx;

  it("vedení: hodiny celkem, podle zakázky a osoby", async () => {
    expect((await kpi(owner(), "dochazka.hours", { ...SEP, jobId: f.jobA.id })).value).toBe(720);
    expect(
      (await kpi(owner(), "dochazka.hours", { ...SEP, userId: people().workerA.id })).value,
    ).toBe(480);
    expect((await kpi(owner(), "dochazka.hours", SEP)).value).toBeGreaterThanOrEqual(1440);
    // jen schválené: u zakázky A je schválený jen záznam montéra
    const ap = await kpi(
      owner(),
      "dochazka.hours",
      { ...SEP, jobId: f.jobA.id },
      { source: { params: { approvedOnly: true } } },
    );
    expect(ap.value).toBe(480);
  });

  it("hodiny podle osoby, zakázky a času", async () => {
    const p = await table(owner(), "dochazka.hours_by", { ...SEP, jobId: f.jobA.id });
    expect(p.rows.map((r) => [r.id, r.cells.minutes]).sort()).toEqual(
      [
        [people().workerA.id, 480],
        [people().foremanA.id, 240],
      ].sort(),
    );
    const j = await table(owner(), "dochazka.hours_by", SEP, {
      source: { params: { by: "job" }, limit: 100 },
    });
    const a = j.rows.find((r) => r.id === f.jobA.id)!;
    expect(a.cells.label).toBe("Zakázka A");
    expect(a.cells.minutes).toBe(720);
    const d = await table(
      owner(),
      "dochazka.hours_by",
      { ...SEP, jobId: f.jobA.id },
      { source: { params: { by: "day" }, bucket: "week" } },
    );
    // 15. 9. (út) a 16. 9. (st) jsou ve stejném týdnu od 14. 9.
    expect(d.rows.find((r) => r.id === "2026-09-14")!.cells.minutes).toBe(720);
    expect(d.rows[0]!.id).toBe("2026-08-31");
  });

  it("využití lidí = odpracované / fond pracovní doby", async () => {
    const fund = monthFundMinutes("2026-09", 8);
    const t = await table(owner(), "dochazka.utilization", { ...SEP, userId: people().workerA.id });
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0]!.cells.utilization).toBe(Math.round((480 / fund) * 1000) / 10);
  });

  it("náklady na práci = hodiny × hodinový náklad v době zápisu", async () => {
    // 8 h × 456 Kč + 4 h × 456 Kč
    expect((await kpi(owner(), "dochazka.labour_cost", { ...SEP, jobId: f.jobA.id })).value).toBe(
      12 * 45_600,
    );
  });

  it("mistr vidí jen svůj tým, ne cizí docházku ani cizí zakázku", async () => {
    expect((await kpi(foreman(), "dochazka.hours", SEP)).value).toBe(720);
    expect(
      (await kpi(foreman(), "dochazka.hours", { ...SEP, userId: people().workerB.id })).value,
    ).toBe(0);
    expect((await kpi(foreman(), "dochazka.hours", { ...SEP, jobId: f.jobB.id })).value).toBe(0);
    expect(
      (await kpi(foreman(), "dochazka.hours", { ...SEP, userId: people().workerA.id })).value,
    ).toBe(480);

    const persons = await table(foreman(), "dochazka.hours_by", SEP, { source: { limit: 100 } });
    const ids = persons.rows.map((r) => r.id);
    expect(ids).toHaveLength(2);
    expect(ids).not.toContain(people().workerB.id);
    expect(ids).not.toContain(people().foremanB.id);

    const jobs = await table(foreman(), "dochazka.hours_by", SEP, {
      source: { params: { by: "job" } },
    });
    expect(jobs.rows.map((r) => r.cells.label)).toEqual(["Zakázka A"]);

    const util = await table(foreman(), "dochazka.utilization", SEP, { source: { limit: 100 } });
    for (const r of util.rows) expect([people().foremanA.id, people().workerA.id]).toContain(r.id);
    expect(util.rows).toHaveLength(2);
  });

  it("mzdové náklady mistr nevidí, i když vidí hodiny", async () => {
    const o = await run(foreman(), "dochazka.labour_cost", SEP);
    expect(o.ok).toBe(false);
    if (!o.ok) expect(o.error).toBe(DENIED);
  });
});

describe("stroje", () => {
  it("využití strojů = motohodiny / dostupné pracovní hodiny do dneška", async () => {
    // 1.–9. 10. 2026: 7 pracovních dnů × 8 h = 56 h; provoz 16 + 8 = 24 h
    const t = await table(
      people().owner.ctx,
      "stroje.utilization",
      { ...OCT },
      { source: { limit: 100 } },
    );
    const row = t.rows.find((r) => r.cells.label === "Bagr metriky")!;
    expect(row.cells.utilization).toBe(Math.round((24 / 56) * 1000) / 10);
    expect(row.href).toBe(`/stroje/evidence/${row.id}`);
    // provoz jen na zakázce A: 16 h
    const a = await table(
      people().owner.ctx,
      "stroje.utilization",
      { ...OCT, jobId: f.jobA.id },
      { source: { limit: 100 } },
    );
    expect(a.rows.find((r) => r.cells.label === "Bagr metriky")!.cells.utilization).toBe(
      Math.round((16 / 56) * 1000) / 10,
    );
  });

  it("počet strojů s blížícím se termínem přibude s termínem do 30 dní, vyřazený stroj se nepočítá", async () => {
    const before = (await kpi(people().owner.ctx, "stroje.service_due")).value as number;
    const [van] = await db
      .insert(asset)
      .values({ name: "Dodávka STK", kind: "van", stkDate: "2026-10-20" })
      .returning();
    await db
      .insert(asset)
      .values({ name: "Vyřazená", kind: "van", stkDate: "2026-10-01", status: "retired" });
    const [mth] = await db
      .insert(asset)
      .values({ name: "Bagr servis", kind: "excavator", meter: "mth", meterValue: "505" })
      .returning();
    await db.insert(assetInterval).values({
      assetId: mth!.id,
      title: "Olej",
      everyMeter: 500,
      lastMeter: "0",
      lastDate: null,
    } as never);
    const after = (await kpi(people().owner.ctx, "stroje.service_due")).value as number;
    expect(after - before).toBe(2);
    expect(van!.id).toBeTruthy();
    // mistr (stroje.read: vše) vidí stejné číslo
    expect((await kpi(people().foremanA.ctx, "stroje.service_due")).value).toBe(after);
  });
});

describe("poptávky a sklad", () => {
  it("konverze poptávek: podíl vyhraných z uzavřených, otevřené se nepočítají, hranice měsíce je půlnoc v Praze", async () => {
    const stages = (await getPipeline(db, "inquiry", "default"))!.stages;
    const stage = (kind: string) => stages.find((x) => x.kind === kind)!.id;
    const mk = (title: string, kind: string, createdAt: string, ownerId?: string) =>
      db.insert(inquiry).values({
        title,
        stageId: stage(kind),
        createdAt: new Date(createdAt),
        ownerId: ownerId ?? null,
      } as never);
    await mk("Vyhraná 1", "won", "2031-09-10T08:00:00Z", people().owner.id);
    await mk("Vyhraná 2", "won", "2031-09-11T08:00:00Z");
    await mk("Prohraná", "lost", "2031-09-12T08:00:00Z", people().owner.id);
    await mk("Otevřená", "open", "2031-09-13T08:00:00Z");
    // 1. 10. 00:30 v Praze (letní čas) je ještě 30. 9. 22:30 UTC: patří do října, ne do září
    await mk("Říjnová vyhraná", "won", "2031-09-30T22:30:00Z");
    const SEP31 = { period: "custom" as const, from: "2031-09-01", to: "2031-09-30" };
    const OCT31 = { period: "custom" as const, from: "2031-10-01", to: "2031-10-31" };
    const sep = await kpi(people().owner.ctx, "poptavky.conversion", SEP31);
    expect(sep.value).toBe(66.7);
    const oct = await kpi(people().owner.ctx, "poptavky.conversion", OCT31);
    expect(oct.value).toBe(100);
    const mine = await kpi(people().owner.ctx, "poptavky.conversion", {
      ...SEP31,
      userId: people().owner.id,
    });
    expect(mine.value).toBe(50);
    const none = await kpi(people().owner.ctx, "poptavky.conversion", {
      period: "custom",
      from: "2020-01-01",
      to: "2020-01-31",
    });
    expect(none.value).toBeNull();
  });

  it("hodnota skladu: součet hodnoty aktivních karet jen pro správce skladu", async () => {
    const r = await kpi(people().owner.ctx, "sklad.stock_value");
    expect(r.value).toBeGreaterThanOrEqual(100 * 987_600);
    // mistr sklad čte, ale ceny ne
    const o = await run(people().foremanA.ctx, "sklad.stock_value");
    expect(o.ok).toBe(false);
  });
});
