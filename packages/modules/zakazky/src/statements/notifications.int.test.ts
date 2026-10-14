import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensurePipeline, getPipeline } from "@rebar/core/config-data";
import { schema } from "@rebar/core/db";
import {
  clearEntityPolicies,
  createEntityRegistry,
  registerEntityPolicies,
  type EntityRegistry,
} from "@rebar/core/entities";
import type { ModuleDeps } from "@rebar/core/module-server";
import { ensureSeries } from "@rebar/core/numbering";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { company } from "@rebar/kontakty/schema";
import { companyEntity, personEntity } from "@rebar/kontakty/server";
import { manifest } from "../index";
import { budgetItem, budgetObject, budgetSection, budgetVersion, job, jobMember } from "../schema";
import { jobEntity } from "../server";
import { create, decide, lineSet, submit } from "./commands";
import "./index";

/** Upozornění při schválení a zamítnutí soupisu prací: příjemci, text, odkaz a ochrana částek. */
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

beforeAll(async () => {
  clearEntityPolicies();
  registry = createEntityRegistry([companyEntity, personEntity, jobEntity]);
  registerEntityPolicies(registry);
  for (const p of manifest.seed.pipelines) await ensurePipeline(app.db, p);
  await ensureSeries(app.db, manifest.seed.series);
});

const perms: [string, "all" | "own"][] = [
  ["zakazky.read", "all"],
  ["zakazky.write", "all"],
  ["zakazky.economics", "all"],
  ["kontakty.read", "all"],
];

/** Upozornění uživatele k dané zakázce (sdílená databáze: jiné testy vyvolávají fakturantovi cizí upozornění). */
const notesOf = async (userId: string, jobId: string) =>
  (
    await app.db.select().from(schema.notification).where(eq(schema.notification.userId, userId))
  ).filter((n) => n.entityId === jobId);

/** Zakázka s rozpočtem a rozpracovaným soupisem (20 m2 po 400 Kč = 8 000 Kč), ten je odeslaný ke schválení. */
async function submittedStatement() {
  const u = await makeUser(app.db, perms);
  const approver = await makeUser(app.db, [
    ...perms,
    ["zakazky.approve", "all"],
    ["zakazky.approve_all", "all"],
  ]);
  const montér = await makeUser(app.db, [["zakazky.read", "own"]]);
  const fakturant = await makeUser(app.db, [
    ["zakazky.read", "all"],
    ["fakturace.read", "all"],
    ["fakturace.write", "all"],
  ]);
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
      managerId: u.id,
    })
    .returning();
  await app.db.insert(jobMember).values({ jobId: j!.id, userId: montér.id });
  const [v] = await app.db
    .insert(budgetVersion)
    .values({ jobId: j!.id, kind: "realization", number: 1 })
    .returning();
  const [o] = await app.db
    .insert(budgetObject)
    .values({ versionId: v!.id, title: "SO 01" })
    .returning();
  const [s] = await app.db
    .insert(budgetSection)
    .values({ versionId: v!.id, objectId: o!.id, title: "Omítky" })
    .returning();
  const [item] = await app.db
    .insert(budgetItem)
    .values({
      versionId: v!.id,
      sectionId: s!.id,
      title: "Omítky",
      unit: "m2",
      quantity: "50",
      unitPriceMinor: 400_00,
      unitCostMinor: 250_00,
    })
    .returning();
  const { id } = await create.handler(
    u.ctx,
    { jobId: j!.id, periodFrom: "2026-10-01", periodTo: "2026-10-31" },
    deps(),
  );
  await lineSet.handler(
    u.ctx,
    { statementId: id, lines: [{ itemId: item!.id, quantityPeriod: "20" }] },
    deps(),
  );
  await submit.handler(u.ctx, { id }, deps());
  return { u, approver, montér, fakturant, job: j!, id };
}

describe("upozornění na soupis prací", () => {
  it("schválení: tým i fakturace se dozví, k fakturaci vidí částku jen ten, kdo smí vidět peníze", async () => {
    const t = await submittedStatement();
    await decide.handler(t.approver.ctx, { id: t.id, approve: true }, deps());

    for (const who of [t.u, t.fakturant]) {
      const n = (await notesOf(who.id, t.job.id)).find((x) => x.kind === "job.statement.approved")!;
      expect(n.title).toBe(`${t.job.number}: soupis č. 1 je schválený`);
      expect(n.body).toMatch(/^K fakturaci: 8\s000\s/);
      expect(n.url).toBe(`/zakazky/${t.job.id}?tab=fakturace`);
    }
    const m = (await notesOf(t.montér.id, t.job.id)).find(
      (x) => x.kind === "job.statement.approved",
    )!;
    expect(m.title).toBe(`${t.job.number}: soupis č. 1 je schválený`);
    expect(m.body).toBeNull();
    // aktér (schvalovatel) se neupozorňuje
    expect(
      (await notesOf(t.approver.id, t.job.id)).some((x) => x.kind.startsWith("job.statement")),
    ).toBe(false);
  });

  it("zamítnutí: tým dostane důvod, fakturace ne (zamítnutý soupis se nefakturuje)", async () => {
    const t = await submittedStatement();
    await decide.handler(
      t.approver.ctx,
      { id: t.id, approve: false, comment: "Nesedí množství" },
      deps(),
    );

    for (const who of [t.u, t.montér]) {
      const n = (await notesOf(who.id, t.job.id)).find((x) => x.kind === "job.statement.rejected")!;
      expect(n.title).toBe(`${t.job.number}: zamítnutý soupis č. 1`);
      expect(n.body).toBe("Nesedí množství");
      expect(n.url).toBe(`/zakazky/${t.job.id}?tab=fakturace`);
    }
    expect(
      (await notesOf(t.fakturant.id, t.job.id)).some((x) => x.kind === "job.statement.rejected"),
    ).toBe(false);
  });
});
