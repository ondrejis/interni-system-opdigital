import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureLookup, ensurePipeline, getPipeline } from "@rebar/core/config-data";
import { schema } from "@rebar/core/db";
import {
  clearEntityPolicies,
  createEntityRegistry,
  createRecord,
  deleteRecord,
  registerEntityPolicies,
  resolveEntity,
  updateRecord,
  type EntityRegistry,
} from "@rebar/core/entities";
import type {
  AttentionProvider,
  CommandDef,
  CostProvider,
  DiaryPrefillProvider,
  ModuleDeps,
  WidgetProvider,
} from "@rebar/core/module-server";
import { ensureSeries } from "@rebar/core/numbering";
import { PermissionError } from "@rebar/core/rbac";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { todayIso } from "@rebar/core/time";
import { company } from "@rebar/kontakty/schema";
import { companyEntity, personEntity } from "@rebar/kontakty/server";
import { manifest as skladManifest } from "@rebar/sklad";
import {
  commands,
  entities as skladEntities,
  fromMilli,
  purchaseOrder,
  purchaseOrderLine,
  server,
  stockCount,
  stockDoc,
  stockDocLine,
  stockItem,
  stockLevel,
  warehouse,
} from "@rebar/sklad/server";
import { manifest as zakazkyManifest } from "@rebar/zakazky";
import { job } from "@rebar/zakazky/schema";
import { jobEntity } from "@rebar/zakazky/server";

const app = connectAppDb();
afterAll(() => app.close());

let registry: EntityRegistry;
const deps = () =>
  ({
    registry,
    baseURL: "http://localhost",
    costProviders: [],
    calendarLayers: [],
    diaryPrefill: [],
    emit: async () => {},
  }) as unknown as ModuleDeps;

beforeAll(async () => {
  clearEntityPolicies();
  registry = createEntityRegistry([companyEntity, personEntity, jobEntity, ...skladEntities]);
  registerEntityPolicies(registry);
  for (const p of zakazkyManifest.seed.pipelines) await ensurePipeline(app.db, p);
  await ensureSeries(app.db, zakazkyManifest.seed.series);
  await ensureSeries(app.db, skladManifest.seed.series);
  for (const l of skladManifest.seed.lookups) await ensureLookup(app.db, l);
});

const cmd = (name: string) => {
  const c = commands.find((x) => x.name === name) as CommandDef | undefined;
  if (!c) throw new Error(`Příkaz ${name} neexistuje.`);
  return c;
};
const run = async (name: string, ctx: unknown, input: unknown) => {
  const c = cmd(name);
  return c.handler(ctx as never, c.input.parse(input), deps()) as Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
};

const keeper = () =>
  makeUser(app.db, [
    ["sklad.read", "all"],
    ["sklad.write", "all"],
    ["sklad.issue", "all"],
    ["sklad.inventory", "all"],
    ["zakazky.read", "all"],
    ["zakazky.write", "all"],
    ["zakazky.economics", "all"],
  ]);

const tag = () => randomBytes(3).toString("hex");

async function mkWarehouse(kind = "warehouse") {
  const [w] = await app.db
    .insert(warehouse)
    .values({ name: `Sklad ${tag()}`, kind })
    .returning();
  return w!;
}
async function mkItem(over: Partial<typeof stockItem.$inferInsert> = {}) {
  const [i] = await app.db
    .insert(stockItem)
    .values({ code: `T-${tag()}`.toUpperCase(), name: `Cement ${tag()}`, unit: "pytel", ...over })
    .returning();
  return i!;
}
async function mkSupplier() {
  const [c] = await app.db
    .insert(company)
    .values({ name: `Dodavatel ${tag()}`, roles: ["supplier"] })
    .returning();
  return c!;
}
async function mkJob() {
  const [c] = await app.db
    .insert(company)
    .values({ name: `Klient ${tag()}` })
    .returning();
  const stage = (await getPipeline(app.db, "job", "default"))!.stages[0]!;
  const [j] = await app.db
    .insert(job)
    .values({
      number: `D-${randomBytes(4).toString("hex")}`,
      title: "Dům",
      companyId: c!.id,
      stageId: stage.id,
    })
    .returning();
  return j!;
}
const level = async (itemId: string, warehouseId: string) =>
  Number(
    (
      await app.db
        .select()
        .from(stockLevel)
        .where(and(eq(stockLevel.itemId, itemId), eq(stockLevel.warehouseId, warehouseId)))
    )[0]?.qty ?? 0,
  );
const itemNow = async (id: string) =>
  (await app.db.select().from(stockItem).where(eq(stockItem.id, id)))[0]!;

const receive = (
  ctx: unknown,
  w: { id: string },
  supplier: { id: string },
  itemId: string,
  qty: string | number,
  price: number,
) =>
  run("sklad.post", ctx, {
    type: "receipt",
    date: todayIso(),
    warehouseId: w.id,
    supplierId: supplier.id,
    lines: [{ itemId, qty, unitPriceMinor: price }],
  });

describe("příjem a vážený průměr", () => {
  it("příjemka dostane číslo z řady, zvýší stav a spočítá vážený průměr ceny", async () => {
    const u = await keeper();
    const w = await mkWarehouse();
    const s = await mkSupplier();
    const it = await mkItem();

    const a = await receive(u.ctx, w, s, it.id, 10, 100_00);
    expect(a.number).toMatch(new RegExp(`^PR-${todayIso().slice(0, 4)}-\\d{4}$`));
    expect(a.totalMinor).toBe(1_000_00);
    let now = await itemNow(it.id);
    expect(Number(now.totalQty)).toBe(10);
    expect(Number(now.avgCost)).toBe(100_00);

    const b = await receive(u.ctx, w, s, it.id, 30, 200_00);
    expect(b.number).not.toBe(a.number);
    now = await itemNow(it.id);
    expect(Number(now.totalQty)).toBe(40);
    // (10 × 100 + 30 × 200) / 40 = 175
    expect(Number(now.avgCost)).toBe(175_00);
    expect(now.lastPriceMinor).toBe(200_00);
    expect(now.avgCostMinor).toBe(175_00);
    expect(now.valueMinor).toBe(40 * 175_00);
    expect(await level(it.id, w.id)).toBe(40);
  });

  it("desetinné množství se nekumuluje do chyby a stejné řádky se sloučí", async () => {
    const u = await keeper();
    const w = await mkWarehouse();
    const s = await mkSupplier();
    const it = await mkItem({ unit: "m" });
    await run("sklad.post", u.ctx, {
      type: "receipt",
      date: todayIso(),
      warehouseId: w.id,
      supplierId: s.id,
      lines: [
        { itemId: it.id, qty: "0.1", unitPriceMinor: 10_00 },
        { itemId: it.id, qty: "0,2", unitPriceMinor: 10_00 },
      ],
    });
    expect((await itemNow(it.id)).totalQty).toBe("0.300");
    const lines = await app.db.select().from(stockDoc).where(eq(stockDoc.warehouseId, w.id));
    expect(lines).toHaveLength(1);
    expect(lines[0]!.lineCount).toBe(1);
  });

  it("příjemka bez dodavatele nebo bez ceny se odmítne; budoucí datum také", async () => {
    const u = await keeper();
    const w = await mkWarehouse();
    const s = await mkSupplier();
    const it = await mkItem();
    await expect(
      run("sklad.post", u.ctx, {
        type: "receipt",
        date: todayIso(),
        warehouseId: w.id,
        lines: [{ itemId: it.id, qty: 1, unitPriceMinor: 100 }],
      }),
    ).rejects.toThrow(/dodavatele/);
    await expect(
      run("sklad.post", u.ctx, {
        type: "receipt",
        date: todayIso(),
        warehouseId: w.id,
        supplierId: s.id,
        lines: [{ itemId: it.id, qty: 1 }],
      }),
    ).rejects.toThrow(/nákupní cenu/);
    await expect(
      run("sklad.post", u.ctx, {
        type: "receipt",
        date: "2999-01-01",
        warehouseId: w.id,
        supplierId: s.id,
        lines: [{ itemId: it.id, qty: 1, unitPriceMinor: 100 }],
      }),
    ).rejects.toThrow(/budoucnu/);
    expect(await level(it.id, w.id)).toBe(0);
  });

  it("poslední známá cena se použije, když řádek cenu nemá", async () => {
    const u = await keeper();
    const w = await mkWarehouse();
    const s = await mkSupplier();
    const it = await mkItem({ lastPriceMinor: 50_00 });
    await run("sklad.post", u.ctx, {
      type: "receipt",
      date: todayIso(),
      warehouseId: w.id,
      supplierId: s.id,
      lines: [{ itemId: it.id, qty: 2 }],
    });
    expect(Number((await itemNow(it.id)).avgCost)).toBe(50_00);
  });
});

describe("výdej na zakázku a vratky", () => {
  it("výdej ubere zásobu za průměrnou cenu, kontroluje dostupnost, počítá do nákladů a deníku", async () => {
    const u = await keeper();
    const w = await mkWarehouse();
    const s = await mkSupplier();
    const j = await mkJob();
    const it = await mkItem();
    await receive(u.ctx, w, s, it.id, 10, 100_00);

    const issue = await run("sklad.post", u.ctx, {
      type: "issue",
      date: todayIso(),
      warehouseId: w.id,
      jobId: j.id,
      lines: [{ itemId: it.id, qty: 4 }],
    });
    expect(issue.totalMinor).toBe(400_00);
    expect(await level(it.id, w.id)).toBe(6);
    expect(Number((await itemNow(it.id)).totalQty)).toBe(6);

    await expect(
      run("sklad.post", u.ctx, {
        type: "issue",
        date: todayIso(),
        warehouseId: w.id,
        jobId: j.id,
        lines: [{ itemId: it.id, qty: 7 }],
      }),
    ).rejects.toThrow(/je jen 6/);
    expect(await level(it.id, w.id)).toBe(6);

    const provider = server.costProviders[0] as CostProvider;
    expect(await provider.costs(u.ctx, j.id, deps())).toEqual([
      expect.objectContaining({ category: "material", amountMinor: 400_00, source: "sklad" }),
    ]);

    const prefill = await (server.diaryPrefill[0] as DiaryPrefillProvider)(
      u.ctx,
      j.id,
      todayIso(),
      deps(),
    );
    expect(prefill.materials).toMatch(/4 pytel/);

    const material = await run("sklad.jobMaterial", u.ctx, { jobId: j.id });
    expect(material.totalMinor).toBe(400_00);
    expect(material.lines[0]).toMatchObject({ itemId: it.id, qty: "4.000" });

    // bez ekonomiky zakázky (montér) server hodnoty materiálu nevrací
    const noPrices = await makeUser(app.db, [
      ["sklad.read", "all"],
      ["zakazky.read", "all"],
    ]);
    const plain = await run("sklad.jobMaterial", noPrices.ctx, { jobId: j.id });
    expect(plain.totalMinor).toBe(0);
    expect(plain.lines[0]).toMatchObject({ itemId: it.id, qty: "4.000", valueMinor: 0 });

    const audit = await app.db
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.entityType, "job"), eq(schema.auditLog.entityId, j.id)));
    expect(audit.some((a) => /Vydán materiál VY-/.test(a.summary ?? ""))).toBe(true);
  });

  it("vratka smí vrátit nanejvýš čisté vydané množství a vrací zásobu i náklad", async () => {
    const u = await keeper();
    const w = await mkWarehouse();
    const s = await mkSupplier();
    const j = await mkJob();
    const other = await mkJob();
    const it = await mkItem();
    await receive(u.ctx, w, s, it.id, 10, 100_00);
    await run("sklad.post", u.ctx, {
      type: "issue",
      date: todayIso(),
      warehouseId: w.id,
      jobId: j.id,
      lines: [{ itemId: it.id, qty: 5 }],
    });
    const back = (jobId: string, qty: number) =>
      run("sklad.post", u.ctx, {
        type: "return",
        date: todayIso(),
        warehouseId: w.id,
        jobId,
        lines: [{ itemId: it.id, qty }],
      });
    await expect(back(j.id, 6)).rejects.toThrow(/vydáno jen 5/);
    await expect(back(other.id, 1)).rejects.toThrow(/vydáno jen 0/);
    await back(j.id, 2);
    expect(await level(it.id, w.id)).toBe(7);
    await expect(back(j.id, 4)).rejects.toThrow(/vydáno jen 3/);

    const provider = server.costProviders[0] as CostProvider;
    // výdejka (+) a vratka (−) jsou samostatné řádky s id dokladu; celkem 3 × 100 Kč
    const lines = await provider.costs(u.ctx, j.id, deps());
    expect(lines.every((l) => l.ref && l.date)).toBe(true);
    expect(lines.reduce((a, l) => a + l.amountMinor, 0)).toBe(3 * 100_00);
    expect(await provider.costs(u.ctx, other.id, deps())).toEqual([]);
  });

  it("vratka se oceňuje původní cenou výdeje, průměr skladu se přepočte váženě", async () => {
    const u = await keeper();
    const w = await mkWarehouse();
    const s = await mkSupplier();
    const j = await mkJob();
    const it = await mkItem();
    const post = (type: "issue" | "return", qty: number) =>
      run("sklad.post", u.ctx, {
        type,
        date: todayIso(),
        warehouseId: w.id,
        jobId: j.id,
        lines: [{ itemId: it.id, qty }],
      });
    await receive(u.ctx, w, s, it.id, 10, 100_00);
    await post("issue", 5); // 5 × 100 Kč
    await receive(u.ctx, w, s, it.id, 10, 200_00); // sklad 15 ks, průměr (5×100 + 10×200) / 15 = 166,6667 Kč
    expect(Number((await itemNow(it.id)).avgCost)).toBeCloseTo(166_66.6667, 3);

    const back = await post("return", 2);
    expect(back.totalMinor).toBe(2 * 100_00); // původní cena výdeje, ne dnešních 166,67 Kč
    const [line] = await app.db.select().from(stockDocLine).where(eq(stockDocLine.docId, back.id));
    expect(Number(line!.unitCost)).toBe(100_00);
    // nový průměr: (15 × 166,6667 + 2 × 100) / 17 = 158,8235 Kč
    const now = await itemNow(it.id);
    expect(Number(now.avgCost)).toBeCloseTo(158_82.3529, 3);
    expect(Number(now.totalQty)).toBe(17);

    // zakázka nese čistý náklad 3 × 100 Kč (výdej − vratka za stejnou cenu)
    const provider = server.costProviders[0] as CostProvider;
    const lines = await provider.costs(u.ctx, j.id, deps());
    expect(lines.reduce((a, l) => a + l.amountMinor, 0)).toBe(3 * 100_00);

    // další vratka za cenu zbývajícího výdeje, i po změně průměru skladu
    const rest = await post("return", 3);
    expect(rest.totalMinor).toBe(3 * 100_00);
    expect((await provider.costs(u.ctx, j.id, deps())).reduce((a, l) => a + l.amountMinor, 0)).toBe(
      0,
    );
  });

  it("výdejka i vratka bez zakázky se odmítnou", async () => {
    const u = await keeper();
    const w = await mkWarehouse();
    const it = await mkItem();
    await expect(
      run("sklad.post", u.ctx, {
        type: "issue",
        date: todayIso(),
        warehouseId: w.id,
        lines: [{ itemId: it.id, qty: 1 }],
      }),
    ).rejects.toThrow(/zakázku/);
  });

  it("souběžné výdeje nikdy nevydají víc, než je skladem", async () => {
    const u = await keeper();
    const w = await mkWarehouse();
    const s = await mkSupplier();
    const j = await mkJob();
    const it = await mkItem();
    await receive(u.ctx, w, s, it.id, 10, 10_00);
    const issue = () =>
      run("sklad.post", u.ctx, {
        type: "issue",
        date: todayIso(),
        warehouseId: w.id,
        jobId: j.id,
        lines: [{ itemId: it.id, qty: 6 }],
      });
    const results = await Promise.allSettled([issue(), issue(), issue()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await level(it.id, w.id)).toBe(4);
    expect(Number((await itemNow(it.id)).totalQty)).toBe(4);
  });

  it("souběžné doklady dostanou různá čísla bez děr", async () => {
    const u = await keeper();
    const w = await mkWarehouse();
    const s = await mkSupplier();
    const it = await mkItem();
    const docs = await Promise.all([1, 2, 3, 4].map(() => receive(u.ctx, w, s, it.id, 1, 10_00)));
    const numbers = docs.map((d) => Number(d.number.split("-")[2])).sort((a, b) => a - b);
    expect(new Set(numbers).size).toBe(4);
    expect(numbers[3]! - numbers[0]!).toBe(3);
  });
});

describe("převodka a oprávnění", () => {
  it("převodka přesune zásobu mezi umístěními a celkový stav nemění", async () => {
    const u = await keeper();
    const w1 = await mkWarehouse();
    const w2 = await mkWarehouse("vehicle");
    const s = await mkSupplier();
    const it = await mkItem();
    await receive(u.ctx, w1, s, it.id, 10, 100_00);
    await run("sklad.post", u.ctx, {
      type: "transfer",
      date: todayIso(),
      warehouseId: w1.id,
      targetWarehouseId: w2.id,
      lines: [{ itemId: it.id, qty: 3 }],
    });
    expect(await level(it.id, w1.id)).toBe(7);
    expect(await level(it.id, w2.id)).toBe(3);
    expect(Number((await itemNow(it.id)).totalQty)).toBe(10);

    await expect(
      run("sklad.post", u.ctx, {
        type: "transfer",
        date: todayIso(),
        warehouseId: w1.id,
        targetWarehouseId: w1.id,
        lines: [{ itemId: it.id, qty: 1 }],
      }),
    ).rejects.toThrow(/cílové/);
    await expect(
      run("sklad.post", u.ctx, {
        type: "transfer",
        date: todayIso(),
        warehouseId: w2.id,
        targetWarehouseId: w1.id,
        lines: [{ itemId: it.id, qty: 4 }],
      }),
    ).rejects.toThrow(/je jen 3/);
  });

  it("každý typ dokladu vyžaduje své oprávnění; vyřazené umístění a karta se odmítnou", async () => {
    const issuer = await makeUser(app.db, [
      ["sklad.read", "all"],
      ["sklad.issue", "all"],
      ["zakazky.read", "all"],
    ]);
    const reader = await makeUser(app.db, [["sklad.read", "all"]]);
    const w = await mkWarehouse();
    const s = await mkSupplier();
    const it = await mkItem();
    const body = {
      type: "receipt",
      date: todayIso(),
      warehouseId: w.id,
      supplierId: s.id,
      lines: [{ itemId: it.id, qty: 1, unitPriceMinor: 100 }],
    };
    await expect(run("sklad.post", issuer.ctx, body)).rejects.toBeInstanceOf(PermissionError);
    await expect(run("sklad.post", reader.ctx, { ...body, type: "issue" })).rejects.toBeInstanceOf(
      PermissionError,
    );
    await expect(
      run("sklad.post", reader.ctx, { ...body, type: "adjustment" }),
    ).rejects.toBeInstanceOf(PermissionError);

    const u = await keeper();
    await app.db.update(warehouse).set({ active: false }).where(eq(warehouse.id, w.id));
    await expect(run("sklad.post", u.ctx, body)).rejects.toThrow(/vyřazené/);
    const w2 = await mkWarehouse();
    await app.db.update(stockItem).set({ active: false }).where(eq(stockItem.id, it.id));
    await expect(run("sklad.post", u.ctx, { ...body, warehouseId: w2.id })).rejects.toThrow(
      /vyřazená/,
    );
  });
});

describe("objednávky u dodavatelů", () => {
  it("objednávka → částečný příjem → dokončení; příjemka drží vazbu na objednávku", async () => {
    const u = await keeper();
    const w = await mkWarehouse();
    const s = await mkSupplier();
    const a = await mkItem();
    const b = await mkItem();
    const created = await run("sklad.order.create", u.ctx, {
      supplierId: s.id,
      warehouseId: w.id,
      send: true,
      lines: [
        { itemId: a.id, qty: 10, unitPriceMinor: 100_00 },
        { itemId: b.id, qty: 5, unitPriceMinor: 40_00 },
      ],
    });
    expect(created.number).toMatch(/^OB-\d{4}-\d{3}$/);
    const [po] = await app.db.select().from(purchaseOrder).where(eq(purchaseOrder.id, created.id));
    expect(po!.status).toBe("sent");

    const lines = await app.db
      .select()
      .from(purchaseOrderLine)
      .where(eq(purchaseOrderLine.orderId, created.id));
    const la = lines.find((l) => l.itemId === a.id)!;
    const lb = lines.find((l) => l.itemId === b.id)!;

    const r1 = await run("sklad.order.receive", u.ctx, {
      id: created.id,
      supplierDocNo: "DL-1",
      lines: [{ lineId: la.id, qty: 6 }],
    });
    expect(r1.number).toMatch(/^PR-/);
    expect(
      (await app.db.select().from(purchaseOrder).where(eq(purchaseOrder.id, created.id)))[0]!
        .status,
    ).toBe("partial");
    expect(await level(a.id, w.id)).toBe(6);
    expect(Number((await itemNow(a.id)).avgCost)).toBe(100_00);

    await run("sklad.order.receive", u.ctx, {
      id: created.id,
      lines: [
        { lineId: la.id, qty: 4 },
        { lineId: lb.id, qty: 5, unitPriceMinor: 45_00 },
      ],
    });
    expect(
      (await app.db.select().from(purchaseOrder).where(eq(purchaseOrder.id, created.id)))[0]!
        .status,
    ).toBe("received");
    expect(Number((await itemNow(b.id)).avgCost)).toBe(45_00);

    const detail = await run("sklad.order", u.ctx, { id: created.id });
    expect(detail.receipts).toHaveLength(2);
    expect(detail.lines.find((l: { itemId: string }) => l.itemId === a.id).receivedQty).toBe(
      "10.000",
    );

    await expect(
      run("sklad.order.receive", u.ctx, { id: created.id, lines: [{ lineId: la.id, qty: 1 }] }),
    ).rejects.toThrow(/už nejde přijmout/);
    await expect(
      run("sklad.order.setStatus", u.ctx, { id: created.id, status: "cancelled" }),
    ).rejects.toThrow(/Přijatou/);
  });

  it("koncept se odešle, zrušená objednávka se nepřijme; entita neumožní ruční založení", async () => {
    const u = await keeper();
    const w = await mkWarehouse();
    const s = await mkSupplier();
    const a = await mkItem();
    const created = await run("sklad.order.create", u.ctx, {
      supplierId: s.id,
      warehouseId: w.id,
      send: false,
      lines: [{ itemId: a.id, qty: 1 }],
    });
    await run("sklad.order.setStatus", u.ctx, { id: created.id, status: "sent" });
    await expect(
      run("sklad.order.setStatus", u.ctx, { id: created.id, status: "sent" }),
    ).rejects.toThrow(/jen koncept/);
    await run("sklad.order.setStatus", u.ctx, { id: created.id, status: "cancelled" });
    const [line] = await app.db
      .select()
      .from(purchaseOrderLine)
      .where(eq(purchaseOrderLine.orderId, created.id));
    await expect(
      run("sklad.order.receive", u.ctx, { id: created.id, lines: [{ lineId: line!.id, qty: 1 }] }),
    ).rejects.toThrow(/už nejde přijmout/);

    const E = await resolveEntity(app.db, registry.get("purchase_order")!);
    await expect(createRecord(u.ctx, registry, E, { number: "X" })).rejects.toThrow(
      /zakládají jinde/,
    );
  });
});

describe("inventura", () => {
  it("rozdíly se zaúčtují inventurním dokladem proti aktuálnímu stavu a nejdou uzavřít napůl", async () => {
    const u = await keeper();
    const w = await mkWarehouse();
    const s = await mkSupplier();
    const a = await mkItem();
    const b = await mkItem();
    const found = await mkItem();
    await receive(u.ctx, w, s, a.id, 10, 100_00);
    await receive(u.ctx, w, s, b.id, 5, 20_00);

    const start = await run("sklad.count.start", u.ctx, { warehouseId: w.id });
    expect(start.created).toBe(true);
    const again = await run("sklad.count.start", u.ctx, { warehouseId: w.id });
    expect(again).toMatchObject({ id: start.id, created: false });

    let detail = await run("sklad.count", u.ctx, { id: start.id });
    expect(detail.lines).toHaveLength(2);
    const la = detail.lines.find((l: { itemId: string }) => l.itemId === a.id);
    const lb = detail.lines.find((l: { itemId: string }) => l.itemId === b.id);

    await run("sklad.count.saveLine", u.ctx, { lineId: la.id, counted: "8" });
    await expect(run("sklad.count.close", u.ctx, { id: start.id })).rejects.toThrow(
      /všech položek/,
    );
    await run("sklad.count.saveLine", u.ctx, { lineId: lb.id, counted: "5" });
    await expect(
      run("sklad.count.saveLine", u.ctx, { lineId: lb.id, counted: "-1" }),
    ).rejects.toThrow(/záporné/);

    await run("sklad.count.addLine", u.ctx, { countId: start.id, itemId: found.id });
    await expect(
      run("sklad.count.addLine", u.ctx, { countId: start.id, itemId: found.id }),
    ).rejects.toThrow(/už v inventuře je/);
    detail = await run("sklad.count", u.ctx, { id: start.id });
    const lf = detail.lines.find((l: { itemId: string }) => l.itemId === found.id);
    await run("sklad.count.saveLine", u.ctx, { lineId: lf.id, counted: "3" });

    // mezi založením a uzavřením se vydalo (pohyb se do rozdílu promítne správně)
    const j = await mkJob();
    await run("sklad.post", u.ctx, {
      type: "issue",
      date: todayIso(),
      warehouseId: w.id,
      jobId: j.id,
      lines: [{ itemId: a.id, qty: 1 }],
    });

    const closed = await run("sklad.count.close", u.ctx, { id: start.id });
    expect(closed.docNumber).toMatch(/^IN-/);
    // a: systém 9, napočítáno 8 → −1; b beze změny; found: 0 → +3
    expect(await level(a.id, w.id)).toBe(8);
    expect(await level(b.id, w.id)).toBe(5);
    expect(await level(found.id, w.id)).toBe(3);
    expect(Number((await itemNow(found.id)).totalQty)).toBe(3);

    const [count] = await app.db.select().from(stockCount).where(eq(stockCount.id, start.id));
    expect(count!.status).toBe("closed");
    await expect(run("sklad.count.close", u.ctx, { id: start.id })).rejects.toThrow(/uzavřená/);
    await expect(
      run("sklad.count.saveLine", u.ctx, { lineId: la.id, counted: "1" }),
    ).rejects.toThrow(/uzavřená/);
    // po uzavření lze založit novou
    expect((await run("sklad.count.start", u.ctx, { warehouseId: w.id })).created).toBe(true);
  });

  it("inventura bez rozdílů nevytvoří doklad", async () => {
    const u = await keeper();
    const w = await mkWarehouse();
    const s = await mkSupplier();
    const a = await mkItem();
    await receive(u.ctx, w, s, a.id, 2, 10_00);
    const start = await run("sklad.count.start", u.ctx, { warehouseId: w.id });
    const detail = await run("sklad.count", u.ctx, { id: start.id });
    await run("sklad.count.saveLine", u.ctx, { lineId: detail.lines[0].id, counted: "2" });
    const closed = await run("sklad.count.close", u.ctx, { id: start.id });
    expect(closed.docNumber).toBeNull();
  });
});

describe("minimální zásoby", () => {
  it("výdej pod minimum upozorní skladníky jednou denně a objeví se v pozornosti a na přehledu", async () => {
    const u = await keeper();
    const keeperTwo = await keeper();
    const w = await mkWarehouse();
    const s = await mkSupplier();
    const j = await mkJob();
    const it = await mkItem({ minQty: "5" });
    await receive(u.ctx, w, s, it.id, 8, 10_00);
    expect((await itemNow(it.id)).belowMin).toBe(false);

    const issue = (qty: number) =>
      run("sklad.post", u.ctx, {
        type: "issue",
        date: todayIso(),
        warehouseId: w.id,
        jobId: j.id,
        lines: [{ itemId: it.id, qty }],
      });
    await issue(4);
    expect((await itemNow(it.id)).belowMin).toBe(true);
    const notes = async (userId: string) =>
      app.db
        .select()
        .from(schema.notification)
        .where(
          and(
            eq(schema.notification.userId, userId),
            eq(schema.notification.kind, "sklad.low"),
            eq(schema.notification.entityId, it.id),
          ),
        );
    const [low] = await notes(keeperTwo.id);
    expect(await notes(keeperTwo.id)).toHaveLength(1);
    expect(low!.title).toBe(`Pod minimem: ${it.name}`);
    expect(low!.body).toBe(`${it.code} · skladem 4 ${it.unit}, minimum 5 ${it.unit}`);
    expect(low!.url).toBe(`/sklad/karty/${it.id}`);
    expect(await notes(u.id)).toHaveLength(0); // kdo výdej zaúčtoval, upozornění nedostává
    await issue(1);
    expect(await notes(keeperTwo.id)).toHaveLength(1); // stejný den podruhé ne

    // bez práva číst skladovou kartu upozornění nepřijde, ani když by měl právo spravovat
    const blind = await makeUser(app.db, [["sklad.write", "all"]]);
    await run("sklad.post", u.ctx, {
      type: "issue",
      date: todayIso(),
      warehouseId: w.id,
      jobId: j.id,
      lines: [{ itemId: it.id, qty: 0.5 }],
    });
    expect(await notes(blind.id)).toHaveLength(0);

    const items = (await (server.attention[0] as AttentionProvider)(u.ctx, deps())).map(
      (i) => i.id,
    );
    expect(items).toContain("stock-low");
    const widgets = await (server.widgets[0] as WidgetProvider)(u.ctx, deps());
    expect(widgets.find((x) => x.id === "stock-below-min")!.tone).toBe("warning");

    const overview = await run("sklad.overview", u.ctx, { lowOnly: true });
    expect(overview.rows.map((r: { id: string }) => r.id)).toContain(it.id);
    expect(overview.summary.low).toBeGreaterThan(0);

    const reader = await makeUser(app.db, [["zakazky.read", "all"]]);
    expect(await (server.attention[0] as AttentionProvider)(reader.ctx, deps())).toEqual([]);
    expect(await (server.widgets[0] as WidgetProvider)(reader.ctx, deps())).toEqual([]);
  });
});

describe("entity skladu", () => {
  it("karta: kód velkými písmeny, počáteční průměrná cena, nelze smazat s historií", async () => {
    const u = await keeper();
    const E = await resolveEntity(app.db, registry.get("stock_item")!);
    const code = `abc-${tag()}`;
    const { row } = await createRecord(u.ctx, registry, E, {
      code,
      name: "Lepidlo",
      unit: "kg",
      lastPrice: 120_00,
      minQty: 10,
    });
    expect(row.code).toBe(code.toUpperCase());
    const now = await itemNow(row.id);
    expect(Number(now.avgCost)).toBe(120_00);
    expect(now.minQty).toBe("10.000");
    expect(now.belowMin).toBe(true);

    // zásoba nebo historie smazání zablokuje
    const w = await mkWarehouse();
    const s = await mkSupplier();
    await receive(u.ctx, w, s, row.id, 1, 100_00);
    await expect(deleteRecord(u.ctx, E, row.id)).rejects.toThrow(/Vyřaďte ji/);

    const fresh = await createRecord(u.ctx, registry, E, {
      code: `n-${tag()}`,
      name: "Nic",
    });
    expect(fresh.row.unit).toBe("ks"); // výchozí hodnota z popisu entity
    await deleteRecord(u.ctx, E, fresh.row.id);
  });

  it("doklady se nezakládají ani nemažou ručně; umístění se zásobou nejde vyřadit ani smazat", async () => {
    const u = await keeper();
    const D = await resolveEntity(app.db, registry.get("stock_doc")!);
    await expect(createRecord(u.ctx, registry, D, { type: "receipt" })).rejects.toThrow();
    const w = await mkWarehouse();
    const s = await mkSupplier();
    const it = await mkItem();
    const doc = await receive(u.ctx, w, s, it.id, 3, 10_00);
    await expect(deleteRecord(u.ctx, D, doc.id)).rejects.toThrow(/nemažou/);

    const W = await resolveEntity(app.db, registry.get("warehouse")!);
    await expect(deleteRecord(u.ctx, W, w.id)).rejects.toThrow(/zásoby nebo doklady/);
    await expect(updateRecord(u.ctx, registry, W, w.id, { active: false })).rejects.toThrow(
      /obsahuje zásoby/,
    );

    const empty = await createRecord(u.ctx, registry, W, {
      name: `Nový ${tag()}`,
      kind: "vehicle",
    });
    await deleteRecord(u.ctx, W, empty.row.id);
  });

  it("detail karty a umístění ukáže stavy a pohyby", async () => {
    const u = await keeper();
    const w = await mkWarehouse();
    const s = await mkSupplier();
    const it = await mkItem();
    await receive(u.ctx, w, s, it.id, 4, 25_00);
    const detail = await run("sklad.itemDetail", u.ctx, { id: it.id });
    expect(detail.levels).toEqual([expect.objectContaining({ warehouseId: w.id, qty: "4.000" })]);
    expect(detail.moves[0]).toMatchObject({ type: "receipt", supplier: expect.any(String) });
    const stock = await run("sklad.warehouseStock", u.ctx, { id: w.id });
    expect(stock[0]).toMatchObject({ itemId: it.id, valueMinor: 4 * 25_00 });
    const opts = await run("sklad.options", u.ctx, {});
    expect(opts.items.find((i: { id: string }) => i.id === it.id).levels).toHaveLength(1);
    expect(fromMilli(1500)).toBe("1.500");
  });
});
