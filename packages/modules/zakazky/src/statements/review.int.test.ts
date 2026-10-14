import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
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
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { company } from "@rebar/kontakty/schema";
import { companyEntity, personEntity } from "@rebar/kontakty/server";
import { manifest } from "../index";
import { budgetItem, budgetObject, budgetSection, budgetVersion, job } from "../schema";
import { jobEntity } from "../server";
import * as statementsApi from "./api";
import { create, decide, lineSet, submit } from "./commands";
import "./index";

/** Nezávislý review (vlna C): faktura ze soupisu se musí shodovat se schválenou částkou i po změně rozpočtu. */
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

describe("faktura ze soupisu po změně rozpočtu", () => {
  it("cena položky změněná po schválení soupisu nevyrobí podklad, který nesedí se schválenou částkou", async () => {
    const u = await makeUser(app.db, perms);
    const bs = await makeUser(app.db, [
      ...perms,
      ["zakazky.approve", "all"],
      ["zakazky.approve_all", "all"],
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
    await decide.handler(bs.ctx, { id, approve: true }, deps());

    // rozpočet (rozpracovaný) se po schválení soupisu přecení
    await app.db
      .update(budgetItem)
      .set({ unitPriceMinor: 500_00 })
      .where(eq(budgetItem.id, item!.id));

    await expect(statementsApi.createInvoiceDraft(u.ctx, id)).rejects.toThrow(
      /se v rozpočtu od schválení soupisu změnila/,
    );

    // po návratu ceny je podklad v pořádku a sedí se schválenou částkou
    await app.db
      .update(budgetItem)
      .set({ unitPriceMinor: 400_00 })
      .where(eq(budgetItem.id, item!.id));
    const p = await statementsApi.createInvoiceDraft(u.ctx, id);
    expect(p.lines.reduce((a, l) => a + l.amountMinor, 0) - p.reductionMinor).toBe(p.approvedMinor);
  });
});
