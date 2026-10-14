import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensurePipeline, getPipeline } from "@rebar/core/config-data";
import { schema } from "@rebar/core/db";
import {
  clearEntityPolicies,
  createEntityRegistry,
  registerEntityPolicies,
  type EntityRegistry,
} from "@rebar/core/entities";
import type { CommandDef, ModuleDeps } from "@rebar/core/module-server";
import { ensureSeries } from "@rebar/core/numbering";
import { NotFoundError, PermissionError, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { company } from "@rebar/kontakty/schema";
import { companyEntity, personEntity } from "@rebar/kontakty/server";
import type { ZodType } from "zod";
import { budgetTree, calcReplace, itemSave, sectionSave, versionCreate } from "../budget/commands";
import { phaseHooks } from "../budget/index";
import { manifest } from "../index";
import { job, jobMember, jobTemplate } from "../schema";
import { jobEntity } from "../server";
import * as api from "./api";
import {
  templateApply,
  templateCreateFromJob,
  templateDelete,
  templateGet,
  templateList,
  templateSave,
} from "./commands";
import { summarizePayload, templatePayload } from "./payload";

const app = connectAppDb();
afterAll(() => app.close());

let registry: EntityRegistry;
const deps = () => ({ registry, baseURL: "http://localhost" }) as unknown as ModuleDeps;
const run = <S extends ZodType, R>(cmd: CommandDef<S, R>, ctx: Ctx, input: unknown) =>
  cmd.handler(ctx, cmd.input.parse(input) as never, deps());

beforeAll(async () => {
  clearEntityPolicies();
  registry = createEntityRegistry([companyEntity, personEntity, jobEntity]);
  registerEntityPolicies(registry);
  for (const p of manifest.seed.pipelines) await ensurePipeline(app.db, p);
  await ensureSeries(app.db, manifest.seed.series);
});

const boss = () =>
  makeUser(app.db, [
    ["zakazky.read", "all"],
    ["zakazky.write", "all"],
    ["zakazky.economics", "all"],
    ["zakazky.budget", "all"],
    ["tasks.read", "all"],
    ["tasks.assign", "all"],
    ["kontakty.read", "all"],
  ]);

async function newJob(managerId: string, extra: Partial<typeof job.$inferInsert> = {}) {
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
      managerId,
      phase: "offer",
      ...extra,
    })
    .returning();
  return j!;
}

/** Zdrojová zakázka: oddíl Elektro (kabel s výkazem výměr) s pododdílem, druhý objekt, úkoly a role v týmu. */
async function source(u: Awaited<ReturnType<typeof boss>>) {
  const j = await newJob(u.id, { startDate: "2026-11-02" });
  const v = await run(versionCreate, u.ctx, { jobId: j.id, kind: "offer" });
  const s = await run(sectionSave, u.ctx, { versionId: v.id, title: "Elektro", code: "01" });
  const sub = await run(sectionSave, u.ctx, { versionId: v.id, parentId: s.id, title: "Rozvaděč" });
  const a = await run(itemSave, u.ctx, {
    sectionId: s.id,
    title: "Kabel",
    unit: "m",
    kind: "material",
    unitPriceMinor: 5_000,
    unitCostMinor: 3_000,
  });
  await run(calcReplace, u.ctx, {
    itemId: a.id,
    lines: [{ variable: "a", formula: "10" }, { formula: "a*2" }],
  });
  await run(itemSave, u.ctx, {
    sectionId: sub.id,
    title: "Rozvaděč 24 modulů",
    unitPriceMinor: 1_000_000,
    unitCostMinor: 700_000,
  });
  const [t1] = await app.db
    .insert(schema.task)
    .values({
      title: "Objednat materiál",
      assigneeId: u.id,
      dueDate: "2026-11-05",
      entityType: "job",
      entityId: j.id,
    })
    .returning();
  await app.db.insert(schema.task).values({
    title: "Hotový úkol",
    assigneeId: u.id,
    doneAt: new Date(),
    entityType: "job",
    entityId: j.id,
  });
  expect(t1).toBeTruthy();
  await app.db.insert(jobMember).values({ jobId: j.id, userId: u.id, role: "mistr" });
  return { j, v, s };
}

describe("šablony zakázek", () => {
  it("vytvoří šablonu bez cen; list nevrací obsah, get ho vrací bez cen", async () => {
    const u = await boss();
    const { j } = await source(u);
    const r = await run(templateCreateFromJob, u.ctx, { jobId: j.id, name: "Elektro standard" });
    expect(r.summary).toMatchObject({
      sections: 2,
      items: 2,
      tasks: 1,
      roles: 1,
      hasBudget: true,
      withPrices: false,
    });
    const [row] = await app.db.select().from(jobTemplate).where(eq(jobTemplate.id, r.id));
    const payload = templatePayload.parse(row!.payload);
    expect(payload.budget!.objects[0]!.sections[0]).toMatchObject({ title: "Elektro", code: "01" });
    expect(payload.budget!.objects[0]!.sections[0]!.items[0]).toMatchObject({
      title: "Kabel",
      unitPriceMinor: 0,
      unitCostMinor: 0,
      quantity: "30.000",
    });
    expect(payload.budget!.objects[0]!.sections[0]!.items[0]!.calc).toHaveLength(2);
    expect(payload.tasks[0]).toMatchObject({ title: "Objednat materiál", daysFromStart: 3 });
    expect(payload.roles).toEqual(["mistr"]);
    const list = await run(templateList, u.ctx, {});
    expect(list.find((t) => t.id === r.id)).toMatchObject({ name: "Elektro standard" });
    expect("payload" in list[0]!).toBe(false);
    expect(summarizePayload(payload).items).toBe(2);
    const full = await run(templateGet, u.ctx, { id: r.id });
    expect(full.payload.budget!.withPrices).toBe(false);
  });

  it("šablona s cenami: bez zakazky.economics se ceny nevrátí a nejde ani vytvořit", async () => {
    const u = await boss();
    const { j } = await source(u);
    const r = await run(templateCreateFromJob, u.ctx, {
      jobId: j.id,
      name: "S cenami",
      withPrices: true,
    });
    const noPrices = await makeUser(app.db, [
      ["zakazky.read", "all"],
      ["zakazky.write", "all"],
      ["zakazky.budget", "all"],
    ]);
    const got = await run(templateGet, noPrices.ctx, { id: r.id });
    expect(got.payload.budget!.objects[0]!.sections[0]!.items[0]!.unitPriceMinor).toBe(0);
    expect(got.payload.budget!.withPrices).toBe(false);
    await expect(
      run(templateCreateFromJob, noPrices.ctx, { jobId: j.id, name: "Zakázaná", withPrices: true }),
    ).rejects.toThrow(PermissionError);
    const full = await run(templateGet, u.ctx, { id: r.id });
    expect(full.payload.budget!.objects[0]!.sections[0]!.items[0]!.unitPriceMinor).toBe(5_000);
  });

  it("aplikace šablony do prázdné nabídky: oddíly, položky, výkaz výměr, úkoly s termínem a role", async () => {
    const u = await boss();
    const { j } = await source(u);
    const t = await run(templateCreateFromJob, u.ctx, {
      jobId: j.id,
      name: "Kostra",
      withPrices: true,
    });
    const target = await newJob(u.id, { startDate: "2027-01-11" });
    const res = await run(templateApply, u.ctx, { jobId: target.id, templateId: t.id });
    expect(res).toMatchObject({ sections: 2, items: 2, tasks: 1 });
    expect(res.roles).toEqual(["mistr"]);
    const tree = await run(budgetTree, u.ctx, { jobId: target.id });
    expect(tree.version).toMatchObject({ kind: "offer", number: 1 });
    expect(tree.objects[0]!.isDefault).toBe(true);
    const sec = tree.objects[0]!.sections[0]!;
    expect(sec).toMatchObject({ title: "Elektro", code: "01" });
    expect(sec.items[0]).toMatchObject({
      title: "Kabel",
      quantity: "30.000",
      calcCount: 2,
      unitPriceMinor: 5_000,
    });
    expect(sec.children[0]!.items[0]!.title).toBe("Rozvaděč 24 modulů");
    expect(tree.totals.sellMinor).toBe(30 * 5_000 + 1_000_000);
    const tasks = await app.db
      .select()
      .from(schema.task)
      .where(and(eq(schema.task.entityId, target.id), isNull(schema.task.deletedAt)));
    expect(tasks.map((x) => x.title).sort()).toEqual([
      "Objednat materiál",
      "Obsadit roli v týmu: mistr",
    ]);
    expect(tasks.find((x) => x.title === "Objednat materiál")!.dueDate).toBe("2027-01-14");
    const [after] = await app.db.select().from(job).where(eq(job.id, target.id));
    expect(after!.templateId).toBe(t.id);
  });

  it("odmítne použít do neprázdného rozpočtu; úkoly se podruhé nezaloží", async () => {
    const u = await boss();
    const { j } = await source(u);
    const t = await run(templateCreateFromJob, u.ctx, { jobId: j.id, name: "Dvakrát" });
    const target = await newJob(u.id);
    await run(templateApply, u.ctx, { jobId: target.id, templateId: t.id });
    await expect(run(templateApply, u.ctx, { jobId: target.id, templateId: t.id })).rejects.toThrow(
      /jen do prázdného rozpočtu/,
    );
    const tasks = await app.db
      .select()
      .from(schema.task)
      .where(eq(schema.task.entityId, target.id));
    expect(tasks).toHaveLength(2);
    // šablona bez rozpočtu (jen úkoly) se na zakázku s templateId podruhé neaplikuje
    const tasksOnly = await run(templateCreateFromJob, u.ctx, {
      jobId: j.id,
      name: "Jen úkoly",
      includeBudget: false,
      includeRoles: false,
    });
    const r2 = await run(templateApply, u.ctx, { jobId: target.id, templateId: tasksOnly.id });
    expect(r2).toMatchObject({ tasks: 0, items: 0 });
  });

  it("do zakázky bez verze založí verzi podle fáze; zamčenou verzi nenaplní", async () => {
    const u = await boss();
    const { j } = await source(u);
    const t = await run(templateCreateFromJob, u.ctx, {
      jobId: j.id,
      name: "Fáze",
      includeTasks: false,
    });
    const inPrep = await newJob(u.id, { phase: "preparation" });
    const res = await api.applyTemplate(u.ctx, inPrep.id, t.id);
    expect(res.items).toBe(2);
    expect((await run(budgetTree, u.ctx, { jobId: inPrep.id })).version!.kind).toBe("realization");
  });

  it("přejmenování, přepsání z jiné zakázky a smazání; oprávnění", async () => {
    const u = await boss();
    const { j } = await source(u);
    const t = await run(templateCreateFromJob, u.ctx, { jobId: j.id, name: "Původní" });
    await run(templateSave, u.ctx, { id: t.id, name: "Přejmenovaná", description: "Popis" });
    expect((await run(templateList, u.ctx, {})).find((x) => x.id === t.id)).toMatchObject({
      name: "Přejmenovaná",
      description: "Popis",
    });
    const empty = await newJob(u.id);
    await expect(
      run(templateCreateFromJob, u.ctx, { jobId: empty.id, name: "Prázdná" }),
    ).rejects.toThrow(UserError);
    const reader = await makeUser(app.db, [
      ["zakazky.read", "all"],
      ["zakazky.economics", "all"],
    ]);
    await expect(run(templateSave, reader.ctx, { id: t.id, name: "Zneužití" })).rejects.toThrow(
      PermissionError,
    );
    await expect(run(templateDelete, reader.ctx, { id: t.id })).rejects.toThrow(PermissionError);
    await run(templateDelete, u.ctx, { id: t.id });
    await expect(run(templateGet, u.ctx, { id: t.id })).rejects.toThrow(NotFoundError);
    await expect(run(templateApply, u.ctx, { jobId: empty.id, templateId: t.id })).rejects.toThrow(
      NotFoundError,
    );
  });

  it("zakázka založená ze šablony (templateId) dostane kostru při vstupu do nabídky", async () => {
    const u = await boss();
    const { j } = await source(u);
    const t = await run(templateCreateFromJob, u.ctx, { jobId: j.id, name: "Při vzniku" });
    const target = await newJob(u.id, { templateId: t.id, startDate: "2027-03-01" });
    const hook = phaseHooks.find((h) => h.id === "budget.offer-entry")!;
    await hook.after!(u.ctx, { ...target } as unknown as Record<string, unknown>, {
      from: "",
      to: "offer",
    });
    const tree = await run(budgetTree, u.ctx, { jobId: target.id });
    expect(tree.objects[0]!.sections[0]!.title).toBe("Elektro");
    const tasks = await app.db
      .select()
      .from(schema.task)
      .where(eq(schema.task.entityId, target.id));
    expect(tasks.map((x) => x.title)).toContain("Objednat materiál");
    // podruhé (nabídka už existuje) se nic nezdvojí
    await hook.after!(u.ctx, { ...target } as unknown as Record<string, unknown>, {
      from: "paused",
      to: "offer",
    });
    expect(
      (await app.db.select().from(schema.task).where(eq(schema.task.entityId, target.id))).length,
    ).toBe(tasks.length);
  });
});
