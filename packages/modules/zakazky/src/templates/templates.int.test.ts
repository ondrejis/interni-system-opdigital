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
import { NotFoundError, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { company } from "@rebar/kontakty/schema";
import { companyEntity, personEntity } from "@rebar/kontakty/server";
import type { ZodType } from "zod";
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
import { templatePayload } from "./payload";

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

/** Zdrojová zakázka: otevřené a hotový úkol a člen týmu s rolí. */
async function source(u: Awaited<ReturnType<typeof boss>>) {
  const j = await newJob(u.id, { startDate: "2026-11-02" });
  await app.db.insert(schema.task).values({
    title: "Objednat materiál",
    assigneeId: u.id,
    dueDate: "2026-11-05",
    entityType: "job",
    entityId: j.id,
  });
  await app.db.insert(schema.task).values({
    title: "Hotový úkol",
    assigneeId: u.id,
    doneAt: new Date(),
    entityType: "job",
    entityId: j.id,
  });
  await app.db.insert(jobMember).values({ jobId: j.id, userId: u.id, role: "mistr" });
  return { j };
}

describe("šablony zakázek", () => {
  it("vytvoří šablonu z otevřených úkolů a rolí týmu; list nevrací obsah, get ho vrací", async () => {
    const u = await boss();
    const { j } = await source(u);
    const t = await run(templateCreateFromJob, u.ctx, {
      jobId: j.id,
      name: "Web",
      description: "Vzor",
    });
    const [row] = await app.db.select().from(jobTemplate).where(eq(jobTemplate.id, t.id));
    const payload = templatePayload.parse(row!.payload);
    expect(payload.tasks.map((x) => x.title)).toEqual(["Objednat materiál"]); // hotový úkol ne
    expect(payload.tasks[0]!.daysFromStart).toBe(3); // 5. 11. − 2. 11.
    expect(payload.roles).toEqual(["mistr"]);
    const list = await run(templateList, u.ctx, {});
    const mine = list.find((x) => x.id === t.id)!;
    expect(mine).toMatchObject({ name: "Web", summary: { tasks: 1, roles: 1 } });
    expect(mine).not.toHaveProperty("payload");
    expect((await run(templateGet, u.ctx, { id: t.id })).payload.tasks).toHaveLength(1);
  });

  it("aplikace šablony: úkoly s termínem od zahájení a role; podruhé se nic nezdvojí", async () => {
    const u = await boss();
    const { j } = await source(u);
    const t = await run(templateCreateFromJob, u.ctx, { jobId: j.id, name: "Vzor" });
    const target = await newJob(u.id, { startDate: "2027-03-01" });
    const res = await run(templateApply, u.ctx, { jobId: target.id, templateId: t.id });
    expect(res).toMatchObject({ tasks: 1, roles: ["mistr"] });
    const tasks = await app.db
      .select()
      .from(schema.task)
      .where(and(eq(schema.task.entityId, target.id), isNull(schema.task.deletedAt)));
    expect(tasks.map((x) => x.title).sort()).toEqual([
      "Objednat materiál",
      "Obsadit roli v týmu: mistr",
    ]);
    expect(tasks.find((x) => x.title === "Objednat materiál")!.dueDate).toBe("2027-03-04");
    const [after] = await app.db.select().from(job).where(eq(job.id, target.id));
    expect(after!.templateId).toBe(t.id);
    // podruhé: úkoly ani role se nezdvojí
    expect(await api.applyTemplate(u.ctx, target.id, t.id)).toMatchObject({ tasks: 0, roles: [] });
    expect(
      (await app.db.select().from(schema.task).where(eq(schema.task.entityId, target.id))).length,
    ).toBe(2);
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
    // oprávnění hlídá brána příkazu (`permission`), ne handler
    for (const c of [templateSave, templateDelete, templateApply, templateCreateFromJob])
      expect(c.permission).toBe("zakazky.write");
    for (const c of [templateList, templateGet]) expect(c.permission).toBe("zakazky.read");
    await run(templateDelete, u.ctx, { id: t.id });
    await expect(run(templateGet, u.ctx, { id: t.id })).rejects.toThrow(NotFoundError);
    await expect(run(templateApply, u.ctx, { jobId: empty.id, templateId: t.id })).rejects.toThrow(
      NotFoundError,
    );
  });
});
