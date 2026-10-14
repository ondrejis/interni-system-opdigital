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
import {
  setJobFinanceProviders,
  type CommandDef,
  type CostLine,
  type ModuleDeps,
} from "@rebar/core/module-server";
import { ensureSeries } from "@rebar/core/numbering";
import { NotFoundError, PermissionError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { company } from "@rebar/kontakty/schema";
import { companyEntity, personEntity } from "@rebar/kontakty/server";
import { manifest as zakazkyManifest } from "@rebar/zakazky";
import { approvalsApi, jobEntity, orderEntity } from "@rebar/zakazky/server";
import {
  budgetItem,
  budgetObject,
  budgetSection,
  budgetVersion,
  job,
  jobOrder,
} from "@rebar/zakazky/schema";
import { area } from "./index";
import { receivedEntity } from "./entity";
import {
  receivedCreate,
  receivedDelete,
  receivedGet,
  receivedList,
  receivedPay,
  receivedSave,
  receivedSubmit,
  receivedUnpay,
} from "./commands";

const app = connectAppDb();
afterAll(() => app.close());

let registry: EntityRegistry;
const deps = () =>
  ({
    registry,
    baseURL: "http://localhost",
    costProviders: area.costProviders ?? [],
    calendarLayers: [],
  }) as unknown as ModuleDeps;
const run = <S extends ZodType, R>(cmd: CommandDef<S, R>, ctx: Ctx, input: unknown) =>
  cmd.handler(ctx, cmd.input.parse(input) as never, deps());

beforeAll(async () => {
  clearEntityPolicies();
  registry = createEntityRegistry([
    companyEntity,
    personEntity,
    jobEntity,
    orderEntity,
    receivedEntity,
  ]);
  registerEntityPolicies(registry);
  for (const p of zakazkyManifest.seed.pipelines) await ensurePipeline(app.db, p);
  await ensureSeries(app.db, zakazkyManifest.seed.series);
  setJobFinanceProviders({ costProviders: area.costProviders ?? [], invoicing: [] });
});

const perms: [string, "all" | "own"][] = [
  ["zakazky.read", "all"],
  ["zakazky.economics", "all"],
  ["zakazky.budget", "all"],
  ["fakturace.read", "all"],
  ["fakturace.write", "all"],
  ["kontakty.read", "all"],
];
const office = () => makeUser(app.db, perms);
const approver = () => makeUser(app.db, [...perms, ["zakazky.approve", "all"]]);
const boss = () =>
  makeUser(app.db, [...perms, ["zakazky.approve", "all"], ["zakazky.approve_all", "all"]]);

const mkCompany = async () =>
  (
    await app.db
      .insert(company)
      .values({
        name: `Dodavatel ${randomBytes(3).toString("hex")}`,
        ico: String(Math.floor(10_000_000 + Math.random() * 89_999_999)),
      })
      .returning()
  )[0]!;

async function newJob() {
  const c = await mkCompany();
  const stage = (await getPipeline(app.db, "job", "default"))!.stages[0]!;
  const [j] = await app.db
    .insert(job)
    .values({
      number: `T-${randomBytes(4).toString("hex")}`,
      title: "Rekonstrukce",
      companyId: c.id,
      stageId: stage.id,
      phase: "execution",
      valueMinor: 1_000_000_00,
    })
    .returning();
  const [v] = await app.db
    .insert(budgetVersion)
    .values({ jobId: j!.id, kind: "realization", number: 1, status: "draft" })
    .returning();
  const [o] = await app.db
    .insert(budgetObject)
    .values({ versionId: v!.id, title: "Celá zakázka", isDefault: true })
    .returning();
  const sec = async (title: string, position: number) =>
    (
      await app.db
        .insert(budgetSection)
        .values({ versionId: v!.id, objectId: o!.id, title, position })
        .returning()
    )[0]!;
  const zemni = await sec("Zemní práce", 0);
  const elektro = await sec("Elektro", 1);
  const [item] = await app.db
    .insert(budgetItem)
    .values({
      versionId: v!.id,
      sectionId: zemni.id,
      title: "Výkop",
      quantity: "1",
      unitCostMinor: 50_000_00,
      unitPriceMinor: 70_000_00,
    })
    .returning();
  return { job: j!, zemni, elektro, item: item! };
}

const line = (sectionId: string | null, net: number, description = "Zemní práce") => ({
  description,
  sectionId,
  category: "subcontract",
  netMinor: net,
  vatRateBp: 2100,
});

async function newInvoice(
  u: Awaited<ReturnType<typeof office>>,
  jobId: string,
  supplierId: string,
  over: Record<string, unknown> = {},
) {
  return run(receivedCreate, u.ctx, {
    number: `FV-${randomBytes(3).toString("hex")}`,
    supplierId,
    jobId,
    issueDate: "2026-10-01",
    dueDate: "2026-10-15",
    netMinor: 10_000_00,
    grossMinor: 12_100_00,
    ...over,
  });
}

async function approve(inv: string, as: Awaited<ReturnType<typeof office>>) {
  const st = await approvalsApi.getState(as.ctx, "received_invoice", inv);
  await approvalsApi.decide(as.ctx, st.approvalId!, { approve: true });
}

const costsOf = async (u: Awaited<ReturnType<typeof office>>, jobId: string) =>
  (
    await Promise.all((area.costProviders ?? []).map((p) => p.costs(u.ctx, jobId, deps())))
  ).flat() as CostLine[];

describe("přijaté faktury", () => {
  it("založení spočítá DPH hlavičky, bez řádků vznikne řádek na celý základ", async () => {
    const u = await office();
    const s = await mkCompany();
    const { job: j } = await newJob();
    const { id } = await newInvoice(u, j.id, s.id);
    const d = await run(receivedGet, u.ctx, { id });
    expect(d).toMatchObject({
      state: "draft",
      editable: true,
      netMinor: 10_000_00,
      vatMinor: 2_100_00,
      grossMinor: 12_100_00,
      supplierName: expect.stringContaining("Dodavatel"),
    });
    expect(d.lines).toHaveLength(1);
    expect(d.lines[0]).toMatchObject({ netMinor: 10_000_00, sectionId: null });
    // koncept nevstupuje do nákladů
    expect(await costsOf(u, j.id)).toEqual([]);
  });

  it("duplicita (stejný dodavatel + číslo bez mezer a velikosti písmen) se odmítne, jiný dodavatel smí", async () => {
    const u = await office();
    const s1 = await mkCompany();
    const s2 = await mkCompany();
    const { job: j } = await newJob();
    await newInvoice(u, j.id, s1.id, { number: "FV 2026/001" });
    await expect(newInvoice(u, j.id, s1.id, { number: "fv2026/001" })).rejects.toThrow(
      /už v systému je/,
    );
    await newInvoice(u, j.id, s2.id, { number: "FV 2026/001" });
    // souběh: dvě stejné faktury naráz, projde právě jedna
    const results = await Promise.allSettled([
      newInvoice(u, j.id, s1.id, { number: "RACE-1" }),
      newInvoice(u, j.id, s1.id, { number: "RACE-1" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason.message,
    ).toMatch(/už v systému je/);
  });

  it("odeslání ke schválení kontroluje, že řádky sedí na základ; přenesená daňová povinnost je bez DPH", async () => {
    const u = await office();
    const s = await mkCompany();
    const { job: j, zemni, elektro } = await newJob();
    const { id } = await newInvoice(u, j.id, s.id);
    const base = {
      id,
      number: "FV-CHECK",
      supplierId: s.id,
      jobId: j.id,
      netMinor: 10_000_00,
      grossMinor: 12_100_00,
    };
    await run(receivedSave, u.ctx, {
      ...base,
      lines: [line(zemni.id, 6_000_00), line(elektro.id, 3_000_00, "Elektro")],
    });
    await expect(run(receivedSubmit, u.ctx, { id })).rejects.toThrow(/Součet řádků/);
    await run(receivedSave, u.ctx, {
      ...base,
      lines: [line(zemni.id, 6_000_00), line(elektro.id, 4_000_00, "Elektro")],
    });
    expect((await run(receivedSubmit, u.ctx, { id })).state).toBe("pending");

    // PDP: doklad je bez DPH, celkem = základ
    const pdp = await newInvoice(u, j.id, s.id, { vatMode: "reverse_charge", grossMinor: 99 });
    expect(await run(receivedGet, u.ctx, { id: pdp.id })).toMatchObject({
      vatMode: "reverse_charge",
      grossMinor: 10_000_00,
      vatMinor: 0,
    });

    // oddíl jiné zakázky se odmítne
    const other = await newJob();
    await expect(
      run(receivedSave, u.ctx, {
        ...base,
        number: "FV-X",
        lines: [line(other.zemni.id, 10_000_00)],
      }),
    ).rejects.toThrow(/Oddíl není v aktuálním rozpočtu|zamčený|jen v konceptu/);
  });

  it("schválení zamkne fakturu a řádky vstoupí do nákladů zakázky i souhrnu; vrácení do konceptu je odebere", async () => {
    const u = await office();
    const ap = await approver();
    const bs = await boss();
    const s = await mkCompany();
    const { job: j, zemni, elektro } = await newJob();
    const { id } = await newInvoice(u, j.id, s.id);
    await run(receivedSave, u.ctx, {
      id,
      number: "FV-APPR",
      supplierId: s.id,
      jobId: j.id,
      netMinor: 10_000_00,
      grossMinor: 12_100_00,
      lines: [line(zemni.id, 7_000_00), line(elektro.id, 3_000_00, "Elektro")],
    });
    await run(receivedSubmit, u.ctx, { id });
    // čekající faktura ještě není náklad
    expect(await costsOf(u, j.id)).toEqual([]);
    await approve(id, ap);

    const d = await run(receivedGet, u.ctx, { id });
    expect(d).toMatchObject({ state: "approved", locked: true, editable: false });
    const lines = await costsOf(u, j.id);
    expect(lines.map((l) => [l.source, l.amountMinor, l.sectionId])).toEqual([
      ["faktura_prijata", 7_000_00, zemni.id],
      ["faktura_prijata", 3_000_00, elektro.id],
    ]);
    expect(lines[0]).toMatchObject({ ref: d.lines[0]!.id, supplier: s.name });
    const [jr] = await app.db.select().from(job).where(eq(job.id, j.id));
    expect(jr!.sumCostMinor).toBe(10_000_00);
    expect(jr!.sumUnpairedCount).toBe(0);

    // zamčeno: příkaz, entita i smazání selžou
    await expect(
      run(receivedSave, u.ctx, {
        id,
        number: "FV-APPR",
        supplierId: s.id,
        netMinor: 1,
        grossMinor: 1,
      }),
    ).rejects.toThrow(/zamčený/);
    await expect(
      updateRecord(u.ctx, registry, await resolveEntity(u.ctx.db, receivedEntity), id, {
        note: "Přepsáno",
      }),
    ).rejects.toThrow(/zamčený/);
    await expect(run(receivedDelete, u.ctx, { id })).rejects.toThrow(/koncept nebo zamítnutou/);

    // uhrazená zůstává nákladem, zrušení úhrady ji vrátí do schválených
    await run(receivedPay, u.ctx, { id, paidDate: "2026-10-09" });
    expect(await run(receivedGet, u.ctx, { id })).toMatchObject({
      state: "paid",
      paidMinor: 12_100_00,
    });
    expect((await costsOf(u, j.id)).length).toBe(2);
    await expect(approvalsApi.reopen(bs.ctx, "received_invoice", id)).rejects.toThrow(/uhrazená/);
    await run(receivedUnpay, u.ctx, { id });
    await approvalsApi.reopen(bs.ctx, "received_invoice", id, { reason: "Špatná částka" });
    expect(await run(receivedGet, u.ctx, { id })).toMatchObject({ state: "draft", locked: false });
    expect(await costsOf(u, j.id)).toEqual([]);
    const [after] = await app.db.select().from(job).where(eq(job.id, j.id));
    expect(after!.sumCostMinor).toBe(0);
  });

  it("nespárovaný řádek faktury je úkol k doplnění; přepárování v nákladech nemění doklad", async () => {
    const u = await office();
    const bs = await boss();
    const s = await mkCompany();
    const { job: j, zemni, elektro } = await newJob();
    const { id } = await newInvoice(u, j.id, s.id);
    await run(receivedSave, u.ctx, {
      id,
      number: "FV-UNP",
      supplierId: s.id,
      jobId: j.id,
      netMinor: 10_000_00,
      grossMinor: 12_100_00,
      lines: [line(null, 10_000_00)],
    });
    await run(receivedSubmit, u.ctx, { id });
    await approve(id, bs);
    const { costsApi } = await import("@rebar/zakazky/server");
    const list = await costsApi.listJobCosts(u.ctx, j.id, {}, deps());
    expect(list.rows[0]).toMatchObject({ source: "faktura_prijata", status: "unpaired" });
    expect(list.unpairedCount).toBe(1);
    await costsApi.allocateCost(
      u.ctx,
      j.id,
      {
        source: "faktura_prijata",
        ref: list.rows[0]!.ref,
        parts: [
          { sectionId: zemni.id, amountMinor: 4_000_00 },
          { sectionId: elektro.id, amountMinor: 6_000_00 },
        ],
      },
      deps(),
    );
    const plan = await costsApi.planVsActual(u.ctx, j.id, deps());
    const by = Object.fromEntries(plan.objects[0]!.sections.map((x) => [x.title, x.metrics]));
    expect(by["Zemní práce"]!.actualMinor).toBe(4_000_00);
    expect(by["Elektro"]!.actualMinor).toBe(6_000_00);
    expect((await run(receivedGet, u.ctx, { id })).lines[0]!.sectionId).toBeNull();
  });

  it("zamítnutá faktura jde opravit a poslat znovu", async () => {
    const u = await office();
    const ap = await approver();
    const s = await mkCompany();
    const { job: j, zemni } = await newJob();
    const { id } = await newInvoice(u, j.id, s.id, { number: "FV-REJ" });
    await run(receivedSave, u.ctx, {
      id,
      number: "FV-REJ",
      supplierId: s.id,
      jobId: j.id,
      netMinor: 10_000_00,
      grossMinor: 12_100_00,
      lines: [line(zemni.id, 10_000_00)],
    });
    await run(receivedSubmit, u.ctx, { id });
    const st = await approvalsApi.getState(ap.ctx, "received_invoice", id);
    await approvalsApi.decide(ap.ctx, st.approvalId!, { approve: false, comment: "Špatná částka" });
    expect(await run(receivedGet, u.ctx, { id })).toMatchObject({
      state: "rejected",
      editable: true,
    });
    await run(receivedSave, u.ctx, {
      id,
      number: "FV-REJ",
      supplierId: s.id,
      jobId: j.id,
      netMinor: 9_000_00,
      grossMinor: 10_890_00,
      lines: [line(zemni.id, 9_000_00)],
    });
    expect((await run(receivedGet, u.ctx, { id })).state).toBe("draft");
    expect((await run(receivedSubmit, u.ctx, { id })).state).toBe("pending");
  });

  it("porovnání s objednávkou: faktura nad objednanou částku je varování", async () => {
    const u = await office();
    const s = await mkCompany();
    const { job: j } = await newJob();
    const [o] = await app.db
      .insert(jobOrder)
      .values({
        jobId: j.id,
        number: `T${randomBytes(3).toString("hex")}`,
        title: "Objednávka",
        status: "approved",
        totalMinor: 8_000_00,
      })
      .returning();
    const { id } = await newInvoice(u, j.id, s.id, { orderId: o!.id });
    const d = await run(receivedGet, u.ctx, { id });
    expect(d.orderCompare).toMatchObject({
      orderedMinor: 8_000_00,
      invoicedMinor: 10_000_00,
      diffMinor: 2_000_00,
      state: "over",
    });
    const other = await newJob();
    await expect(
      newInvoice(u, j.id, s.id, {
        orderId: (
          await app.db
            .insert(jobOrder)
            .values({
              jobId: other.job.id,
              number: `T${randomBytes(3).toString("hex")}`,
              title: "Cizí",
            })
            .returning()
        )[0]!.id,
      }),
    ).rejects.toThrow(/jiné zakázce/);
  });

  it("oprávnění: bez fakturace.write se nezakládá, bez ekonomiky zakázky se faktura zakázky nevydá", async () => {
    const u = await office();
    const s = await mkCompany();
    const { job: j } = await newJob();
    const { id } = await newInvoice(u, j.id, s.id);
    const reader = await makeUser(app.db, [
      ["fakturace.read", "all"],
      ["zakazky.read", "all"],
    ]);
    await expect(run(receivedGet, reader.ctx, { id })).rejects.toThrow(PermissionError);
    await expect(run(receivedList, reader.ctx, { jobId: j.id })).rejects.toThrow(PermissionError);
    const noJob = await makeUser(app.db, [
      ["fakturace.read", "all"],
      ["fakturace.write", "all"],
    ]);
    await expect(run(receivedGet, noJob.ctx, { id })).rejects.toThrow(NotFoundError);
    const list = await run(receivedList, u.ctx, { jobId: j.id });
    expect(list.invoices.map((i) => i.id)).toContain(id);
  });
});
