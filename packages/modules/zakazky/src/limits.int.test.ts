import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensurePipeline } from "@rebar/core/config-data";
import { newId, schema } from "@rebar/core/db";
import {
  clearEntityPolicies,
  createEntityRegistry,
  createRecord,
  registerEntityPolicies,
  resolveEntity,
  updateRecord,
  type EntityRegistry,
  type ResolvedEntity,
} from "@rebar/core/entities";
import { ensureSeries } from "@rebar/core/numbering";
import { createCtx, loadActor, UserError } from "@rebar/core/rbac";
import { connectAppDb, uniqueEmail } from "@rebar/core/testing";
import { company } from "@rebar/kontakty/schema";
import { companyEntity, personEntity } from "@rebar/kontakty/server";
import { manifest } from "./index";
import { jobEntity } from "./server";

/** Meze číselných atributů: záporná cena, zádržné přes 100 %, nesmyslná souřadnice vrátí českou větu, ne obecnou chybu. */
const app = connectAppDb();
afterAll(() => app.close());

let registry: EntityRegistry;
let jobE: ResolvedEntity;

beforeAll(async () => {
  clearEntityPolicies();
  registry = createEntityRegistry([companyEntity, personEntity, jobEntity]);
  registerEntityPolicies(registry);
  for (const p of manifest.seed!.pipelines!) await ensurePipeline(app.db, p);
  await ensureSeries(app.db, manifest.seed!.series!);
  jobE = await resolveEntity(app.db, jobEntity);
});

async function boss() {
  const [role] = await app.db
    .insert(schema.role)
    .values({ key: `r-${newId().slice(-8)}`, name: "R" })
    .returning();
  await app.db.insert(schema.rolePermission).values(
    ["zakazky.read", "zakazky.write", "zakazky.economics", "kontakty.read"].map((permission) => ({
      roleId: role!.id,
      permission,
      scope: "all" as const,
    })),
  );
  const [user] = await app.db
    .insert(schema.user)
    .values({ name: "Test", email: uniqueEmail(), roleId: role!.id })
    .returning();
  return createCtx(app.db, (await loadActor(app.db, user!.id))!);
}

describe("meze číselných atributů zakázky", () => {
  it("záporná cena, zádržné nad 100 % a souřadnice mimo rozsah se odmítnou s větou", async () => {
    const ctx = await boss();
    const [c] = await app.db
      .insert(company)
      .values({ name: `Meze ${randomBytes(3).toString("hex")}` })
      .returning();
    const base = { title: "Meze", company: c!.id };

    await expect(createRecord(ctx, registry, jobE, { ...base, value: -500_000 })).rejects.toThrow(
      /Původní smluvní cena.*nesmí být záporné/,
    );
    await expect(
      createRecord(ctx, registry, jobE, { ...base, retentionBp: 20_000 }),
    ).rejects.toThrow(/Zádržné.*nesmí být větší/);
    await expect(createRecord(ctx, registry, jobE, { ...base, siteLat: 123 })).rejects.toThrow(
      UserError,
    );

    const ok = await createRecord(ctx, registry, jobE, {
      ...base,
      value: 123_456_789,
      retentionBp: 500,
      siteLat: 49.74,
    });
    expect(ok.row.value).toBe(123_456_789);
    // totéž při úpravě
    await expect(updateRecord(ctx, registry, jobE, ok.row.id, { value: -1 })).rejects.toThrow(
      /nesmí být záporné/,
    );
  });
});
