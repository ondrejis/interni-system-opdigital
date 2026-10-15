import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ensureLookup,
  ensurePipeline,
  getPipeline,
  registerStageUsageFromEntities,
} from "@rebar/core/config-data";
import type { DomainEventName } from "@rebar/core/contracts";
import {
  clearEntityPolicies,
  createEntityRegistry,
  registerEntityPolicies,
  writeSystemFields,
  type EntityRegistry,
} from "@rebar/core/entities";
import { setDomainEvents } from "@rebar/core/events";
import type { ModuleDeps } from "@rebar/core/module-server";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { createStubServices } from "@rebar/core/testing";
import { company, person } from "@rebar/kontakty/schema";
import { companyEntity, personEntity } from "@rebar/kontakty/server";
import { manifest } from "../index";
import { deal, dealParticipant, dealStageHistory } from "../schema";
import { dealEntity } from "../entities";
import { createDealFromLead } from "../api";
import { dealMetrics, dealClientCard } from "./metrics";
import {
  addDealStage,
  deleteDealStage,
  getPipelineAdmin,
  addLostReason,
  updateDealStage,
  updateLostReason,
} from "./pipeline-admin";
import { board, detail, history, lostReasons } from "./queries";
import { quickAdd } from "./quick-add";
import {
  addParticipant,
  archiveDeal,
  createDeal,
  loseDeal,
  markDealOpened,
  moveDealStage,
  removeParticipant,
  reopenDeal,
  updateDeal,
  winDeal,
} from "./transitions";

const createJobs = vi.fn();
vi.mock("@rebar/zakazky/api", () => ({
  createJobsFromWonDeal: (...a: unknown[]) => createJobs(...a),
}));

const app = connectAppDb();
afterAll(() => app.close());

let registry: EntityRegistry;
let stages: { id: string; name: string; probabilityPct: number | null }[];
const stub = createStubServices({ clients: true });
const deps = () => ({ registry, services: stub.services }) as unknown as ModuleDeps;
const events: { name: string; data: unknown; isPrivate: boolean }[] = [];
const names: DomainEventName[] = ["deal.created", "deal.stage_changed", "deal.won", "deal.lost"];

beforeAll(async () => {
  clearEntityPolicies();
  registry = createEntityRegistry([companyEntity, personEntity, dealEntity]);
  registerEntityPolicies(registry);
  registerStageUsageFromEntities(registry.all());
  for (const p of manifest.seed.pipelines ?? []) await ensurePipeline(app.db, p);
  for (const l of manifest.seed.lookups ?? []) await ensureLookup(app.db, l);
  stages = (await getPipeline(app.db, "deal", "default"))!.stages;
});
beforeEach(() => {
  events.length = 0;
  stub.calls.length = 0;
  createJobs.mockReset();
  setDomainEvents(
    Object.fromEntries(
      names.map((n) => [
        n,
        [
          async (
            _c: unknown,
            e: { name: string; data: unknown; entity: { isPrivate: boolean } },
          ) => {
            events.push({ name: e.name, data: e.data, isPrivate: e.entity.isPrivate });
          },
        ],
      ]),
    ) as never,
    deps,
  );
});

const stage = (name: string) => stages.find((s) => s.name === name)!;
const boss = () =>
  makeUser(
    app.db,
    [
      "obchody.read",
      "obchody.write",
      "obchody.create",
      "obchody.delete",
      "obchody.pipelines",
      "kontakty.read",
      "kontakty.write",
      "kontakty.create",
      "private.read",
    ].map((k) => [k, "all"] as [string, "all"]),
  );
const partner = () =>
  makeUser(
    app.db,
    ["obchody.read", "obchody.write", "obchody.create", "kontakty.read"].map(
      (k) => [k, "all"] as [string, "all"],
    ),
  );
type User = Awaited<ReturnType<typeof boss>>;
const tag = () => randomBytes(3).toString("hex");

async function mkCompany(name = `Firma ${tag()}`) {
  const [c] = await app.db.insert(company).values({ name }).returning();
  return c!;
}
async function mkDeal(u: User, extra: Record<string, unknown> = {}) {
  const r = await createDeal(u.ctx, deps(), {
    title: `Obchod ${tag()}`,
    services: [],
    source: "manual",
    tags: [],
    participantIds: [],
    ...extra,
  } as never);
  return r.dealId;
}
const raw = async (id: string) => (await app.db.select().from(deal).where(eq(deal.id, id)))[0]!;
const hist = (id: string) =>
  app.db
    .select()
    .from(dealStageHistory)
    .where(eq(dealStageHistory.dealId, id))
    .orderBy(dealStageHistory.enteredAt);

describe("založení a historie fází", () => {
  it("nový obchod padá do první fáze, má vlastníka, první řádek historie a událost deal.created", async () => {
    const u = await boss();
    const id = await mkDeal(u, { valueMinor: 100_000_00 });
    const r = await raw(id);
    expect(r.stageId).toBe(stage("Nová poptávka").id);
    expect(r.ownerId).toBe(u.id);
    expect(r.result).toBe("open");
    expect(r.weightedMinor).toBe(10_000_00);
    const h = await hist(id);
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({
      fromStageId: null,
      toStageId: r.stageId,
      leftAt: null,
      byUserId: u.id,
    });
    expect(events.map((e) => e.name)).toEqual(["deal.created"]);
  });

  it("přesun uzavře předchozí pobyt, zapíše nový, přepočte váženou hodnotu a vyšle deal.stage_changed", async () => {
    const u = await boss();
    const id = await mkDeal(u, { valueMinor: 100_000_00 });
    const before = await raw(id);
    await moveDealStage(u.ctx, deps(), { dealId: id, stageId: stage("Nabídka odeslaná").id });
    const r = await raw(id);
    expect(r.stageId).toBe(stage("Nabídka odeslaná").id);
    expect(r.weightedMinor).toBe(60_000_00);
    expect(r.stageEnteredAt.getTime()).toBeGreaterThanOrEqual(before.stageEnteredAt.getTime());
    const h = await hist(id);
    expect(h.map((x) => x.leftAt !== null)).toEqual([true, false]);
    expect(h[0]!.durationSec).toBeGreaterThanOrEqual(0);
    expect(h[1]).toMatchObject({ fromStageId: stage("Nová poptávka").id });
    const ev = events.find((e) => e.name === "deal.stage_changed")!;
    expect(ev.data).toMatchObject({
      toStageId: stage("Nabídka odeslaná").id,
      fromStageId: stage("Nová poptávka").id,
    });
    expect((ev.data as { secondsInPrevious: number }).secondsInPrevious).toBeGreaterThanOrEqual(0);
    const d = await history(u.ctx, id);
    expect(d.map((x) => x.stageName)).toEqual(["Nová poptávka", "Nabídka odeslaná"]);
  });

  it("změna hodnoty přepočte váženou hodnotu; přesun na stejnou fázi nic nezapíše", async () => {
    const u = await boss();
    const id = await mkDeal(u, { valueMinor: 10_000_00 });
    await moveDealStage(u.ctx, deps(), { dealId: id, stageId: stage("Schůzka / konzultace").id });
    await updateDeal(u.ctx, deps(), { dealId: id, patch: { valueMinor: 50_000_00 } });
    expect((await raw(id)).weightedMinor).toBe(20_000_00);
    await moveDealStage(u.ctx, deps(), { dealId: id, stageId: stage("Schůzka / konzultace").id });
    expect(await hist(id)).toHaveLength(2);
  });

  it("další kontakty se zakládají, hlavní kontakt mezi ně nepatří", async () => {
    const u = await boss();
    const c = await mkCompany();
    const [p1] = await app.db.insert(person).values({ lastName: "Hlavní" }).returning();
    const [p2] = await app.db.insert(person).values({ lastName: "Druhý" }).returning();
    const id = await mkDeal(u, {
      companyId: c.id,
      personId: p1!.id,
      participantIds: [p1!.id, p2!.id],
    });
    const rows = await app.db.select().from(dealParticipant).where(eq(dealParticipant.dealId, id));
    expect(rows.map((r) => r.personId)).toEqual([p2!.id]);
    await expect(addParticipant(u.ctx, deps(), { dealId: id, personId: p1!.id })).rejects.toThrow(
      /hlavní/,
    );
    expect((await addParticipant(u.ctx, deps(), { dealId: id, personId: p2!.id })).added).toBe(
      false,
    );
    expect((await removeParticipant(u.ctx, deps(), { dealId: id, personId: p2!.id })).removed).toBe(
      true,
    );
    expect((await detail(u.ctx, deps(), id)).participants).toHaveLength(0);
  });
});

describe("prohra a znovuotevření", () => {
  it("prohra vyžaduje důvod z číselníku; s důvodem uloží poznámku, vyšle deal.lost a vynuluje váženou hodnotu", async () => {
    const u = await boss();
    const id = await mkDeal(u, { valueMinor: 10_000_00 });
    await expect(loseDeal(u.ctx, deps(), { dealId: id, reason: "neexistuje" })).rejects.toThrow(
      /důvod/,
    );
    await loseDeal(u.ctx, deps(), { dealId: id, reason: "price", note: "  Drahé  " });
    const r = await raw(id);
    expect(r).toMatchObject({
      result: "lost",
      lostReason: "price",
      lostNote: "Drahé",
      weightedMinor: 0,
    });
    expect(r.lostAt).not.toBeNull();
    expect(events.find((e) => e.name === "deal.lost")!.data).toMatchObject({
      reason: "price",
      note: "Drahé",
    });
    expect((await hist(id))[0]!.leftAt).not.toBeNull();
    await expect(loseDeal(u.ctx, deps(), { dealId: id, reason: "price" })).rejects.toThrow(
      /už je prohraný/,
    );
    await expect(
      moveDealStage(u.ctx, deps(), { dealId: id, stageId: stage("Kontaktováno").id }),
    ).rejects.toThrow(/znovu otevřete/);
  });

  it("znovuotevření vrátí obchod mezi otevřené ve stejné fázi, smaže důvod a začne nový pobyt ve fázi", async () => {
    const u = await boss();
    const id = await mkDeal(u, { valueMinor: 10_000_00 });
    await moveDealStage(u.ctx, deps(), { dealId: id, stageId: stage("Kontaktováno").id });
    await loseDeal(u.ctx, deps(), { dealId: id, reason: "no_response" });
    await reopenDeal(u.ctx, deps(), { dealId: id });
    const r = await raw(id);
    expect(r).toMatchObject({
      result: "open",
      lostReason: null,
      lostNote: null,
      lostAt: null,
      stageId: stage("Kontaktováno").id,
    });
    expect(r.weightedMinor).toBe(2_000_00);
    const h = await hist(id);
    expect(h).toHaveLength(3);
    expect(h[2]).toMatchObject({ leftAt: null, toStageId: stage("Kontaktováno").id });
    await expect(reopenDeal(u.ctx, deps(), { dealId: id })).rejects.toThrow(/otevřený/);
  });
});

describe("výhra", () => {
  it("označí vyhráno, nastaví klienta a služby, založí zakázky a vyšle deal.won s id zakázek", async () => {
    const u = await boss();
    const c = await mkCompany();
    const id = await mkDeal(u, {
      companyId: c.id,
      valueMinor: 50_000_00,
      services: ["web", "marketing"],
    });
    createJobs.mockResolvedValue({ jobs: [{ id: "j1", number: "Z-2026-001", type: "web" }] });
    const row = {
      type: "web",
      templateId: null,
      title: "Web",
      startDate: "2026-10-15",
      ownerId: u.id,
      memberIds: [],
    };
    const out = await winDeal(u.ctx, deps(), { dealId: id, jobs: [row] } as never);
    expect(out.jobs).toHaveLength(1);
    expect(out.clientUpdated).toBe(true);
    const r = await raw(id);
    expect(r).toMatchObject({ result: "won", weightedMinor: 50_000_00 });
    expect(r.wonAt).not.toBeNull();
    const calls = stub.calls.filter((x) => x.service === "clients");
    expect(calls.map((x) => x.method)).toEqual(["setStatus", "addServices"]);
    expect(calls[0]!.args[1]).toMatchObject({
      companyId: c.id,
      status: "active",
      source: "deal_won",
    });
    expect(calls[1]!.args[2]).toEqual(["web", "marketing"]);
    expect(createJobs.mock.calls[0]![2]).toMatchObject({
      dealId: id,
      companyId: c.id,
      dealValueMinor: 50_000_00,
    });
    expect(events.find((e) => e.name === "deal.won")!.data).toMatchObject({ jobIds: ["j1"] });
    await expect(winDeal(u.ctx, deps(), { dealId: id, jobs: [] } as never)).rejects.toThrow(
      /už je vyhraný/,
    );
  });

  it("„Přeskočit“ (bez řádků) zakázky nezakládá; výhra do budoucnosti nejde; výhra k datu ukládá to datum", async () => {
    const u = await boss();
    const c = await mkCompany();
    const id = await mkDeal(u, { companyId: c.id });
    await expect(
      winDeal(u.ctx, deps(), { dealId: id, wonOn: "2999-01-01", jobs: [] } as never),
    ).rejects.toThrow(/budoucnu/);
    await winDeal(u.ctx, deps(), { dealId: id, wonOn: "2026-09-01", jobs: [] } as never);
    expect(createJobs).not.toHaveBeenCalled();
    expect((await raw(id)).wonAt!.toISOString()).toBe("2026-09-01T10:00:00.000Z");
    // vyhraný obchod bez zakázek jde znovu otevřít
    await reopenDeal(u.ctx, deps(), { dealId: id });
    expect((await raw(id)).result).toBe("open");
  });

  it("selže-li založení zakázek, obchod zůstane otevřený a událost nevznikne", async () => {
    const u = await boss();
    const c = await mkCompany();
    const id = await mkDeal(u, { companyId: c.id });
    createJobs.mockRejectedValue(new Error("boom"));
    const row = {
      type: "web",
      templateId: null,
      title: "Web",
      startDate: "2026-10-15",
      ownerId: u.id,
      memberIds: [],
    };
    await expect(winDeal(u.ctx, deps(), { dealId: id, jobs: [row] } as never)).rejects.toThrow(
      "boom",
    );
    expect((await raw(id)).result).toBe("open");
    expect(events.some((e) => e.name === "deal.won")).toBe(false);
  });

  it("řádky zakázek bez organizace u obchodu se odmítnou", async () => {
    const u = await boss();
    const id = await mkDeal(u);
    const row = {
      type: "web",
      templateId: null,
      title: "Web",
      startDate: "2026-10-15",
      ownerId: u.id,
      memberIds: [],
    };
    await expect(winDeal(u.ctx, deps(), { dealId: id, jobs: [row] } as never)).rejects.toThrow(
      /organizaci/,
    );
  });
});

describe("lead z Meta", () => {
  it("createDealFromLead je idempotentní podle leadgenId a obchod je neotevřený, dokud ho někdo neotevře", async () => {
    const u = await boss();
    const c = await mkCompany();
    const [p] = await app.db.insert(person).values({ lastName: "Lead" }).returning();
    const pl = (await getPipeline(app.db, "deal", "default"))!;
    const input = {
      title: "Lead Meta",
      companyId: c.id,
      personId: p!.id,
      source: "meta" as const,
      meta: {
        campaignId: "c1",
        campaignName: "Jarní kampaň",
        adsetId: "a1",
        adId: "ad1",
        leadgenId: `lg-${tag()}`,
        formId: "f1",
      },
      formMapping: {
        pipelineId: pl.id,
        stageId: stage("Nová poptávka").id,
        ownerId: u.id,
        services: ["web" as const],
      },
    };
    const a = await createDealFromLead(u.ctx, deps(), input);
    const b = await createDealFromLead(u.ctx, deps(), input);
    expect(a.created).toBe(true);
    expect(b).toEqual({ dealId: a.dealId, created: false });
    const r = await raw(a.dealId);
    expect(r).toMatchObject({
      source: "meta",
      sourceDetail: "Jarní kampaň",
      metaCampaignId: "c1",
      ownerId: u.id,
      firstOpenedAt: null,
    });
    expect(await hist(a.dealId)).toHaveLength(1);
    expect(events.filter((e) => e.name === "deal.created")).toHaveLength(1);
    expect(
      (await board(u.ctx, deps(), {})).columns[0]!.cards.find((x) => x.id === a.dealId)!.highlight
        .unopenedLead,
    ).toBe(true);
    await markDealOpened(u.ctx, a.dealId);
    const opened = await raw(a.dealId);
    expect(opened.firstOpenedAt).not.toBeNull();
    expect(opened.openedBy).toBe(u.id);
    expect(opened.updatedAt).toEqual(r.updatedAt);
    await expect(
      createDealFromLead(u.ctx, deps(), {
        ...input,
        meta: { ...input.meta, leadgenId: `lg-${tag()}` },
        formMapping: { ...input.formMapping, pipelineId: c.id },
      }),
    ).rejects.toThrow(/nepatří/);
  });
});

describe("board, systémová pole a soukromí", () => {
  it("sloupce mají počet, součet a vážený součet; zvýraznění bez další aktivity; systémová pole píše writeSystemFields", async () => {
    const u = await boss();
    const c = await mkCompany(`Board ${tag()}`);
    const id = await mkDeal(u, { companyId: c.id, valueMinor: 100_00, title: `Boardový ${tag()}` });
    await moveDealStage(u.ctx, deps(), { dealId: id, stageId: stage("Nabídka odeslaná").id });
    let b = await board(u.ctx, deps(), { search: c.name.toLowerCase() });
    const col = b.columns.find((x) => x.stage.name === "Nabídka odeslaná")!;
    expect(col).toMatchObject({ count: 1, totalMinor: 100_00, weightedMinor: 60_00 });
    expect(col.cards[0]).toMatchObject({ companyName: c.name, ownerName: u.name });
    expect(col.cards[0]!.highlight.noNextActivity).toBe(true);
    expect(b.noNextActivity).toBe(1);

    const next = new Date(Date.now() + 3 * 86_400_000);
    await app.db.transaction(async (tx) => {
      await writeSystemFields({ ...u.ctx, db: tx }, registry, "deal", id, {
        nextActivityAt: next,
        lastActivityAt: new Date(),
      });
    });
    b = await board(u.ctx, deps(), { search: c.name });
    expect(
      b.columns.find((x) => x.stage.name === "Nabídka odeslaná")!.cards[0]!.highlight,
    ).toMatchObject({
      noNextActivity: false,
      activityState: "future",
    });
    const d = await detail(u.ctx, deps(), id);
    expect(d.stages.find((s) => s.id === stage("Nabídka odeslaná").id)!.daysIn).toBe(0);
    expect(d.deal.nextActivityAt).toBe(next.toISOString());
  });

  it("vyhrané a prohrané obchody na boardu nejsou; metriky počítají jen otevřené", async () => {
    const u = await boss();
    const c = await mkCompany(`Metr ${tag()}`);
    const a = await mkDeal(u, { companyId: c.id, valueMinor: 200_00 });
    const lost = await mkDeal(u, { companyId: c.id, valueMinor: 999_00 });
    await loseDeal(u.ctx, deps(), { dealId: lost, reason: "price" });
    const b = await board(u.ctx, deps(), { search: c.name });
    expect(b.totals).toMatchObject({ count: 1, totalMinor: 200_00 });
    expect(b.columns[0]!.cards.map((x) => x.id)).toEqual([a]);
    const input = {
      from: null,
      to: null,
      jobId: null,
      userId: u.id,
      bucket: null,
      limit: 20,
      params: {},
      today: "2026-10-15",
    };
    const byKey = (k: string) => dealMetrics.find((m) => m.key === k)!;
    const total = await byKey("obchody.pipeline_total").compute(u.ctx, input, deps());
    expect((total as { value: number }).value).toBeGreaterThanOrEqual(200_00);
    const series = await byKey("obchody.pipeline_value").compute(u.ctx, input, deps());
    expect(series).toMatchObject({ kind: "series" });
    const my = await byKey("obchody.my_open").compute(u.ctx, input, deps());
    expect((my as { value: number }).value).toBeGreaterThanOrEqual(1);
    expect(await dealClientCard.tabCounts!(u.ctx, c.id)).toEqual({ obchody: 2 });
    expect(await dealClientCard.summary!(u.ctx, c.id)).toEqual({
      deals: { open: 1, openValueMinor: 200_00 },
    });
  });

  it("soukromý obchod nevidí na boardu, v detailu ani v kartě klienta ten, kdo nemá private.read", async () => {
    const owner = await boss();
    const other = await partner();
    const c = await mkCompany(`Soukr ${tag()}`);
    const id = await mkDeal(owner, { companyId: c.id, valueMinor: 777_00, isPrivate: true });
    expect((await board(owner.ctx, deps(), { search: c.name })).totals.count).toBe(1);
    expect((await board(other.ctx, deps(), { search: c.name })).totals.count).toBe(0);
    await expect(detail(other.ctx, deps(), id)).rejects.toThrow();
    expect(await dealClientCard.tabCounts!(other.ctx, c.id)).toEqual({ obchody: 0 });
    expect(events.find((e) => e.name === "deal.created")!.isPrivate).toBe(true);
  });

  it("archivace přesune obchod do Koše (z boardu zmizí)", async () => {
    const u = await boss();
    const c = await mkCompany(`Arch ${tag()}`);
    const id = await mkDeal(u, { companyId: c.id });
    await archiveDeal(u.ctx, deps(), id);
    expect((await board(u.ctx, deps(), { search: c.name })).totals.count).toBe(0);
    expect((await raw(id)).deletedAt).not.toBeNull();
  });
});

describe("rychlé založení", () => {
  it("firma, kontakt a obchod v jedné transakci; podruhé se firma i osoba najdou", async () => {
    const u = await boss();
    const name = `Rychlá ${tag()} s.r.o.`;
    const email = `${tag()}@example.cz`;
    const input = {
      company: { name },
      person: { name: "Jan Novák", email },
      valueMinor: 5_000_00,
      services: ["web" as const],
    };
    const a = await quickAdd(u.ctx, deps(), input as never);
    expect(a.created).toEqual({ company: true, person: true });
    const r = await raw(a.dealId);
    expect(r).toMatchObject({
      title: name,
      companyId: a.companyId,
      personId: a.personId,
      services: ["web"],
    });
    const [c] = await app.db.select().from(company).where(eq(company.id, a.companyId!));
    expect(c!.clientStatus).toBeNull();
    const b = await quickAdd(u.ctx, deps(), input as never);
    expect(b.created).toEqual({ company: false, person: false });
    expect(b.companyId).toBe(a.companyId);
    expect(b.personId).toBe(a.personId);
  });

  it("selže-li založení obchodu, nezůstane ani firma", async () => {
    const u = await boss();
    const name = `Vratka ${tag()} s.r.o.`;
    await expect(
      quickAdd(u.ctx, deps(), {
        company: { name },
        stageId: "00000000-0000-4000-8000-000000000000",
      } as never),
    ).rejects.toThrow();
    expect(await app.db.select().from(company).where(eq(company.name, name))).toHaveLength(0);
  });
});

describe("správa pipeline", () => {
  it("fáze: přidání, změna pravděpodobnosti přepočte váženou hodnotu, použitou fázi nejde smazat", async () => {
    const u = await boss();
    const added = await addDealStage(u.ctx, {
      name: `Fáze ${tag()}`,
      probabilityPct: 50,
      rottingDays: 3,
    });
    const id = await mkDeal(u, { valueMinor: 1_000_00, stageId: added.stageId });
    expect((await raw(id)).weightedMinor).toBe(500_00);
    await updateDealStage(u.ctx, { stageId: added.stageId, probabilityPct: 25 });
    expect((await raw(id)).weightedMinor).toBe(250_00);
    await expect(deleteDealStage(u.ctx, added.stageId)).rejects.toThrow(/používá/);
    await moveDealStage(u.ctx, deps(), { dealId: id, stageId: stage("Kontaktováno").id });
    await deleteDealStage(u.ctx, added.stageId);
    const view = await getPipelineAdmin(u.ctx);
    expect(view.stages.some((s) => s.id === added.stageId)).toBe(false);
    expect(view.stages.find((s) => s.name === "Kontaktováno")!.usage).toBeGreaterThan(0);
  });

  it("důvody prohry: přidání, přejmenování, vypnutí (neaktivní se nenabízí, ale zůstává)", async () => {
    const u = await boss();
    const added = await addLostReason(u.ctx, { label: `Důvod ${tag()}` });
    expect(
      (await lostReasons(u.ctx, { includeInactive: false })).some((r) => r.value === added.value),
    ).toBe(true);
    await updateLostReason(u.ctx, { itemId: added.itemId, active: false });
    expect(
      (await lostReasons(u.ctx, { includeInactive: false })).some((r) => r.value === added.value),
    ).toBe(false);
    expect(
      (await lostReasons(u.ctx, { includeInactive: true })).some((r) => r.value === added.value),
    ).toBe(true);
    const id = await mkDeal(u);
    await expect(loseDeal(u.ctx, deps(), { dealId: id, reason: added.value })).rejects.toThrow(
      /důvod/,
    );
  });
});
