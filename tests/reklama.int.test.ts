import { and, count, eq, isNull } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getPipeline } from "@rebar/core/config-data";
import { schema, type Db } from "@rebar/core/db";
import { processIngest, reprocessInbound, rotateIngestSecret } from "@rebar/core/ingest";
import { UserError } from "@rebar/core/rbac";
import { addDaysIso, todayIso } from "@rebar/core/time";
import { connectAppDb } from "@rebar/core/testing";
import { signatureHeader } from "../packages/core/src/webhooks/signature";
import type { ModuleDeps } from "@rebar/core/module-server";
import { company, person } from "@rebar/kontakty/schema";
import { deal } from "@rebar/obchody/schema";
import { job } from "@rebar/zakazky/schema";
import {
  ad,
  adAccount,
  adCampaign,
  adInsightDaily,
  adSet,
} from "../packages/modules/reklama/src/schema";
import { buildFixture, isolatedDb, type Fixture } from "./support/security-fixture";
import { leadsIngest } from "../packages/modules/reklama/src/meta/ingest";
import { syncMeta } from "../packages/modules/reklama/src/meta/sync";
import { setMetaClientForTests } from "../packages/modules/reklama/src/meta/connection";
import { syncDailyJob } from "../packages/modules/reklama/src/meta/jobs";
import {
  createFakeMetaClient,
  type FakeMetaClient,
} from "../packages/modules/reklama/src/meta/fake-meta";
import { MetaApiError, type MetaInsightRow } from "../packages/modules/reklama/src/meta/client";
import {
  accountDetail,
  campaignDetail,
  listAccounts,
  metricsFor,
} from "../packages/modules/reklama/src/meta/queries";
import {
  assignCampaignJob,
  connectionStatus,
  deleteMapping,
  listMappings,
  recentLeads,
  removeConnection,
  saveConnection,
  saveMapping,
  setAccountOwner,
} from "../packages/modules/reklama/src/meta/admin";
import { adMetrics, adClientCard } from "../packages/modules/reklama/src/meta/providers";

/*
  Reklama a leady z Meta (REK-A) nad skutečnou databází, s `fake-meta` místo Mety. AS-08: lead přes podepsaný ingest
  vytvoří kontakt, firmu (bez stavu klienta) a obchod ve správné fázi; stejný lead podruhé nic nezaloží; lead
  s chybou se zaznamená a jde zopakovat; po synchronizaci jsou vidět CPL, náklad na vyhraný obchod a rozdíl Meta vs. OPSYS;
  posledních 7 dní statistik se přepisuje, starší ne. Celý soubor běží v jedné transakci, která se vrátí.
*/

const app = connectAppDb();
let f: Fixture;
let db: Db;
let discard: () => Promise<void>;
let deps: ModuleDeps;
let secret: string;
let fake: FakeMetaClient;
const today = todayIso();
const NOW = new Date();

const owner = () => f.people.owner.ctx;
const partner = () => f.people.partner.ctx;

const send = (body: unknown, now = NOW) => {
  const raw = JSON.stringify(body);
  return processIngest({
    db,
    cipher: deps.cipher,
    ingests: [leadsIngest],
    deps,
    source: "leads",
    rawBody: raw,
    signature: signatureHeader(secret, raw, now.getTime()),
    ip: "203.0.113.9",
    now,
  });
};

const n = async (table: PgTable) => {
  const [r] = await db.select({ n: count() }).from(table);
  return Number(r?.n);
};

const lead = (id: string, extra: Record<string, unknown> = {}) => ({
  leadgenId: id,
  formId: "FORM-1",
  formName: "Poptávka webu",
  campaignId: "CAMP-1",
  campaignName: "Weby – podzim",
  adsetId: "SET-1",
  adId: "AD-1",
  fieldData: [
    { name: "full_name", values: ["Jan Novák"] },
    { name: "email", values: ["jan.novak@firma.cz"] },
    { name: "phone_number", values: ["+420 777 123 456"] },
    { name: "company_name", values: ["Novák Stavby s.r.o."] },
  ],
  ...extra,
});

const dealOf = async (leadgenId: string) =>
  (await db.select().from(deal).where(eq(deal.metaLeadgenId, leadgenId)))[0];

let stages: { id: string; name: string }[];
let pipelineId: string;

beforeAll(async () => {
  ({ db, discard } = await isolatedDb(app.db));
  f = await buildFixture(db);
  deps = f.deps;
  ({ secret } = await rotateIngestSecret(owner(), deps.cipher));
  const pl = await getPipeline(db, "deal", "default");
  pipelineId = pl!.id;
  stages = pl!.stages.map((s) => ({ id: s.id, name: s.name }));
}, 120_000);

afterAll(async () => {
  setMetaClientForTests(null);
  vi.restoreAllMocks();
  await discard();
  await app.close();
});

describe("příjem leadů (AS-08)", () => {
  it("nemapovaný formulář: výchozí pipeline, první fáze a vlastník Ondřej; firma bez stavu klienta", async () => {
    const r = await send(lead("L-100"));
    expect(r.status).toBe(200);
    const d = (await dealOf("L-100"))!;
    expect(d).toMatchObject({
      source: "meta",
      sourceDetail: "Weby – podzim",
      metaCampaignId: "CAMP-1",
      metaAdsetId: "SET-1",
      metaAdId: "AD-1",
      stageId: stages[0]!.id,
      ownerId: f.people.owner.id,
      result: "open",
    });
    expect(d.title).toBe("Jan Novák – Poptávka webu");
    const [c] = await db.select().from(company).where(eq(company.id, d.companyId!));
    expect(c).toMatchObject({ name: "Novák Stavby s.r.o.", clientStatus: null });
    expect(d.personId).toBeTruthy();
    expect(r.body).toMatchObject({ ok: true, entity: { type: "deal", id: d.id } });
    // záznam příchozího leadu
    const [ev] = await db
      .select()
      .from(schema.inboundEvent)
      .where(eq(schema.inboundEvent.externalId, "L-100"));
    expect(ev).toMatchObject({
      source: "leads",
      status: "processed",
      entityType: "deal",
      entityId: d.id,
    });
  });

  it("stejný lead podruhé nic nezaloží (idempotence podle leadgenId)", async () => {
    const before = { deals: await n(deal), people: await n(person), companies: await n(company) };
    const again = await send(lead("L-100"));
    expect(again).toMatchObject({ status: 200, body: { duplicate: true } });
    expect({ deals: await n(deal), people: await n(person), companies: await n(company) }).toEqual(
      before,
    );
  });

  it("jiný lead téhož člověka (e-mail, telefon v jiném zápisu) a firmy nezaloží duplicitu", async () => {
    const before = { people: await n(person), companies: await n(company) };
    const r = await send(
      lead("L-101", {
        fieldData: [
          { name: "full_name", values: ["Jan Novák"] },
          { name: "email", values: ["JAN.NOVAK@firma.cz"] },
          { name: "phone_number", values: ["777123456"] },
          { name: "company_name", values: ["Novák Stavby s.r.o."] },
        ],
      }),
    );
    expect(r.status).toBe(200);
    expect({ people: await n(person), companies: await n(company) }).toEqual(before);
    const a = (await dealOf("L-100"))!;
    const b = (await dealOf("L-101"))!;
    expect(b.id).not.toBe(a.id);
    expect(b.personId).toBe(a.personId);
    expect(b.companyId).toBe(a.companyId);
  });

  it("lead bez firmy vznikne jen s kontaktem a obchodem", async () => {
    const r = await send(
      lead("L-102", {
        fieldData: [
          { name: "Jméno a příjmení", values: ["Eva Svobodová"] },
          { name: "E-mail", values: ["eva@seznam.cz"] },
        ],
      }),
    );
    expect(r.status).toBe(200);
    const d = (await dealOf("L-102"))!;
    expect(d.companyId).toBeNull();
    expect(d.personId).toBeTruthy();
  });

  it("mapování formuláře určí fázi, vlastníka a služby; zastaralé mapování lead nezahodí", async () => {
    const stage = stages[1]!;
    const m = await saveMapping(owner(), {
      metaFormId: "FORM-MAP",
      name: "Formulář marketing",
      pipelineId,
      stageId: stage.id,
      ownerId: f.people.partner.id,
      defaultServices: ["marketing"],
    });
    await send(lead("L-110", { formId: "FORM-MAP" }));
    const d = (await dealOf("L-110"))!;
    expect(d).toMatchObject({ stageId: stage.id, ownerId: f.people.partner.id });
    expect(d.services).toEqual(["marketing"]);

    // mapovaná fáze zmizí → lead padá do výchozí fáze, nezmizí
    await db
      .update(schema.pipelineStage)
      .set({ deletedAt: new Date() })
      .where(eq(schema.pipelineStage.id, stage.id));
    expect((await send(lead("L-111", { formId: "FORM-MAP" }))).status).toBe(200);
    expect((await dealOf("L-111"))!.stageId).toBe(stages[0]!.id);
    await db
      .update(schema.pipelineStage)
      .set({ deletedAt: null })
      .where(eq(schema.pipelineStage.id, stage.id));

    const list = await listMappings(owner());
    expect(list.mappings.map((x) => x.metaFormId)).toContain("FORM-MAP");
    expect(list.seenForms.find((x) => x.formId === "FORM-MAP")).toMatchObject({ mapped: true });
    expect(list.seenForms.find((x) => x.formId === "FORM-1")).toMatchObject({ mapped: false });
    expect(list.fallback).toMatchObject({ stageId: stages[0]!.id, ownerId: f.people.owner.id });

    await expect(
      saveMapping(owner(), {
        metaFormId: "FORM-MAP",
        name: "Duplicita",
        pipelineId,
        stageId: stage.id,
        ownerId: f.people.owner.id,
        defaultServices: [],
      }),
    ).rejects.toThrow(UserError);
    await expect(
      saveMapping(owner(), {
        metaFormId: "X",
        name: "Špatná fáze",
        pipelineId,
        stageId: "00000000-0000-4000-8000-000000000000",
        ownerId: f.people.owner.id,
        defaultServices: [],
      }),
    ).rejects.toThrow(UserError);
    await deleteMapping(owner(), m.id);
    await send(lead("L-112", { formId: "FORM-MAP" }));
    expect((await dealOf("L-112"))!.ownerId).toBe(f.people.owner.id);
  });

  it("lead se zaznamená i při selhání zpracování; nic nezůstane napůl a jde zopakovat", async () => {
    const obchody = await import("@rebar/obchody/api");
    const spy = vi
      .spyOn(obchody, "createDealFromLead")
      .mockRejectedValueOnce(new Error("DB spadla"));
    const before = { deals: await n(deal), people: await n(person) };
    const r = await send(
      lead("L-200", {
        fieldData: [
          { name: "full_name", values: ["Petr Chybný"] },
          { name: "email", values: ["petr@chybny.cz"] },
        ],
      }),
    );
    expect(r.status).toBe(500);
    spy.mockRestore();
    // transakce se vrátila: žádný obchod ani nový kontakt
    expect({ deals: await n(deal), people: await n(person) }).toEqual(before);
    const [ev] = await db
      .select()
      .from(schema.inboundEvent)
      .where(eq(schema.inboundEvent.externalId, "L-200"));
    expect(ev).toMatchObject({ status: "failed" });
    expect(ev!.error).toContain("DB spadla");
    expect((await recentLeads(owner(), 50)).find((x) => x.leadgenId === "L-200")).toMatchObject({
      status: "failed",
    });

    // opakování ze zapsaného těla (tlačítko v Nastavení) lead zpracuje právě jednou
    const re = await reprocessInbound({ db, ingests: [leadsIngest], deps }, ev!.id);
    expect(re.status).toBe(200);
    expect(await dealOf("L-200")).toBeTruthy();
    expect(
      (await reprocessInbound({ db, ingests: [leadsIngest], deps }, ev!.id)).body,
    ).toMatchObject({
      duplicate: true,
    });
    expect((await db.select().from(deal).where(eq(deal.metaLeadgenId, "L-200"))).length).toBe(1);
  });

  it("neplatné tělo se zaznamená jako chybné, neplatný podpis nezpracuje nic", async () => {
    const bad = await send({ formId: "F" });
    expect(bad.status).toBe(422);
    const raw = JSON.stringify(lead("L-300"));
    const r = await processIngest({
      db,
      cipher: deps.cipher,
      ingests: [leadsIngest],
      deps,
      source: "leads",
      rawBody: raw,
      signature: signatureHeader("jine-tajemstvi", raw, NOW.getTime()),
      now: NOW,
    });
    expect(r.status).toBe(401);
    expect(await dealOf("L-300")).toBeUndefined();
  });
});

describe("synchronizace s Meta (fake-meta)", () => {
  const day = (d: number) => addDaysIso(today, d);
  const row = (
    level: MetaInsightRow["level"],
    objectId: string,
    date: string,
    spendMinor: number,
    leads: number,
  ): MetaInsightRow => ({
    level,
    objectId,
    date,
    spendMinor,
    impressions: spendMinor * 10,
    clicks: leads * 5,
    leads,
  });

  function seedFake() {
    const insights: MetaInsightRow[] = [];
    for (let d = -12; d <= 0; d++) {
      insights.push(row("campaign", "CAMP-1", day(d), 10_000, 1));
      insights.push(row("adset", "SET-1", day(d), 10_000, 1));
      insights.push(row("ad", "AD-1", day(d), 10_000, 1));
    }
    return createFakeMetaClient([
      {
        account: {
          id: "act_1",
          name: "OP Digital",
          currency: "CZK",
          timezone: "Europe/Prague",
          active: true,
        },
        campaigns: [{ id: "CAMP-1", name: "Weby – podzim", objective: "LEADS", status: "ACTIVE" }],
        adSets: [{ id: "SET-1", campaignId: "CAMP-1", name: "Sada 1", status: "ACTIVE" }],
        ads: [
          {
            id: "AD-1",
            adSetId: "SET-1",
            name: "Reklama 1",
            status: "ACTIVE",
            creativeUrl: "https://x/img.png",
          },
        ],
        insights,
      },
      {
        account: {
          id: "act_2",
          name: "Klient s.r.o.",
          currency: "CZK",
          timezone: null,
          active: true,
        },
        campaigns: [],
        adSets: [],
        ads: [],
        insights: [],
      },
    ]);
  }

  const spendOn = async (campaignMetaId: string, date: string) => {
    const [c] = await db.select().from(adCampaign).where(eq(adCampaign.metaId, campaignMetaId));
    const [r] = await db
      .select()
      .from(adInsightDaily)
      .where(
        and(
          eq(adInsightDaily.level, "campaign"),
          eq(adInsightDaily.objectId, c!.id),
          eq(adInsightDaily.date, date),
        ),
      );
    return r?.spendMinor;
  };

  it("první běh načte účty, kampaně, sady, reklamy a statistiky", async () => {
    fake = seedFake();
    const s = await syncMeta(db, deps, { client: fake, today });
    expect(s).toMatchObject({ accounts: 2, campaigns: 1, adSets: 1, ads: 1, errors: [] });
    expect(s.insightRows).toBe(13 * 3);
    expect(await n(adCampaign)).toBe(1);
    expect(await n(adSet)).toBe(1);
    expect(await n(ad)).toBe(1);
    const [acc] = await db.select().from(adAccount).where(eq(adAccount.metaId, "act_1"));
    expect(acc).toMatchObject({ ownerKind: "agency", companyId: null, lastSyncError: null });
    expect(acc!.lastSyncAt).toBeInstanceOf(Date);
  });

  it("posledních 7 dní se přepíše (včetně smazaného řádku), starší zůstanou", async () => {
    const inside = day(-3);
    const outside = day(-10);
    expect(await spendOn("CAMP-1", inside)).toBe(10_000);
    // korekce od Meta: dnešek a -3 dny se změnily, -10 dní také (to se přepsat nesmí), -5 dní už Meta nevrací
    fake.setInsight("act_1", row("campaign", "CAMP-1", inside, 12_345, 2));
    fake.setInsight("act_1", row("campaign", "CAMP-1", day(0), 99_900, 4));
    fake.setInsight("act_1", row("campaign", "CAMP-1", outside, 77_777, 9));
    const list = fake.accounts.get("act_1")!.insights;
    fake.accounts.get("act_1")!.insights = list.filter(
      (r) => !(r.level === "campaign" && r.date === day(-5)),
    );
    const s = await syncMeta(db, deps, { client: fake, today });
    expect(s.rewrittenFrom).toBe(day(-7));
    expect(await spendOn("CAMP-1", inside)).toBe(12_345);
    expect(await spendOn("CAMP-1", day(0))).toBe(99_900);
    expect(await spendOn("CAMP-1", day(-5))).toBeUndefined();
    expect(await spendOn("CAMP-1", outside)).toBe(10_000);
  });

  it("přiřazení kampaně zakázce a vlastník účtu přežijí další synchronizaci", async () => {
    const [camp] = await db.select().from(adCampaign).where(eq(adCampaign.metaId, "CAMP-1"));
    const [acc] = await db.select().from(adAccount).where(eq(adAccount.metaId, "act_1"));
    const [c] = await db.insert(company).values({ name: "Klient reklamy s.r.o." }).returning();
    const [mk] = await db
      .insert(job)
      .values({
        number: "Z-2026-901",
        title: "Marketing klienta",
        companyId: c!.id,
        type: "marketing",
      })
      .returning();
    const [web] = await db
      .insert(job)
      .values({ number: "Z-2026-902", title: "Web klienta", companyId: c!.id, type: "web" })
      .returning();
    await expect(
      assignCampaignJob(owner(), { campaignId: camp!.id, jobId: web!.id }),
    ).rejects.toThrow(/marketingové/);
    await expect(
      assignCampaignJob(owner(), {
        campaignId: camp!.id,
        jobId: "00000000-0000-4000-8000-000000000000",
      }),
    ).rejects.toThrow(UserError);
    await assignCampaignJob(owner(), { campaignId: camp!.id, jobId: mk!.id });
    await setAccountOwner(owner(), { accountId: acc!.id, ownerKind: "client", companyId: c!.id });
    await expect(
      setAccountOwner(owner(), { accountId: acc!.id, ownerKind: "client" }),
    ).rejects.toThrow();

    await syncMeta(db, deps, { client: fake, today });
    const [after] = await db.select().from(adCampaign).where(eq(adCampaign.id, camp!.id));
    expect(after!.jobId).toBe(mk!.id);
    const [accAfter] = await db.select().from(adAccount).where(eq(adAccount.id, acc!.id));
    expect(accAfter).toMatchObject({ ownerKind: "client", companyId: c!.id });

    const accounts = await listAccounts(owner(), deps, {});
    const row1 = accounts.accounts.find((a) => a.metaId === "act_1")!;
    expect(row1).toMatchObject({ companyName: "Klient reklamy s.r.o.", campaignCount: 1 });
    expect(row1.spendThisMonthMinor).toBeGreaterThan(0);
  });

  it("chyba jednoho účtu se zaznamená, ostatní se zpracují; lastSyncError zmizí po úspěchu", async () => {
    fake.failNext(new MetaApiError("Meta: dočasná chyba", { retryable: true }), "listCampaigns");
    const s = await syncMeta(db, deps, { client: fake, today });
    expect(s.errors).toHaveLength(1);
    expect(s.accounts).toBe(1);
    const [bad] = await db
      .select()
      .from(adAccount)
      .where(eq(adAccount.id, s.errors[0]!.accountId!));
    expect(bad!.lastSyncError).toContain("dočasná chyba");
    const ok = await syncMeta(db, deps, { client: fake, today });
    expect(ok.errors).toEqual([]);
    const [fixed] = await db.select().from(adAccount).where(eq(adAccount.id, bad!.id));
    expect(fixed!.lastSyncError).toBeNull();
  });

  it("denní úloha: bez napojení nedělá nic, s napojením synchronizuje", async () => {
    setMetaClientForTests(null);
    const jobDeps = {
      db,
      registry: deps.registry,
      cipher: deps.cipher,
      queue: deps.queue,
      settings: deps.settings,
      baseURL: deps.baseURL,
    };
    await expect(syncDailyJob.handler(jobDeps, {}, {} as never)).resolves.toBeUndefined();
    expect(syncDailyJob.cron).toBe("0 6 * * *");
    setMetaClientForTests(fake);
    const before = fake.calls.length;
    await syncDailyJob.handler(jobDeps, {}, {} as never);
    expect(fake.calls.length).toBeGreaterThan(before);
    setMetaClientForTests(null);
  });
});

describe("výpočty nad daty (REK-08, 09, 10)", () => {
  const period = { from: addDaysIso(today, -12), to: today };

  it("kampaň: útrata, leady Meta × OPSYS, CPL, ztracené leady a náklad na vyhraný obchod", async () => {
    const [camp] = await db.select().from(adCampaign).where(eq(adCampaign.metaId, "CAMP-1"));
    const dealsOfCampaign = await db
      .select()
      .from(deal)
      .where(and(eq(deal.metaCampaignId, "CAMP-1"), isNull(deal.deletedAt)));
    const opsys = dealsOfCampaign.length;
    expect(opsys).toBeGreaterThanOrEqual(5);

    const before = await campaignDetail(owner(), { campaignId: camp!.id, period });
    const m = before.totals;
    // statistiky ze synchronizace: dnes 99 900, -3 dny 12 345, -5 dní chybí, zbytek 10 000 (13 dní - 1 smazaný)
    const spend = 99_900 + 12_345 + 10_000 * 10;
    expect(m.spendMinor).toBe(spend);
    expect(m.leadsOpsys).toBe(opsys);
    expect(m.leadsMeta).toBe(4 + 2 + 10);
    expect(m.leadsLost).toBe(m.leadsMeta - opsys);
    expect(m.cplMinor).toBe(Math.round(spend / m.leadsMeta));
    expect(m.cplOpsysMinor).toBe(Math.round(spend / opsys));
    expect(m.wonDeals).toBe(0);
    expect(m.costPerWonMinor).toBeNull();
    expect(before.leads).toHaveLength(opsys);
    expect(before.adSets[0]!.ads[0]).toMatchObject({
      name: "Reklama 1",
      creativeUrl: "https://x/img.png",
    });
    expect(before.daily).toHaveLength(13);
    expect(before.daily.find((d) => d.date === today)).toMatchObject({
      spendMinor: 99_900,
      leadsMeta: 4,
    });
    expect(before.daily.reduce((s, d) => s + d.leadsOpsys, 0)).toBe(opsys);

    // výhra obchodu → náklad na vyhraný obchod
    await db.update(deal).set({ result: "won" }).where(eq(deal.id, dealsOfCampaign[0]!.id));
    const won = await campaignDetail(owner(), { campaignId: camp!.id, period });
    expect(won.totals.wonDeals).toBe(1);
    expect(won.totals.costPerWonMinor).toBe(spend);
    // sada i reklama mají stejná čísla z leadů s vazbou na sadu/reklamu
    expect(won.adSets[0]!.metrics.leadsOpsys).toBe(opsys);
    expect(won.adSets[0]!.ads[0]!.metrics.wonDeals).toBe(1);
  });

  it("období omezuje statistiky i leady", async () => {
    const [camp] = await db.select().from(adCampaign).where(eq(adCampaign.metaId, "CAMP-1"));
    const none = await campaignDetail(owner(), {
      campaignId: camp!.id,
      period: { from: addDaysIso(today, -60), to: addDaysIso(today, -30) },
    });
    expect(none.totals).toMatchObject({
      spendMinor: 0,
      leadsMeta: 0,
      leadsOpsys: 0,
      cplMinor: null,
    });
  });

  it("soukromý obchod se partnerovi nezapočítá, vlastníkovi ano", async () => {
    const [camp] = await db.select().from(adCampaign).where(eq(adCampaign.metaId, "CAMP-1"));
    const d = (await dealOf("L-101"))!;
    const asOwnerBefore = (await campaignDetail(owner(), { campaignId: camp!.id, period })).totals;
    await db.update(deal).set({ isPrivate: true }).where(eq(deal.id, d.id));
    const asPartner = (await campaignDetail(partner(), { campaignId: camp!.id, period })).totals;
    const asOwner = (await campaignDetail(owner(), { campaignId: camp!.id, period })).totals;
    expect(asPartner.leadsOpsys).toBe(asOwnerBefore.leadsOpsys - 1);
    expect(asOwner.leadsOpsys).toBe(asOwnerBefore.leadsOpsys);
    const detail = await campaignDetail(partner(), { campaignId: camp!.id, period });
    expect(detail.leads.some((l) => l.dealId === d.id)).toBe(false);
    await db.update(deal).set({ isPrivate: false }).where(eq(deal.id, d.id));
  });

  it("účet a klient: souhrn přes zakázku a účet klienta; karta klienta má počet kampaní", async () => {
    const [acc] = await db.select().from(adAccount).where(eq(adAccount.metaId, "act_1"));
    const detail = await accountDetail(owner(), { accountId: acc!.id, period });
    expect(detail.campaigns).toHaveLength(1);
    expect(detail.campaigns[0]!.jobTitle).toBe("Marketing klienta");
    expect(detail.totals.spendMinor).toBe(detail.campaigns[0]!.metrics.spendMinor);
    const overview = await metricsFor(owner(), { scope: { companyId: acc!.companyId! }, period });
    expect(overview.campaigns).toHaveLength(1);
    expect(overview.totals.spendMinor).toBe(detail.totals.spendMinor);
    const other = await metricsFor(owner(), {
      scope: { companyId: "00000000-0000-4000-8000-000000000000" },
      period,
    });
    expect(other.campaigns).toHaveLength(0);
    expect(await adClientCard.tabCounts!(owner(), acc!.companyId!)).toEqual({ reklama: 1 });
  });

  it("metriky nástěnky: leady, CPL, útrata, náklad na výhru, řada po dnech", async () => {
    const input = {
      from: period.from,
      to: period.to,
      jobId: null,
      userId: null,
      bucket: null,
      limit: 50,
      params: {},
      today,
    };
    const byKey = Object.fromEntries(adMetrics.map((m) => [m.key, m]));
    const leads = await byKey["reklama.leads"]!.compute(owner(), input, deps);
    const cpl = await byKey["reklama.cpl"]!.compute(owner(), input, deps);
    const series = await byKey["reklama.leads_cpl"]!.compute(owner(), input, deps);
    expect(leads).toEqual({ kind: "scalar", value: 16 });
    expect(cpl).toMatchObject({ kind: "scalar" });
    expect((cpl as { value: number }).value).toBeGreaterThan(0);
    expect(series).toMatchObject({ kind: "series" });
    expect((series as { categories: unknown[] }).categories).toHaveLength(13);
    expect(
      (await byKey["reklama.cost_per_won"]!.compute(owner(), input, deps)) as { value: number },
    ).toMatchObject({
      value: expect.any(Number),
    });
  });
});

describe("napojení (token)", () => {
  it("token se uloží šifrovaně, do stavu se nedostane a jde odpojit", async () => {
    expect(await connectionStatus(owner(), deps)).toMatchObject({ connected: false });
    await saveConnection(owner(), deps, "EAAG-tajny-testovaci-token-1234567890");
    const st = await connectionStatus(owner(), deps);
    expect(st).toMatchObject({ connected: true, status: "ok" });
    expect(JSON.stringify(st)).not.toContain("EAAG");
    const [row] = await db
      .select()
      .from(schema.integrationCredential)
      .where(eq(schema.integrationCredential.provider, "meta"));
    expect(row!.dataEnc).not.toContain("EAAG");
    expect((await listAccounts(owner(), deps, {})).connected).toBe(true);
    await removeConnection(owner(), deps);
    expect(await connectionStatus(owner(), deps)).toMatchObject({ connected: false });
  });
});
