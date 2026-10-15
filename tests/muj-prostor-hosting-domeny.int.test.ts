import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { PermissionError, UserError, type Ctx } from "@rebar/core/rbac";
import type { Db } from "@rebar/core/db";
import {
  createRecord,
  deleteBlockMessage,
  deleteRecord,
  getRecord,
  queryGroups,
  queryRecords,
  resolveEntity,
  searchAll,
  updateRecord,
  type ResolvedEntity,
} from "@rebar/core/entities";
import { createModuleDeps, type ModuleDeps } from "@rebar/core/module-server";
import { connectAppDb } from "@rebar/core/testing";
import { addDaysIso, todayIso } from "@rebar/core/time";
import { ensureSeedViews } from "@rebar/core/views";
import { listViews } from "@rebar/core/views";
import { countCriticalDomains } from "@rebar/muj-prostor/server";
import { summarizeDomains } from "../packages/modules/muj-prostor/src/domains/logic";
import { MUJ_PROSTOR_VIEWS } from "../packages/modules/muj-prostor/src/seed";
import { assertCommandPermission } from "../apps/web/src/server/command-gate";
import type {
  AssignClientResult,
  BulkAddResult,
  ClientHostingOverview,
  DomainListResult,
  HostingOverview,
  MarkRenewedResult,
} from "../packages/modules/muj-prostor/src/types";
import { buildFixture, isolatedDb, type Fixture } from "./support/security-fixture";

/*
  MPR-1: hosting a domény modulu „Můj prostor“. Pravidla expirace a posunu obnovy jsou v unit testech
  (`logic.test.ts` v `hosting/` a `domains/` modulu); tady se hlídá, že je příkazy, entity, odznak v menu a metriky
  provádějí nad databází stejně a že modul vidí jen vlastník (Patrik nic z toho nenajde ani nespočítá).
*/

const app = connectAppDb();
let f: Fixture;
let db: Db;
let discard: () => Promise<void>;
let deps: ModuleDeps;
let owner: Ctx;
let partner: Ctx;
const today = todayIso();
const inDays = (n: number) => addDaysIso(today, n);
const tag = Math.random().toString(36).slice(2, 8);

const R = (key: string): Promise<ResolvedEntity> =>
  resolveEntity(db, f.registry.get(key) ?? (undefined as never));

/** Zavolá příkaz modulu stejně jako server action: nejdřív brána oprávnění, pak handler s validací vstupu. */
async function run<T>(ctx: Ctx, name: string, input: unknown): Promise<T> {
  const cmd = f.collected.commands.get(name);
  if (!cmd) throw new Error(`Neznámý příkaz ${name}`);
  assertCommandPermission(ctx, cmd);
  return (await cmd.handler(ctx, cmd.input.parse(input), deps)) as T;
}

/** Počty záložek karty klienta ode všech modulů (stejně jako je skládá modul `klienti`). */
async function tabCountsOf(ctx: Ctx, companyId: string) {
  const parts = await Promise.all(
    f.collected.contributions.clientCard!.map((p) => p.tabCounts?.(ctx, companyId) ?? {}),
  );
  return Object.assign({}, ...parts) as Record<string, number>;
}

async function newService(over: Record<string, unknown> = {}) {
  const r = await createRecord(owner, f.registry, await R("recurring_service"), {
    name: `Hosting ${tag} ${Math.random().toString(36).slice(2, 6)}`,
    company: company.id,
    kind: "hosting",
    price: 600_000,
    period: "yearly",
    status: "active",
    nextRenewal: inDays(10),
    ...over,
  });
  return r.row;
}

let company: { id: string };

beforeAll(async () => {
  ({ db, discard } = await isolatedDb(app.db));
  f = await buildFixture(db);
  deps = createModuleDeps(
    {
      registry: f.deps.registry,
      queue: f.deps.queue,
      storage: f.deps.storage,
      settings: f.deps.settings,
      cipher: f.deps.cipher,
      baseURL: f.deps.baseURL,
      emit: f.deps.emit,
      calendarLayers: f.deps.calendarLayers,
    },
    { services: f.collected.services, contributions: f.collected.contributions },
  );
  owner = f.people.owner.ctx;
  partner = f.people.partner.ctx;
  const co = await createRecord(owner, f.registry, await R("company"), { name: `Klient ${tag}` });
  company = { id: co.row.id };
}, 120_000);
afterAll(async () => {
  await discard();
  await app.close();
});

describe("evidence domén (DOM-01, DOM-04)", () => {
  it("doménu ukládá malými písmeny bez protokolu a www; duplicitu odmítne i s jiným zápisem", async () => {
    const e = await R("web_domain");
    const created = await createRecord(owner, f.registry, e, {
      domain: `https://www.Dom-${tag}.CZ/uvod`,
      registrar: "Wedos",
    });
    expect(created.row.domain).toBe(`dom-${tag}.cz`);
    await expect(createRecord(owner, f.registry, e, { domain: `DOM-${tag}.cz` })).rejects.toThrow(
      /už je v evidenci/,
    );
    await expect(
      createRecord(owner, f.registry, e, { domain: "neni domena" }),
    ).rejects.toBeInstanceOf(UserError);
    const other = await createRecord(owner, f.registry, e, { domain: `jina-${tag}.cz` });
    await expect(
      updateRecord(owner, f.registry, e, other.row.id, { domain: `dom-${tag}.cz` }),
    ).rejects.toThrow(/už je v evidenci/);
    // přejmenování na sebe sama a smazaná doména neblokují
    await updateRecord(owner, f.registry, e, other.row.id, { domain: `JINA-${tag}.cz`, note: "x" });
    await deleteRecord(owner, e, other.row.id);
    await createRecord(owner, f.registry, e, { domain: `jina-${tag}.cz` });
  });

  it("hromadné vložení: založí platné, přeskočí neplatné, opakované a existující, klienta doplní všem", async () => {
    const res = await run<BulkAddResult>(owner, "muj-prostor.domains.bulkAdd", {
      text: [
        `bulk1-${tag}.cz`,
        `https://www.bulk2-${tag}.cz/`,
        `BULK1-${tag}.cz`,
        "to neni domena",
        `dom-${tag}.cz`,
      ].join("\n"),
      defaults: { companyId: company.id, registrar: "Forpsi", payer: "agency" },
    });
    expect(res.created.map((c) => c.domain)).toEqual([`bulk1-${tag}.cz`, `bulk2-${tag}.cz`]);
    expect(res.skipped.map((s) => s.reason).sort()).toEqual([
      "duplicate_in_input",
      "exists",
      "invalid",
      "invalid",
      "invalid",
    ]);
    const row = await getRecord(owner, f.registry, await R("web_domain"), res.created[0]!.id);
    expect(row.row).toMatchObject({ company: company.id, registrar: "Forpsi", payer: "agency" });
    // vložené přes engine jsou v hledání
    const hits = await searchAll(owner, f.registry.all(), `bulk1-${tag}`);
    expect(hits.some((h) => h.entityType === "web_domain")).toBe(true);
    // druhé vložení téhož seznamu nic nezaloží
    const again = await run<BulkAddResult>(owner, "muj-prostor.domains.bulkAdd", {
      text: `bulk1-${tag}.cz\nbulk2-${tag}.cz`,
    });
    expect(again.created).toEqual([]);
    expect(again.skipped.map((s) => s.reason)).toEqual(["exists", "exists"]);
  });

  it("prázdné zadání je chyba a neplatný klient zruší celé vložení", async () => {
    await expect(
      run(owner, "muj-prostor.domains.bulkAdd", { text: "  \n " }),
    ).rejects.toBeInstanceOf(UserError);
    await expect(
      run(owner, "muj-prostor.domains.bulkAdd", {
        text: `rollback-${tag}.cz`,
        defaults: { companyId: "00000000-0000-4000-8000-000000000000" },
      }),
    ).rejects.toThrow();
    const hits = await queryRecords(owner, f.registry, await R("web_domain"), {
      q: `rollback-${tag}`,
    });
    expect(hits.rows).toHaveLength(0);
  });

  it("přiřazení klienta vybraným doménám a jeho odebrání", async () => {
    const res = await run<BulkAddResult>(owner, "muj-prostor.domains.bulkAdd", {
      text: `assign1-${tag}.cz\nassign2-${tag}.cz`,
    });
    const ids = res.created.map((c) => c.id);
    const r = await run<AssignClientResult>(owner, "muj-prostor.domains.assignClient", {
      ids,
      companyId: company.id,
    });
    expect(r.updated).toBe(2);
    const e = await R("web_domain");
    for (const id of ids)
      expect((await getRecord(owner, f.registry, e, id)).row.company).toBe(company.id);
    await run(owner, "muj-prostor.domains.assignClient", { ids, companyId: null });
    for (const id of ids)
      expect((await getRecord(owner, f.registry, e, id)).row.company).toBeNull();
  });
});

describe("barvy a počet kritických domén (DOM-02, DOM-03)", () => {
  it("odznak v menu a souhrn seznamu se shodují s čistou funkcí (hranice 60 / 30 a vlastní warn_days)", async () => {
    const e = await R("web_domain");
    const cases: { expiresOn: string | null; warnDays: number }[] = [
      { expiresOn: inDays(-5), warnDays: 30 },
      { expiresOn: inDays(0), warnDays: 30 },
      { expiresOn: inDays(29), warnDays: 30 },
      { expiresOn: inDays(30), warnDays: 30 },
      { expiresOn: inDays(60), warnDays: 30 },
      { expiresOn: inDays(61), warnDays: 30 },
      { expiresOn: inDays(13), warnDays: 14 },
      { expiresOn: inDays(14), warnDays: 14 },
      { expiresOn: inDays(40), warnDays: 14 },
      { expiresOn: null, warnDays: 30 },
    ];
    let i = 0;
    for (const c of cases)
      await createRecord(owner, f.registry, e, {
        domain: `exp${i++}-${tag}.cz`,
        ...(c.expiresOn ? { expiresOn: c.expiresOn } : {}),
        warnDays: c.warnDays,
      });
    const list = await run<DomainListResult>(owner, "muj-prostor.domains.list", {});
    const expected = summarizeDomains(
      list.rows.map((r) => ({
        expiresOn: r.expiresOn,
        warnDays: r.warnDays,
        companyId: r.companyId,
      })),
      list.today,
    );
    expect(list.summary).toEqual(expected);
    expect(list.summary.critical).toBeGreaterThanOrEqual(4); // po expiraci, dnes, 29 dní, 13 dní při hranici 14
    expect(await countCriticalDomains(owner)).toBe(list.summary.critical);
    // odznak je v registru navBadges a bere se přes něj
    const badge = f.collected.navBadges.find((b) => b.href === "/muj-prostor/domeny")!;
    expect(badge.tone).toBe("danger");
    expect(await badge.count(owner, deps)).toBe(list.summary.critical);
    // řádky v seznamu jsou od nejbližší expirace, bez expirace na konci
    const dated = list.rows.filter((r) => r.expiresOn);
    expect(dated.map((r) => r.expiresOn)).toEqual([...dated.map((r) => r.expiresOn!)].sort());
    expect(list.rows.at(-1)!.expiresOn).toBeNull();
  });
});

describe("hosting a údržba: souhrn a posun obnovy (HOST-01 až HOST-03)", () => {
  it("souhrn: roční opakovaný příjem a počet aktivních služeb", async () => {
    const before = await run<HostingOverview>(owner, "muj-prostor.hosting.overview", {});
    await newService({ price: 1_200_00, period: "yearly", nextRenewal: inDays(200) });
    await newService({
      price: 100_00,
      period: "monthly",
      kind: "maintenance",
      nextRenewal: inDays(200),
    });
    await newService({ price: 999_99, status: "paused", nextRenewal: inDays(5) });
    await newService({ price: 999_99, status: "canceled", nextRenewal: inDays(5) });
    const after = await run<HostingOverview>(owner, "muj-prostor.hosting.overview", {});
    expect(after.summary.activeCount - before.summary.activeCount).toBe(2);
    expect(after.summary.annualMinor - before.summary.annualMinor).toBe(1_200_00 + 100_00 * 12);
    expect(after.summary.pausedCount - before.summary.pausedCount).toBe(1);
    expect(after.summary.canceledCount - before.summary.canceledCount).toBe(1);
    expect(after.today).toBe(today);
  });

  it("obnova do 30 dní zahrnuje i služby po termínu; označení posune o období a jde vrátit", async () => {
    const soon = await newService({ nextRenewal: inDays(10), name: `Soon ${tag}` });
    const late = await newService({
      nextRenewal: inDays(-3),
      name: `Late ${tag}`,
      period: "monthly",
    });
    const far = await newService({ nextRenewal: inDays(90), name: `Far ${tag}` });
    const ov = await run<HostingOverview>(owner, "muj-prostor.hosting.overview", {});
    const names = ov.due.map((d) => d.name);
    expect(names).toContain(`Soon ${tag}`);
    expect(names).toContain(`Late ${tag}`);
    expect(names).not.toContain(`Far ${tag}`);
    expect(ov.due.find((d) => d.name === `Late ${tag}`)).toMatchObject({
      renewal: "overdue",
      daysLeft: -3,
    });

    const r = await run<MarkRenewedResult>(owner, "muj-prostor.hosting.markRenewed", {
      id: soon.id,
      expectedNextRenewal: inDays(10),
    });
    expect(r.previous).toBe(inDays(10));
    expect(r.next.slice(0, 4)).toBe(String(Number(inDays(10).slice(0, 4)) + 1)); // roční: o rok
    const e = await R("recurring_service");
    expect((await getRecord(owner, f.registry, e, soon.id)).row.nextRenewal).toBe(r.next);

    // druhé kliknutí se stejným datem (dvojklik) nic neposune
    await expect(
      run(owner, "muj-prostor.hosting.markRenewed", {
        id: soon.id,
        expectedNextRenewal: inDays(10),
      }),
    ).rejects.toThrow(/mezitím změnilo/);
    expect((await getRecord(owner, f.registry, e, soon.id)).row.nextRenewal).toBe(r.next);

    // měsíční: o měsíc
    const m = await run<MarkRenewedResult>(owner, "muj-prostor.hosting.markRenewed", {
      id: late.id,
      expectedNextRenewal: inDays(-3),
    });
    expect(m.next > m.previous).toBe(true);
    expect(m.next.slice(0, 7) > m.previous.slice(0, 7)).toBe(true);

    // Zpět vrátí datum jen z posunuté hodnoty
    await run(owner, "muj-prostor.hosting.undoRenewed", {
      id: soon.id,
      from: r.next,
      to: r.previous,
    });
    expect((await getRecord(owner, f.registry, e, soon.id)).row.nextRenewal).toBe(inDays(10));
    await expect(
      run(owner, "muj-prostor.hosting.undoRenewed", { id: soon.id, from: r.next, to: r.previous }),
    ).rejects.toThrow(/mezitím změnilo/);
    void far;
  });

  it("obnovu jde označit jen u aktivní služby s datem; změna je v historii záznamu", async () => {
    const paused = await newService({ status: "paused" });
    await expect(
      run(owner, "muj-prostor.hosting.markRenewed", {
        id: paused.id,
        expectedNextRenewal: inDays(10),
      }),
    ).rejects.toThrow(/jen u aktivní služby/);
    const noDate = await newService({ nextRenewal: null });
    await expect(
      run(owner, "muj-prostor.hosting.markRenewed", {
        id: noDate.id,
        expectedNextRenewal: inDays(10),
      }),
    ).rejects.toThrow();

    const s = await newService({ nextRenewal: inDays(2) });
    await run(owner, "muj-prostor.hosting.markRenewed", {
      id: s.id,
      expectedNextRenewal: inDays(2),
    });
    const rows = await db.execute(
      sql`select action, changes from audit_log where entity_type = 'recurring_service' and entity_id = ${s.id} order by occurred_at`,
    );
    const actions = (rows as unknown as { action: string }[]).map((r) => r.action);
    expect(actions).toContain("update");
    const update = (rows as unknown as { action: string; changes: { field: string }[] }[]).find(
      (r) => r.action === "update",
    )!;
    expect(JSON.stringify(update.changes)).toContain("Další obnova");
  });
});

describe("karta klienta, metriky a blokace smazání", () => {
  it("záložka klienta: počet přes příspěvek a přehled přes příkaz", async () => {
    const co = await createRecord(owner, f.registry, await R("company"), { name: `Karta ${tag}` });
    await newService({ company: co.row.id, name: `Karta hosting ${tag}` });
    await createRecord(owner, f.registry, await R("web_domain"), {
      domain: `karta-${tag}.cz`,
      company: co.row.id,
      expiresOn: inDays(5),
    });
    expect((await tabCountsOf(owner, co.row.id)).hosting).toBe(2);
    expect((await tabCountsOf(owner, "00000000-0000-4000-8000-000000000000")).hosting).toBe(0);
    const o = await run<ClientHostingOverview>(owner, "muj-prostor.client.overview", {
      companyId: co.row.id,
    });
    expect(o.services.map((s) => s.name)).toEqual([`Karta hosting ${tag}`]);
    expect(o.services[0]!.companyName).toBe(`Karta ${tag}`);
    expect(o.domains.map((d) => d.domain)).toEqual([`karta-${tag}.cz`]);
  });

  it("metriky nástěnek: retainery, kritické domény a expirace", async () => {
    const input = (params: Record<string, string | number | boolean> = {}) => ({
      from: null,
      to: null,
      jobId: null,
      userId: null,
      bucket: null,
      limit: 50,
      params,
      today,
    });
    const metric = (key: string) => f.collected.dashboardMetrics.find((m) => m.key === key)!;
    const ov = await run<HostingOverview>(owner, "muj-prostor.hosting.overview", {});
    const arr = await metric("muj-prostor.retainers_arr").compute(owner, input(), deps);
    expect(arr).toEqual({ kind: "scalar", value: ov.summary.annualMinor });
    const monthly = await metric("muj-prostor.retainers").compute(owner, input(), deps);
    expect(monthly).toEqual({ kind: "scalar", value: ov.summary.monthlyMinor });
    const active = await metric("muj-prostor.retainers_active").compute(owner, input(), deps);
    expect(active).toEqual({ kind: "scalar", value: ov.summary.activeCount });
    const critical = await metric("muj-prostor.domains_critical").compute(owner, input(), deps);
    expect(critical).toEqual({ kind: "scalar", value: await countCriticalDomains(owner) });

    const exp = await metric("muj-prostor.expirations").compute(owner, input({ days: 60 }), deps);
    if (exp.kind !== "series") throw new Error("série");
    const values = exp.series[0]!.values as number[];
    expect(values.length).toBeGreaterThan(0);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(Math.max(...values)).toBeLessThanOrEqual(60);
    expect(values.some((v) => v < 0)).toBe(true); // po expiraci / po termínu
    expect(exp.categories.some((c) => c.label.startsWith("Hosting: "))).toBe(true);
    const narrow = await metric("muj-prostor.expirations").compute(owner, input({ days: 1 }), deps);
    if (narrow.kind !== "series") throw new Error("série");
    expect(Math.max(...(narrow.series[0]!.values as number[]))).toBeLessThanOrEqual(1);
  });

  it("firma s hostingem nebo doménou se nesmaže, dokud je má", async () => {
    const co = await createRecord(owner, f.registry, await R("company"), { name: `Blok ${tag}` });
    const svc = await newService({ company: co.row.id });
    const msg = await deleteBlockMessage(owner, "company", co.row.id, "Firma");
    expect(msg).toMatch(/hostingu a údržby/);
    await deleteRecord(owner, await R("recurring_service"), svc.id);
    expect(await deleteBlockMessage(owner, "company", co.row.id, "Firma")).toBeNull();
    // Patrik o hostingu nic nezjistí
    await newService({ company: co.row.id });
    expect(await deleteBlockMessage(partner, "company", co.row.id, "Firma")).toBeNull();
  });
});

describe("výchozí pohledy (HOST-02)", () => {
  it("všechny seedované pohledy jdou vyhodnotit nad entitou (filtry, řazení i seskupení)", async () => {
    await ensureSeedViews(db, MUJ_PROSTOR_VIEWS);
    for (const entityKey of ["recurring_service", "web_domain"] as const) {
      const e = await R(entityKey);
      const views = await listViews(owner, e.def);
      const mine = MUJ_PROSTOR_VIEWS.filter((v) => v.entityType === entityKey);
      for (const v of mine) {
        expect(
          views.some((x) => x.name === v.name),
          `${entityKey}: ${v.name}`,
        ).toBe(true);
        const q = {
          ...(v.config.filters ? { filters: v.config.filters as never } : {}),
          ...(v.config.sort ? { sort: v.config.sort } : {}),
        };
        await queryRecords(owner, f.registry, e, q);
        if (v.config.group) await queryGroups(owner, e, v.config.group, q);
        for (const k of v.config.columns ?? [])
          expect(e.byKey.has(k), `${entityKey}: sloupec ${k}`).toBe(true);
      }
    }
  });

  it("Obnova do 30 dní ukáže jen aktivní služby s blízkou obnovou nebo po termínu", async () => {
    const e = await R("recurring_service");
    const view = MUJ_PROSTOR_VIEWS.find((v) => v.name === "Obnova do 30 dní")!;
    const out = await queryRecords(owner, f.registry, e, { filters: view.config.filters as never });
    expect(out.rows.length).toBeGreaterThan(0);
    for (const r of out.rows) {
      expect(r.status).toBe("active");
      expect(String(r.nextRenewal) <= inDays(30)).toBe(true);
    }
  });
});

describe("jen pro vlastníka (MPR-01)", () => {
  it("Patrik nesmí volat žádný příkaz hostingu a domén", () => {
    const names = [...f.collected.commands.keys()].filter(
      (n) =>
        n.startsWith("muj-prostor.hosting.") ||
        n.startsWith("muj-prostor.domains.") ||
        n.startsWith("muj-prostor.client."),
    );
    expect(names.length).toBeGreaterThanOrEqual(7);
    for (const n of names)
      expect(() => assertCommandPermission(partner, f.collected.commands.get(n)!), n).toThrow(
        PermissionError,
      );
  });

  it("Patrik evidenci nevidí v seznamech, hledání, součtech, odznaku, metrikách ani na kartě klienta", async () => {
    const d = await createRecord(owner, f.registry, await R("web_domain"), {
      domain: `tajna-${tag}.cz`,
      expiresOn: inDays(3),
    });
    for (const key of ["recurring_service", "web_domain"])
      await expect(queryRecords(partner, f.registry, await R(key), { limit: 5 })).rejects.toThrow();
    await expect(getRecord(partner, f.registry, await R("web_domain"), d.row.id)).rejects.toThrow();
    expect(await searchAll(partner, f.registry.all(), `tajna-${tag}`)).toEqual([]);
    expect((await searchAll(owner, f.registry.all(), `tajna-${tag}`)).length).toBe(1);
    // odznak, příspěvek ke kartě klienta a metriky
    expect(await countCriticalDomains(partner)).toBe(0);
    const badge = f.collected.navBadges.find((b) => b.href === "/muj-prostor/domeny")!;
    expect(await badge.count(partner, deps)).toBe(0);
    expect((await tabCountsOf(partner, company.id)).hosting).toBeUndefined();
    expect((await tabCountsOf(owner, company.id)).hosting).toBeGreaterThan(0);
    for (const m of f.collected.dashboardMetrics.filter((x) => x.key.startsWith("muj-prostor.")))
      expect(
        m.permissions.every((p) => partner.actor.permissions.has(p)),
        m.key,
      ).toBe(false);
    // čtecí cesty modulu pro canary test: Patrik z nich nedostane ani znak
    const paths = f.collected.privatePaths.filter((p) => p.name.startsWith("muj-prostor."));
    expect(paths.length).toBeGreaterThanOrEqual(8);
    for (const p of paths) {
      const out = JSON.stringify((await p.run(partner, deps)) ?? null);
      expect(out, p.name).not.toContain(tag);
      const mine = JSON.stringify((await p.run(owner, deps)) ?? null);
      expect(mine, p.name).not.toBe("null");
    }
  });
});
