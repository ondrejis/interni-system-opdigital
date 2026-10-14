import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { and, eq, isNull, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensurePipeline, getPipeline } from "@rebar/core/config-data";
import {
  clearEntityPolicies,
  createEntityRegistry,
  registerEntityPolicies,
  setPhaseHooks,
  type EntityRegistry,
} from "@rebar/core/entities";
import type { CommandDef, ModuleDeps } from "@rebar/core/module-server";
import { ensureSeries } from "@rebar/core/numbering";
import { NotFoundError, PermissionError, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import type { ZodType } from "zod";
import { connectAppDb, connectMigratorDb, makeUser } from "@rebar/core/testing";
import { company } from "@rebar/kontakty/schema";
import { companyEntity, personEntity } from "@rebar/kontakty/server";
import { manifest } from "../index";
import {
  budgetItem,
  budgetObject,
  budgetSection,
  budgetVersion,
  job,
  jobChange,
  jobChangeLine,
} from "../schema";
import { jobEntity } from "../server";
import * as api from "./api";
import {
  budgetTree,
  calcList,
  calcReplace,
  copyOffer,
  itemBulk,
  itemDelete,
  itemDuplicate,
  itemMove,
  itemSave,
  objectDelete,
  objectSave,
  sectionDelete,
  sectionMove,
  sectionSave,
  versionCreate,
  versionLock,
  versionSetStatus,
} from "./commands";
import { phaseHooks } from "./index";

const app = connectAppDb();
const migrator = connectMigratorDb();
afterAll(async () => {
  await app.close();
  await migrator.close();
});

let registry: EntityRegistry;
const deps = () =>
  ({
    registry,
    baseURL: "http://localhost",
    settings: {
      get: async (_db: unknown, def: { key: string; default: unknown }) =>
        def.key === "company"
          ? {
              ...(def.default as object),
              name: "Test Stavby s.r.o.",
              ico: "12345678",
              dic: "CZ12345678",
              street: "Hlavní 1",
              city: "Plzeň",
              zip: "30100",
            }
          : def.default,
    },
  }) as unknown as ModuleDeps;
/** Zavolá příkaz tak, jak ho volá runCommand: vstup projde zod schématem (výchozí hodnoty, normalizace). */
const run = <S extends ZodType, R>(cmd: CommandDef<S, R>, ctx: Ctx, input: unknown) =>
  cmd.handler(ctx, cmd.input.parse(input) as never, deps());

beforeAll(async () => {
  clearEntityPolicies();
  registry = createEntityRegistry([companyEntity, personEntity, jobEntity]);
  registerEntityPolicies(registry);
  for (const p of manifest.seed.pipelines) await ensurePipeline(app.db, p);
  await ensureSeries(app.db, manifest.seed.series);
  setPhaseHooks(phaseHooks);
});

const boss = () =>
  makeUser(app.db, [
    ["zakazky.read", "all"],
    ["zakazky.write", "all"],
    ["zakazky.economics", "all"],
    ["zakazky.budget", "all"],
    ["kontakty.read", "all"],
  ]);

async function newJob(managerId?: string, phase = "preparation") {
  const [c] = await app.db
    .insert(company)
    .values({ name: `Firma ${randomBytes(3).toString("hex")}` })
    .returning();
  const stage = (await getPipeline(app.db, "job", "default"))!.stages[0]!;
  const [j] = await app.db
    .insert(job)
    .values({
      number: `T-${randomBytes(4).toString("hex")}`,
      title: "Koupelna",
      companyId: c!.id,
      stageId: stage.id,
      managerId: managerId ?? null,
      phase,
    })
    .returning();
  return j!;
}

/** Zakázka s rozpočtem: realizační verze, oddíl „Elektro“ (2 položky), pododdíl „Rozvaděč“ (1 položka). */
async function seeded(
  u: Awaited<ReturnType<typeof boss>>,
  kind: "offer" | "realization" = "realization",
) {
  const j = await newJob(u.id, kind === "offer" ? "offer" : "preparation");
  const v = await run(versionCreate, u.ctx, { jobId: j.id, kind });
  const s = await run(sectionSave, u.ctx, { versionId: v.id, title: "Elektro" });
  const sub = await run(sectionSave, u.ctx, { versionId: v.id, parentId: s.id, title: "Rozvaděč" });
  const a = await run(itemSave, u.ctx, {
    sectionId: s.id,
    title: "Kabel CYKY",
    kind: "material",
    unit: "m",
    quantity: "120,5",
    unitPriceMinor: 5_000,
    unitCostMinor: 3_000,
  });
  const b = await run(itemSave, u.ctx, {
    sectionId: s.id,
    title: "Montáž",
    kind: "labour",
    unit: "h",
    quantity: "10",
    unitPriceMinor: 80_000,
    unitCostMinor: 50_000,
    vatRateBp: 1200,
  });
  const c = await run(itemSave, u.ctx, {
    sectionId: sub.id,
    title: "Rozvaděč 24 modulů",
    vatRateBp: 2100,
    quantity: "1",
    unitPriceMinor: 1_000_000,
    unitCostMinor: 700_000,
  });
  return { j, v, s, sub, a, b, c };
}

describe("rozpočet: verze, oddíly, položky", () => {
  it("prázdná zakázka nemá verzi; verze má skrytý výchozí objekt", async () => {
    const u = await boss();
    const j = await newJob(u.id);
    const t = await run(budgetTree, u.ctx, { jobId: j.id });
    expect(t.version).toBeNull();
    expect(t.versions).toEqual([]);
    const v = await run(versionCreate, u.ctx, { jobId: j.id });
    expect(v).toMatchObject({ kind: "realization", number: 1 });
    const t2 = await run(budgetTree, u.ctx, { jobId: j.id });
    expect(t2.singleObject).toBe(true);
    expect(t2.objects).toHaveLength(1);
    expect(t2.objects[0]).toMatchObject({ isDefault: true, title: "Celá zakázka" });
    await expect(run(versionCreate, u.ctx, { jobId: j.id, kind: "realization" })).rejects.toThrow(
      /už má rozpočet realizace/,
    );
  });

  it("počítá součty po úrovních, marži a DPH po sazbách", async () => {
    const u = await boss();
    const { j, v } = await seeded(u);
    const t = await run(budgetTree, u.ctx, { jobId: j.id });
    expect(t.version!.id).toBe(v.id);
    const sec = t.objects[0]!.sections[0]!;
    expect(sec.title).toBe("Elektro");
    expect(sec.children).toHaveLength(1);
    // 120,5 m × 50 Kč = 6 025 Kč; 10 h × 800 = 8 000 Kč; rozvaděč 10 000 Kč
    expect(sec.own.sellMinor).toBe(602_500 + 800_000);
    expect(sec.totals.sellMinor).toBe(602_500 + 800_000 + 1_000_000);
    expect(t.totals.costMinor).toBe(361_500 + 500_000 + 700_000);
    expect(t.totals.marginMinor).toBe(t.totals.sellMinor - t.totals.costMinor);
    expect(t.vat.groups.map((g) => g.vatRateBp)).toEqual([2100, 1200]);
    expect(t.vat.groups[1]).toMatchObject({ netMinor: 800_000, vatMinor: 96_000 });
    const totals = await api.getBudgetTotals(u.ctx, j.id);
    expect(totals.sellMinor).toBe(t.totals.sellMinor);
    expect(Object.keys(totals.bySection)).toHaveLength(2);
    const sum = Object.values(totals.bySection).reduce((a, b) => a + b.sellMinor, 0);
    expect(sum).toBe(totals.sellMinor);
  });

  it("nová položka převezme sazbu DPH poslední položky; množství s čárkou i pozice", async () => {
    const u = await boss();
    const { s, a } = await seeded(u);
    expect(a.item.quantity).toBe("120.500");
    const x = await run(itemSave, u.ctx, { sectionId: s.id, title: "Další" });
    expect(x.item.vatRateBp).toBe(1200);
    expect(x.item.position).toBe(2);
  });

  it("odmítne špatné množství a příliš vysokou částku", async () => {
    const u = await boss();
    const { s, a } = await seeded(u);
    await expect(
      itemSave.input.parseAsync({ sectionId: s.id, title: "X", quantity: "abc" }),
    ).rejects.toThrow(/Množství/);
    await expect(
      run(itemSave, u.ctx, {
        id: a.id,
        quantity: "99999999999",
        unitPriceMinor: 9_000_000_000_000,
      }),
    ).rejects.toThrow(/příliš vysoká/);
  });

  it("přesun, duplikace, hromadná úprava a mazání", async () => {
    const u = await boss();
    const { j, s, sub, a, b, c } = await seeded(u);
    await run(itemMove, u.ctx, { id: b.id, index: 0 });
    let t = await run(budgetTree, u.ctx, { jobId: j.id });
    expect(t.objects[0]!.sections[0]!.items.map((i) => i.title)).toEqual(["Montáž", "Kabel CYKY"]);
    await run(itemMove, u.ctx, { id: a.id, sectionId: sub.id, index: 0 });
    t = await run(budgetTree, u.ctx, { jobId: j.id });
    expect(t.objects[0]!.sections[0]!.children[0]!.items.map((i) => i.title)).toEqual([
      "Kabel CYKY",
      "Rozvaděč 24 modulů",
    ]);
    const dup = await run(itemDuplicate, u.ctx, { id: c.id });
    expect(dup.item.title).toBe("Rozvaděč 24 modulů");
    await run(itemBulk, u.ctx, {
      ids: [a.id, b.id],
      patch: { priceAdjustPct: 10, vatRateBp: 2100 },
    });
    const [after] = await app.db.select().from(budgetItem).where(eq(budgetItem.id, b.id));
    expect(after).toMatchObject({ unitPriceMinor: 88_000, vatRateBp: 2100 });
    await run(itemBulk, u.ctx, { ids: [dup.id], patch: { sectionId: s.id, kind: "subcontract" } });
    const [moved] = await app.db.select().from(budgetItem).where(eq(budgetItem.id, dup.id));
    expect(moved).toMatchObject({ sectionId: s.id, kind: "subcontract" });
    await run(itemDelete, u.ctx, { ids: [dup.id] });
    await expect(run(itemDelete, u.ctx, { ids: [dup.id] })).rejects.toThrow(NotFoundError);
  });

  it("oddíly: přesun do pododdílu je hlídán, mazání neprázdného vyžaduje potvrzení", async () => {
    const u = await boss();
    const { j, v, s, sub } = await seeded(u);
    await expect(run(sectionMove, u.ctx, { id: s.id, parentId: sub.id })).rejects.toThrow(
      /do sebe sama/,
    );
    const other = await run(sectionSave, u.ctx, { versionId: v.id, title: "Zdi", code: "02" });
    await run(sectionMove, u.ctx, { id: other.id, parentId: s.id, index: 0 });
    let t = await run(budgetTree, u.ctx, { jobId: j.id });
    expect(t.objects[0]!.sections[0]!.children.map((x) => x.title)).toEqual(["Zdi", "Rozvaděč"]);
    await run(sectionMove, u.ctx, { id: other.id, parentId: null });
    t = await run(budgetTree, u.ctx, { jobId: j.id });
    expect(t.objects[0]!.sections.map((x) => x.title)).toEqual(["Elektro", "Zdi"]);
    await expect(run(sectionDelete, u.ctx, { id: s.id })).rejects.toThrow(/není prázdný/);
    const res = await run(sectionDelete, u.ctx, { id: s.id, cascade: true });
    expect(res.deletedItems).toBe(3);
    t = await run(budgetTree, u.ctx, { jobId: j.id });
    expect(t.totals.sellMinor).toBe(0);
  });

  it("stavební objekty: víc objektů, výchozí nejde smazat, neprázdný také ne", async () => {
    const u = await boss();
    const { v, j } = await seeded(u);
    const o = await run(objectSave, u.ctx, { versionId: v.id, code: "SO 02", title: "Garáž" });
    const sec = await run(sectionSave, u.ctx, { versionId: v.id, objectId: o.id, title: "Brána" });
    let t = await run(budgetTree, u.ctx, { jobId: j.id });
    expect(t.singleObject).toBe(false);
    expect(t.objects.map((x) => x.title)).toEqual(["Celá zakázka", "Garáž"]);
    await expect(run(objectDelete, u.ctx, { id: o.id })).rejects.toThrow(/obsahuje oddíly/);
    await run(sectionDelete, u.ctx, { id: sec.id });
    await run(objectDelete, u.ctx, { id: o.id });
    t = await run(budgetTree, u.ctx, { jobId: j.id });
    expect(t.singleObject).toBe(true);
    const def = t.objects[0]!;
    await expect(run(objectDelete, u.ctx, { id: def.id })).rejects.toThrow(/Výchozí objekt/);
  });
});

describe("zamčení, původní a aktuální hodnoty", () => {
  it("zamčení uloží původní hodnoty a verze se pak nemění (česká hláška)", async () => {
    const u = await boss();
    const { j, v, a } = await seeded(u, "offer");
    await run(versionLock, u.ctx, { versionId: v.id });
    const [it] = await app.db.select().from(budgetItem).where(eq(budgetItem.id, a.id));
    expect(it).toMatchObject({
      originalQuantity: "120.500",
      originalUnitPriceMinor: 5_000,
      originalUnitCostMinor: 3_000,
    });
    await expect(run(itemSave, u.ctx, { id: a.id, quantity: "1" })).rejects.toThrow(
      /Nabídka je zamčená/,
    );
    await expect(run(sectionSave, u.ctx, { versionId: v.id, title: "Nový" })).rejects.toThrow(
      UserError,
    );
    await expect(run(itemDelete, u.ctx, { ids: [a.id] })).rejects.toThrow(/zamčená/);
    // idempotentní
    await run(versionLock, u.ctx, { versionId: v.id });
    const t = await run(budgetTree, u.ctx, { jobId: j.id });
    expect(t.version!.lockReason).toMatch(/zamčená/);
  });

  it("odemknout smí jen ten, kdo schvaluje bez limitu", async () => {
    const u = await boss();
    const { v } = await seeded(u, "offer");
    await run(versionLock, u.ctx, { versionId: v.id });
    await expect(
      run(versionSetStatus, u.ctx, { versionId: v.id, status: "draft" }),
    ).rejects.toThrow(/schvaluje bez limitu/);
    const chief = await makeUser(app.db, [
      ["zakazky.read", "all"],
      ["zakazky.write", "all"],
      ["zakazky.budget", "all"],
      ["zakazky.approve_all", "all"],
    ]);
    await run(versionSetStatus, chief.ctx, { versionId: v.id, status: "draft" });
    const [row] = await app.db.select().from(budgetVersion).where(eq(budgetVersion.id, v.id));
    expect(row).toMatchObject({ status: "draft", lockedAt: null });
  });

  it("kopie nabídky do realizace uloží původní hodnoty a realizaci jde upravovat", async () => {
    const u = await boss();
    const { j, a } = await seeded(u, "offer");
    const r = await run(copyOffer, u.ctx, { jobId: j.id });
    expect(r.copied).toBe(3);
    const tree = await run(budgetTree, u.ctx, { jobId: j.id });
    expect(tree.version!.kind).toBe("realization");
    expect(tree.version!.sourceVersionId).not.toBeNull();
    const items = tree.objects[0]!.sections[0]!.items;
    const copy = items.find((i) => i.title === a.item.title)!;
    expect(copy.id).not.toBe(a.id);
    expect(copy.originalQuantity).toBe("120.500");
    await run(itemSave, u.ctx, { id: copy.id, quantity: "200" });
    const after = await run(budgetTree, u.ctx, { jobId: j.id });
    const changed = after.objects[0]!.sections[0]!.items.find((i) => i.id === copy.id)!;
    expect(changed.changed).toBe(true);
    expect(changed.amounts.originalSellMinor).toBe(602_500);
    expect(changed.amounts.sellMinor).toBe(1_000_000);
    await expect(run(copyOffer, u.ctx, { jobId: j.id })).rejects.toThrow(
      /už má rozpočet realizace/,
    );
    // položka přidaná do realizace s uloženými původními hodnotami je „nad rámec“ (původně 0)
    const sec = after.objects[0]!.sections[0]!;
    const added = await run(itemSave, u.ctx, {
      sectionId: sec.id,
      title: "Navíc",
      unitPriceMinor: 100,
    });
    expect(added.item.originalQuantity).toBe("0.000");
    // totals: původní součet nabídky zůstal, aktuální vyrostl
    const totals = await api.getBudgetTotals(u.ctx, j.id);
    expect(totals.originalSellMinor).toBe(602_500 + 800_000 + 1_000_000);
    expect(totals.sellMinor).toBe(1_000_000 + 800_000 + 1_000_000 + 100);
  });
});

describe("propsání změn (ZBV)", () => {
  async function change(
    jobId: string,
    lines: Omit<typeof jobChangeLine.$inferInsert, "changeId">[],
  ) {
    const [ch] = await app.db
      .insert(jobChange)
      .values({
        jobId,
        number: Math.floor(Math.random() * 1e6),
        title: "ZBV",
        amountMinor: 0,
        status: "approved",
      })
      .returning();
    for (const l of lines) await app.db.insert(jobChangeLine).values({ ...l, changeId: ch!.id });
    return ch!;
  }

  it("add vytvoří položku, qty změní množství, remove vynuluje; původní hodnoty zůstanou, je idempotentní", async () => {
    const u = await boss();
    const { j, v, s, a, b } = await seeded(u, "offer");
    await run(copyOffer, u.ctx, { jobId: j.id });
    await run(versionLock, u.ctx, {
      versionId: (await api.getBudgetTree(u.ctx, j.id)).version!.id,
    });
    const tree = await api.getBudgetTree(u.ctx, j.id);
    expect(tree.version!.kind).toBe("realization");
    const rItems = tree.objects[0]!.sections[0]!.items;
    const ra = rItems.find((i) => i.title === a.item.title)!;
    const rb = rItems.find((i) => i.title === b.item.title)!;
    const ch = await change(j.id, [
      {
        kind: "add",
        title: "Zásuvky navíc",
        unit: "ks",
        itemKind: "material",
        quantityAfter: "4",
        unitCostMinor: 10_000,
        unitPriceMinor: 15_000,
        vatRateBp: 2100,
        sectionId: s.id,
        position: 0,
        quantityBefore: "0",
        priceImpactMinor: 0,
        costImpactMinor: 0,
      },
      {
        kind: "qty",
        itemId: ra.id,
        title: ra.title,
        unit: "m",
        quantityBefore: "120.5",
        quantityAfter: "150",
        position: 1,
        unitCostMinor: 0,
        unitPriceMinor: 0,
        priceImpactMinor: 0,
        costImpactMinor: 0,
      },
      {
        kind: "remove",
        itemId: rb.id,
        title: rb.title,
        unit: "h",
        quantityBefore: "10",
        quantityAfter: "0",
        position: 2,
        unitCostMinor: 0,
        unitPriceMinor: 0,
        priceImpactMinor: 0,
        costImpactMinor: 0,
      },
    ]);
    const res = await api.applyChangeLines(u.ctx, ch.id);
    expect(res).toMatchObject({ applied: true, created: 1, changed: 1, removed: 1 });
    const after = await api.getBudgetTree(u.ctx, j.id);
    expect(after.version!.status).toBe("locked"); // zamčená realizace se mění jen touto cestou
    const secs = after.objects[0]!.sections;
    // oddíl z nabídky (id jiné verze) neplatí, položka jde do oddílu „Změny“
    const zmeny = secs.find((x) => x.title === "Změny")!;
    expect(zmeny.items[0]).toMatchObject({
      title: "Zásuvky navíc",
      quantity: "4.000",
      originalQuantity: "0.000",
      changeId: ch.id,
    });
    const nra = secs[0]!.items.find((i) => i.id === ra.id)!;
    expect(nra).toMatchObject({ quantity: "150.000", originalQuantity: "120.500" });
    const nrb = secs[0]!.items.find((i) => i.id === rb.id)!;
    expect(nrb.quantity).toBe("0.000");
    expect(nrb.amounts.originalSellMinor).toBe(800_000);
    const again = await api.applyChangeLines(u.ctx, ch.id);
    expect(again.applied).toBe(false);
    expect((await api.getBudgetTotals(u.ctx, j.id)).sellMinor).toBe(
      150 * 5_000 + 0 + 1_000_000 + 4 * 15_000,
    );
    // vrácení (reopen)
    await api.revertChangeLines(u.ctx, ch.id);
    const reverted = await api.getBudgetTree(u.ctx, j.id);
    expect(reverted.objects[0]!.sections.find((x) => x.title === "Změny")!.items).toHaveLength(0);
    expect(reverted.objects[0]!.sections[0]!.items.find((i) => i.id === ra.id)!.quantity).toBe(
      "120.500",
    );
    expect((await api.applyChangeLines(u.ctx, ch.id)).applied).toBe(true);
    void v;
  });
});

describe("výkaz výměr", () => {
  it("množství je součet výsledků vzorců s proměnnými; ruční změna množství se odmítne", async () => {
    const u = await boss();
    const { j, a } = await seeded(u);
    const r = await run(calcReplace, u.ctx, {
      itemId: a.id,
      lines: [
        { variable: "dl", description: "Délka", formula: "4,5" },
        { variable: "sir", formula: "3" },
        { description: "Obvod", formula: "(dl+sir)*2" },
        { description: "Odpočet", formula: "-1" },
      ],
    });
    expect(r.quantity).toBe("21.500");
    expect(r.lines.map((l) => l.result)).toEqual(["4.500", "3.000", "15.000", "-1.000"]);
    expect((await run(calcList, u.ctx, { itemId: a.id })).lines).toHaveLength(4);
    const tree = await run(budgetTree, u.ctx, { jobId: j.id });
    expect(tree.objects[0]!.sections[0]!.items[0]).toMatchObject({
      quantity: "21.500",
      calcCount: 4,
    });
    await expect(run(itemSave, u.ctx, { id: a.id, quantity: "5" })).rejects.toThrow(/výkazu výměr/);
    // chybný vzorec neuloží nic
    await expect(
      run(calcReplace, u.ctx, { itemId: a.id, lines: [{ formula: "1/0" }] }),
    ).rejects.toThrow(/Řádek 1 výkazu výměr: Dělení nulou/);
    expect((await run(calcList, u.ctx, { itemId: a.id })).quantity).toBe("21.500");
    // smazání všech řádků vrátí ruční zadání
    await run(calcReplace, u.ctx, { itemId: a.id, lines: [] });
    const manual = await run(itemSave, u.ctx, { id: a.id, quantity: "7" });
    expect(manual.item.quantity).toBe("7.000");
  });
});

describe("oprávnění", () => {
  it("bez zakazky.economics se rozpočet nevrátí, bez zakazky.budget se nezapíše", async () => {
    const owner = await boss();
    const { j, v, s } = await seeded(owner);
    const foreman = await makeUser(app.db, [
      ["zakazky.read", "all"],
      ["zakazky.write", "all"],
    ]);
    await expect(run(budgetTree, foreman.ctx, { jobId: j.id })).rejects.toThrow(PermissionError);
    await expect(
      run(calcList, foreman.ctx, {
        itemId: (await run(itemSave, owner.ctx, { sectionId: s.id, title: "Y" })).id,
      }),
    ).rejects.toThrow(PermissionError);
    await expect(run(itemSave, foreman.ctx, { sectionId: s.id, title: "Z" })).rejects.toThrow(
      PermissionError,
    );
    const reader = await makeUser(app.db, [
      ["zakazky.read", "all"],
      ["zakazky.write", "all"],
      ["zakazky.economics", "all"],
    ]);
    expect((await run(budgetTree, reader.ctx, { jobId: j.id })).totals.sellMinor).toBeGreaterThan(
      0,
    );
    await expect(run(sectionSave, reader.ctx, { versionId: v.id, title: "Q" })).rejects.toThrow(
      PermissionError,
    );
  });

  it("cizí zakázka (rozsah own) se nevrátí", async () => {
    const owner = await boss();
    const { j } = await seeded(owner);
    const mine = await makeUser(app.db, [
      ["zakazky.read", "own"],
      ["zakazky.write", "own"],
      ["zakazky.economics", "all"],
      ["zakazky.budget", "all"],
    ]);
    await expect(run(budgetTree, mine.ctx, { jobId: j.id })).rejects.toThrow(NotFoundError);
  });
});

describe("souběh", () => {
  it("souběžné item.save do téhož oddílu dá jedinečné pozice", async () => {
    const u = await boss();
    const { s } = await seeded(u);
    await Promise.all(
      Array.from({ length: 12 }, (_, n) =>
        run(itemSave, u.ctx, { sectionId: s.id, title: `Paralelní ${n}`, unitPriceMinor: 100 }),
      ),
    );
    const rows = await app.db
      .select({ p: budgetItem.position })
      .from(budgetItem)
      .where(and(eq(budgetItem.sectionId, s.id), isNull(budgetItem.deletedAt)));
    expect(rows).toHaveLength(14);
    expect(new Set(rows.map((r) => r.p)).size).toBe(14);
  });

  it("zamčení a úprava souběžně: úprava buď proběhne před zámkem (a je v originálech), nebo selže", async () => {
    const u = await boss();
    const { s, a } = await seeded(u, "offer");
    const [lock, edit] = await Promise.allSettled([
      run(versionLock, u.ctx, {
        versionId: (await app.db.select().from(budgetSection).where(eq(budgetSection.id, s.id)))[0]!
          .versionId,
      }),
      run(itemSave, u.ctx, { id: a.id, quantity: "999" }),
    ]);
    expect(lock.status).toBe("fulfilled");
    const [it] = await app.db.select().from(budgetItem).where(eq(budgetItem.id, a.id));
    if (edit.status === "fulfilled") expect(it!.originalQuantity).toBe("999.000");
    else expect(it!.originalQuantity).toBe("120.500");
  });
});

describe("hooky přechodů", () => {
  const hook = (id: string) => phaseHooks.find((h) => h.id === id)!;
  const transition = { from: "offer", to: "preparation" };

  it("vstup do nabídky založí nabídkovou verzi s výchozím objektem (jen jednou)", async () => {
    const u = await boss();
    const j = await newJob(u.id, "offer");
    const row = { ...j } as unknown as Record<string, unknown>;
    await hook("budget.offer-entry").after!(u.ctx, row, { from: "inquiry", to: "offer" });
    await hook("budget.offer-entry").after!(u.ctx, row, { from: "", to: "offer" });
    const t = await run(budgetTree, u.ctx, { jobId: j.id });
    expect(t.versions).toHaveLength(1);
    expect(t.version).toMatchObject({ kind: "offer", number: 1, status: "draft" });
    expect(t.objects[0]!.isDefault).toBe(true);
  });

  it("vyhráno: kontrola odeslané nabídky, pak zamčení, kopie, hodnota zakázky a datum výhry", async () => {
    const u = await boss();
    const { j, v } = await seeded(u, "offer");
    const row = { ...j } as unknown as Record<string, unknown>;
    const h = hook("budget.won");
    expect(await h.check!(u.ctx, row, transition)).toMatch(/nebyla odeslána/);
    await run(versionSetStatus, u.ctx, { versionId: v.id, status: "sent" });
    expect(await h.check!(u.ctx, row, transition)).toBeNull();
    await h.after!(u.ctx, row, transition);
    const [offer] = await app.db.select().from(budgetVersion).where(eq(budgetVersion.id, v.id));
    expect(offer!.status).toBe("locked");
    const t = await run(budgetTree, u.ctx, { jobId: j.id });
    expect(t.versions.map((x) => x.kind).sort()).toEqual(["offer", "realization"]);
    expect(t.version!.kind).toBe("realization");
    expect(t.totals.sellMinor).toBe(602_500 + 800_000 + 1_000_000);
    const [after] = await app.db.select().from(job).where(eq(job.id, j.id));
    expect(after!.valueMinor).toBe(2_402_500);
    expect(after!.wonAt).not.toBeNull();
  });

  it("prázdná nabídka přechod neblokuje; realizace vznikne prázdná, hodnota zakázky zůstane", async () => {
    const u = await boss();
    const j = await newJob(u.id, "offer");
    await app.db.update(job).set({ valueMinor: 555_000 }).where(eq(job.id, j.id));
    const row = { ...j } as unknown as Record<string, unknown>;
    await hook("budget.offer-entry").after!(u.ctx, row, { from: "", to: "offer" });
    expect(await hook("budget.won").check!(u.ctx, row, transition)).toBeNull();
    await hook("budget.won").after!(u.ctx, row, transition);
    const [after] = await app.db.select().from(job).where(eq(job.id, j.id));
    expect(after!.valueMinor).toBe(555_000);
    expect((await run(budgetTree, u.ctx, { jobId: j.id })).version!.kind).toBe("realization");
  });

  it("zakázka založená přímo v přípravě dostane prázdnou realizační verzi", async () => {
    const u = await boss();
    const j = await newJob(u.id, "preparation");
    const row = { ...j } as unknown as Record<string, unknown>;
    await hook("budget.realization-entry").after!(u.ctx, row, { from: "", to: "preparation" });
    await hook("budget.realization-entry").after!(u.ctx, row, {
      from: "paused",
      to: "preparation",
    });
    const t = await run(budgetTree, u.ctx, { jobId: j.id });
    expect(t.versions).toHaveLength(1);
    expect(t.version!.kind).toBe("realization");
  });
});

describe("migrace starého odhadu", () => {
  it("řádky odhadu se přesunou do realizační verze č. 1 s oddíly podle kategorie", async () => {
    const u = await boss();
    const j = await newJob(u.id);
    const withBudget = await newJob(u.id);
    await run(versionCreate, u.ctx, { jobId: withBudget.id });
    // dřívější tabulka odhadu už v migrovaném schématu není; pro test ji dočasně vytvoříme ve starém tvaru
    await migrator.db.execute(sql`
      CREATE TABLE IF NOT EXISTS job_estimate_line (
        id uuid PRIMARY KEY, job_id uuid NOT NULL, position integer NOT NULL DEFAULT 0, category text NOT NULL,
        description text NOT NULL, quantity numeric(14,3) NOT NULL DEFAULT 1, unit text NOT NULL DEFAULT 'ks',
        unit_price_minor bigint NOT NULL DEFAULT 0, unit_cost_minor bigint NOT NULL DEFAULT 0,
        vat_rate numeric(5,2) NOT NULL DEFAULT 21, created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(), created_by uuid, updated_by uuid, deleted_at timestamptz)`);
    const mk = (
      jobId: string,
      category: string,
      description: string,
      position: number,
      over: { unit?: string; vat?: string; deleted?: boolean } = {},
    ) =>
      sql`INSERT INTO job_estimate_line (id, job_id, position, category, description, quantity, unit, unit_price_minor, unit_cost_minor, vat_rate, deleted_at)
          VALUES (gen_random_uuid(), ${jobId}, ${position}, ${category}, ${description}, 2.5, ${over.unit ?? "m2"}, 12345, 8000, ${over.vat ?? "12.00"}, ${over.deleted ? new Date().toISOString() : null}::timestamptz)`;
    for (const q of [
      mk(j.id, "material", "Obklady", 0),
      mk(j.id, "labour", "Montáž", 1, { unit: "h", vat: "21.00" }),
      mk(j.id, "material", "Lepidlo", 2),
      mk(j.id, "neco_divneho", "Divné", 3),
      mk(withBudget.id, "other", "Přeskočit", 0),
      mk(j.id, "other", "Smazaná", 4, { deleted: true }),
    ])
      await migrator.db.execute(q);

    const sqlFile = readFileSync(
      path.resolve(import.meta.dirname, "../../drizzle/0007_rozpocet_z_odhadu.sql"),
      "utf8",
    );
    await migrator.db.transaction(async (tx) => {
      for (const stmt of sqlFile.split("--> statement-breakpoint")) await tx.execute(stmt as never);
    });
    await migrator.db.execute(sql`DROP TABLE job_estimate_line`);

    const t = await run(budgetTree, u.ctx, { jobId: j.id });
    expect(t.version).toMatchObject({ kind: "realization", number: 1, status: "draft" });
    expect(t.singleObject).toBe(true);
    const secs = t.objects[0]!.sections;
    expect(secs.map((s) => s.title)).toEqual(["Práce", "Materiál", "Ostatní"]);
    expect(secs.map((s) => s.costCategory)).toEqual(["labour", "material", "other"]);
    expect(secs[1]!.items.map((i) => i.title)).toEqual(["Obklady", "Lepidlo"]);
    expect(secs[1]!.items[0]).toMatchObject({
      kind: "material",
      unit: "m2",
      quantity: "2.500",
      unitPriceMinor: 12_345,
      unitCostMinor: 8_000,
      vatRateBp: 1200,
    });
    expect(secs[0]!.items[0]!.vatRateBp).toBe(2100);
    expect(secs[2]!.items.map((i) => i.title)).toEqual(["Divné"]);
    expect(t.totals.sellMinor).toBe(4 * Math.round(2.5 * 12_345));
    // zakázka, která už rozpočet měla, se nezměnila
    const t2 = await run(budgetTree, u.ctx, { jobId: withBudget.id });
    expect(t2.totals.sellMinor).toBe(0);
    const objs = await app.db
      .select()
      .from(budgetObject)
      .where(eq(budgetObject.versionId, t.version!.id));
    expect(objs).toHaveLength(1);
  });
});

describe("název a poznámka nabídky", () => {
  it("jde změnit v rozpracované verzi, v zamčené ne", async () => {
    const u = await boss();
    const { j, v } = await seeded(u, "offer");
    await run(versionSetStatus, u.ctx, { versionId: v.id, title: "Rev. A", note: "Platí 30 dní." });
    const t = await run(budgetTree, u.ctx, { jobId: j.id });
    expect(t.version).toMatchObject({ title: "Rev. A", note: "Platí 30 dní.", status: "draft" });
    await run(versionLock, u.ctx, { versionId: v.id });
    await expect(run(versionSetStatus, u.ctx, { versionId: v.id, note: "x" })).rejects.toThrow(
      /zamčená/,
    );
  });
});

describe("PDF nabídky", () => {
  it("vykreslí PDF z nabídky; bez položek, bez ekonomiky a bez nabídky selže česky", async () => {
    const u = await boss();
    const { j } = await seeded(u, "offer");
    const out = await api.renderOfferPdf(u.ctx, deps(), j.id);
    expect(out.filename).toMatch(/^Nabidka_.*\.pdf$/);
    expect(out.buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(out.buffer.length).toBeGreaterThan(2_000);

    const foreman = await makeUser(app.db, [
      ["zakazky.read", "all"],
      ["zakazky.write", "all"],
    ]);
    await expect(api.renderOfferPdf(foreman.ctx, deps(), j.id)).rejects.toThrow(PermissionError);

    const empty = await newJob(u.id, "offer");
    await expect(api.renderOfferPdf(u.ctx, deps(), empty.id)).rejects.toThrow(
      /nemá žádnou nabídku/,
    );
    await run(versionCreate, u.ctx, { jobId: empty.id, kind: "offer" });
    await expect(api.renderOfferPdf(u.ctx, deps(), empty.id)).rejects.toThrow(/nemá žádné položky/);
    const cizi = await makeUser(app.db, [
      ["zakazky.read", "own"],
      ["zakazky.economics", "all"],
    ]);
    await expect(api.renderOfferPdf(cizi.ctx, deps(), j.id)).rejects.toThrow(NotFoundError);
  });
});
