import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { ZodType } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensurePipeline, getPipeline } from "@rebar/core/config-data";
import {
  clearEntityPolicies,
  createEntityRegistry,
  registerEntityPolicies,
  resolveEntity,
  updateRecord,
  type EntityRegistry,
} from "@rebar/core/entities";
import type { CommandDef, ModuleDeps } from "@rebar/core/module-server";
import { ensureSeries } from "@rebar/core/numbering";
import { PermissionError, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { company } from "@rebar/kontakty/schema";
import { companyEntity, personEntity } from "@rebar/kontakty/server";
import * as approvals from "../approvals/api";
import { costsSave } from "../costs/commands";
import { manifest } from "../index";
import { job, jobOrder } from "../schema";
import { jobEntity } from "../server";
import * as ordersApi from "./api";
import {
  ordersCancel,
  ordersDelete,
  ordersGet,
  ordersList,
  ordersReceive,
  ordersSave,
  ordersSubmit,
} from "./commands";
import { orderEntity } from "./entity";
import "./index";

const app = connectAppDb();
afterAll(() => app.close());

let registry: EntityRegistry;
const deps = () =>
  ({
    registry,
    baseURL: "http://localhost",
    costProviders: [],
    calendarLayers: [],
  }) as unknown as ModuleDeps;
const run = <S extends ZodType, R>(cmd: CommandDef<S, R>, ctx: Ctx, input: unknown) =>
  cmd.handler(ctx, cmd.input.parse(input) as never, deps());

beforeAll(async () => {
  clearEntityPolicies();
  registry = createEntityRegistry([companyEntity, personEntity, jobEntity, orderEntity]);
  registerEntityPolicies(registry);
  for (const p of manifest.seed.pipelines) await ensurePipeline(app.db, p);
  await ensureSeries(app.db, manifest.seed.series);
});

const jobPerms: [string, "all" | "own"][] = [
  ["zakazky.read", "all"],
  ["zakazky.write", "all"],
  ["zakazky.economics", "all"],
  ["zakazky.budget", "all"],
  ["kontakty.read", "all"],
];
const author = () => makeUser(app.db, jobPerms);
const approver = () => makeUser(app.db, [...jobPerms, ["zakazky.approve", "all"]]);
const boss = () =>
  makeUser(app.db, [...jobPerms, ["zakazky.approve", "all"], ["zakazky.approve_all", "all"]]);

async function newJob(managerId?: string) {
  const [c] = await app.db
    .insert(company)
    .values({ name: `Firma ${randomBytes(3).toString("hex")}` })
    .returning();
  const stage = (await getPipeline(app.db, "job", "default"))!.stages[0]!;
  const [j] = await app.db
    .insert(job)
    .values({
      number: `T-${randomBytes(4).toString("hex")}`,
      title: "Rekonstrukce",
      companyId: c!.id,
      stageId: stage.id,
      valueMinor: 1_000_000_00,
      managerId: managerId ?? null,
    })
    .returning();
  return { job: j!, supplier: c! };
}

const line = (price: number, qty = "1") => ({
  description: "Cihly",
  quantity: qty,
  unit: "pal",
  unitPriceMinor: price,
  vatRateBp: 2100,
});

async function draft(
  u: Awaited<ReturnType<typeof author>>,
  jobId: string,
  supplierId: string,
  price: number,
) {
  return run(ordersSave, u.ctx, {
    jobId,
    title: "Dodávka cihel",
    supplierId,
    deliveryDate: "2026-11-01",
    lines: [line(price, "2")],
  });
}

describe("objednávky zakázky", () => {
  it("číslo z řady, součty řádků, koncept se dá upravit a smazat", async () => {
    const u = await author();
    const { job: j, supplier } = await newJob(u.id);
    const a = await draft(u, j.id, supplier.id, 10_000_00);
    const b = await draft(u, j.id, supplier.id, 1_000_00);
    expect(a.number).toMatch(/^OBJ-\d{4}-\d{3}$/);
    expect(b.number).not.toBe(a.number);
    const d = await run(ordersGet, u.ctx, { id: a.id });
    expect(d).toMatchObject({
      status: "draft",
      editable: true,
      netMinor: 20_000_00,
      vatMinor: 4_200_00,
      grossMinor: 24_200_00,
    });
    await run(ordersSave, u.ctx, {
      jobId: j.id,
      id: a.id,
      title: "Cihly a malta",
      supplierName: "Cihelna",
      lines: [line(5_000_00, "3"), line(1_000_00)],
    });
    expect((await run(ordersGet, u.ctx, { id: a.id })).netMinor).toBe(16_000_00);
    const [row] = await app.db.select().from(jobOrder).where(eq(jobOrder.id, a.id));
    expect(row!.totalMinor).toBe(16_000_00);

    await run(ordersDelete, u.ctx, { id: b.id });
    const list = await run(ordersList, u.ctx, { jobId: j.id });
    expect(list.orders.map((o) => o.number)).toEqual([a.number]);
  });

  it("odeslání vyžaduje řádky, dodavatele a kladnou částku", async () => {
    const u = await author();
    const { job: j } = await newJob(u.id);
    const empty = await run(ordersSave, u.ctx, { jobId: j.id, title: "Prázdná", lines: [] });
    await expect(run(ordersSubmit, u.ctx, { id: empty.id })).rejects.toThrow(/nemá žádné řádky/);
    const noSupplier = await run(ordersSave, u.ctx, {
      jobId: j.id,
      title: "Bez dodavatele",
      lines: [line(100_00)],
    });
    await expect(run(ordersSubmit, u.ctx, { id: noSupplier.id })).rejects.toThrow(/dodavatele/);
  });

  it("schválení přes limit: pod 50 000 Kč schválí approve, nad ním jen approve_all; schválená je zamčená", async () => {
    const u = await author();
    const ap = await approver();
    const bs = await boss();
    const { job: j, supplier } = await newJob(u.id);

    const small = await draft(u, j.id, supplier.id, 10_000_00);
    expect((await run(ordersSubmit, u.ctx, { id: small.id })).status).toBe("pending");
    // čekající objednávka se nedá upravit ani zrušit
    await expect(
      run(ordersSave, u.ctx, { jobId: j.id, id: small.id, title: "Změna", lines: [line(1)] }),
    ).rejects.toThrow(/jen v konceptu/);
    await expect(run(ordersCancel, u.ctx, { id: small.id })).rejects.toThrow(/čeká na schválení/);
    const state = await approvals.getState(ap.ctx, "order", small.id);
    expect(state.status).toBe("pending");
    await approvals.decide(ap.ctx, state.approvalId!, { approve: true });

    const d = await run(ordersGet, u.ctx, { id: small.id });
    expect(d).toMatchObject({ status: "approved", locked: true, editable: false });

    // zamčeno: příkaz i přímá úprava přes entitu selžou s důvodem
    await expect(
      run(ordersSave, u.ctx, { jobId: j.id, id: small.id, title: "Změna", lines: [line(1)] }),
    ).rejects.toThrow(/zamčený/);
    await expect(
      updateRecord(u.ctx, registry, await resolveEntity(u.ctx.db, orderEntity), small.id, {
        title: "Přepsáno",
      }),
    ).rejects.toThrow(/zamčený/);

    // velká objednávka: approver ji neschválí, boss ano
    const big = await draft(u, j.id, supplier.id, 60_000_00);
    await run(ordersSubmit, u.ctx, { id: big.id });
    const bigState = await approvals.getState(ap.ctx, "order", big.id);
    await expect(approvals.decide(ap.ctx, bigState.approvalId!, { approve: true })).rejects.toThrow(
      PermissionError,
    );
    await approvals.decide(bs.ctx, bigState.approvalId!, { approve: true });
    expect((await run(ordersGet, u.ctx, { id: big.id })).status).toBe("approved");
  });

  it("zamítnutí vrátí do konceptu, vrácení do konceptu schválené objednávky odemkne", async () => {
    const u = await author();
    const ap = await approver();
    const bs = await boss();
    const { job: j, supplier } = await newJob(u.id);
    const o = await draft(u, j.id, supplier.id, 5_000_00);
    await run(ordersSubmit, u.ctx, { id: o.id });
    let st = await approvals.getState(ap.ctx, "order", o.id);
    await approvals.decide(ap.ctx, st.approvalId!, { approve: false, comment: "Příliš drahé" });
    expect(await run(ordersGet, u.ctx, { id: o.id })).toMatchObject({
      status: "draft",
      locked: false,
      editable: true,
    });

    await run(ordersSubmit, u.ctx, { id: o.id });
    st = await approvals.getState(ap.ctx, "order", o.id);
    await approvals.decide(ap.ctx, st.approvalId!, { approve: true });
    await expect(approvals.reopen(ap.ctx, "order", o.id)).rejects.toThrow(PermissionError);
    await approvals.reopen(bs.ctx, "order", o.id, { reason: "Oprava ceny" });
    expect(await run(ordersGet, u.ctx, { id: o.id })).toMatchObject({
      status: "draft",
      locked: false,
    });
  });

  it("příjem a zrušení: přijatou objednávku nejde zrušit, schválenou ano; závazek v seznamu klesá s nákladem", async () => {
    const u = await author();
    const bs = await boss();
    const { job: j, supplier } = await newJob(u.id);
    const o = await draft(u, j.id, supplier.id, 10_000_00);
    await expect(run(ordersReceive, u.ctx, { id: o.id })).rejects.toThrow(/jen schválenou/);
    await run(ordersSubmit, u.ctx, { id: o.id });
    const st = await approvals.getState(bs.ctx, "order", o.id);
    await approvals.decide(bs.ctx, st.approvalId!, { approve: true });
    let list = await run(ordersList, u.ctx, { jobId: j.id });
    expect(list.openMinor).toBe(20_000_00);

    await run(ordersReceive, u.ctx, { id: o.id });
    await run(costsSave, u.ctx, {
      jobId: j.id,
      date: "2026-10-09",
      category: "material",
      title: "Faktura za cihly",
      amountMinor: 8_000_00,
      orderId: o.id,
    });
    list = await run(ordersList, u.ctx, { jobId: j.id });
    expect(list.orders[0]).toMatchObject({
      status: "received",
      costMinor: 8_000_00,
      openMinor: 12_000_00,
    });
    await expect(run(ordersCancel, u.ctx, { id: o.id })).rejects.toThrow(UserError);
    const detail = await run(ordersGet, u.ctx, { id: o.id });
    expect(detail.costs.map((c) => c.label)).toEqual(["Faktura za cihly"]);

    const o2 = await draft(u, j.id, supplier.id, 1_000_00);
    await run(ordersSubmit, u.ctx, { id: o2.id });
    const st2 = await approvals.getState(bs.ctx, "order", o2.id);
    await approvals.decide(bs.ctx, st2.approvalId!, { approve: true });
    await run(ordersCancel, u.ctx, { id: o2.id });
    expect((await run(ordersGet, u.ctx, { id: o2.id })).status).toBe("cancelled");
    await expect(run(ordersDelete, u.ctx, { id: o2.id })).rejects.toThrow(/jen koncept/);
  });

  it("mistr bez ekonomiky objednávky nevidí a nezakládá; api vrací stručné údaje", async () => {
    const u = await author();
    const { job: j, supplier } = await newJob(u.id);
    const o = await draft(u, j.id, supplier.id, 1_000_00);
    const foreman = await makeUser(app.db, [
      ["zakazky.read", "own"],
      ["zakazky.write", "own"],
    ]);
    await expect(run(ordersList, foreman.ctx, { jobId: j.id })).rejects.toThrow();
    const own = (await newJob(foreman.id)).job;
    await expect(run(ordersList, foreman.ctx, { jobId: own.id })).rejects.toThrow(PermissionError);
    await expect(
      run(ordersSave, foreman.ctx, { jobId: own.id, title: "Nesmí", lines: [] }),
    ).rejects.toThrow(PermissionError);
    await expect(run(ordersGet, foreman.ctx, { id: o.id })).rejects.toThrow();
    const brief = await ordersApi.getOrderBrief(u.ctx, o.id);
    expect(brief).toMatchObject({ jobId: j.id, totalMinor: 2_000_00, status: "draft" });
  });
});
