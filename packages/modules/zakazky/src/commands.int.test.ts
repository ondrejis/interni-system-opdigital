import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensurePipeline, getPipeline } from "@rebar/core/config-data";
import {
  clearEntityPolicies,
  createEntityRegistry,
  registerEntityPolicies,
  type EntityRegistry,
} from "@rebar/core/entities";
import type { ModuleDeps } from "@rebar/core/module-server";
import { ensureSeries } from "@rebar/core/numbering";
import { NotFoundError, PermissionError } from "@rebar/core/rbac";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { company } from "@rebar/kontakty/schema";
import { companyEntity, personEntity } from "@rebar/kontakty/server";
import { teamAdd, teamList, teamRemove } from "./commands";
import { manifest } from "./index";
import { job } from "./schema";
import { jobEntity } from "./server";

const app = connectAppDb();
afterAll(() => app.close());

let registry: EntityRegistry;
const deps = () =>
  ({
    registry,
    baseURL: "http://localhost",
    calendarLayers: [],
  }) as unknown as ModuleDeps;

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
    ["kontakty.read", "all"],
  ]);

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
      title: "Koupelna",
      companyId: c!.id,
      stageId: stage.id,
      valueMinor: 1_000_000_00,
      managerId: managerId ?? null,
    })
    .returning();
  return j!;
}

describe("oprávnění a tým", () => {
  it("uživatel s rozsahem „jen moje“ vidí jen zakázku, kde je členem týmu; tým spravuje jen zapisující", async () => {
    const owner = await boss();
    const mine = await newJob(owner.id);
    const other = await newJob(owner.id);
    const montér = await makeUser(app.db, [["zakazky.read", "own"]]);
    // cizí zakázku nevidí vůbec (tváří se jako neexistující)
    await expect(teamList.handler(montér.ctx, { jobId: mine.id }, deps())).rejects.toThrow(
      NotFoundError,
    );

    await teamAdd.handler(owner.ctx, { jobId: mine.id, userId: montér.id, role: "montér" }, deps());
    // člen týmu zakázku vidí
    const team = await teamList.handler(montér.ctx, { jobId: mine.id }, deps());
    expect(team.members.map((m) => [m.userId, m.role])).toEqual([[montér.id, "montér"]]);
    await expect(teamList.handler(montér.ctx, { jobId: other.id }, deps())).rejects.toThrow(
      NotFoundError,
    );
    await expect(
      teamRemove.handler(montér.ctx, { jobId: mine.id, userId: montér.id }, deps()),
    ).rejects.toThrow(PermissionError);
    await teamRemove.handler(owner.ctx, { jobId: mine.id, userId: montér.id }, deps());
    await expect(teamList.handler(montér.ctx, { jobId: mine.id }, deps())).rejects.toThrow(
      NotFoundError,
    );
  });
});
