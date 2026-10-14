import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@rebar/core/db";
import {
  applyEntityExtensions,
  clearEntityPolicies,
  createEntityRegistry,
  createRecord,
  extendEntity,
  registerEntityPolicies,
  resolveEntity,
  updateRecord,
  writeSystemFields,
  type EntityRegistry,
  type ResolvedEntity,
} from "@rebar/core/entities";
import { NotFoundError, UserError } from "@rebar/core/rbac";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { company } from "@rebar/kontakty/schema";
import { companyEntity } from "@rebar/kontakty/server";

/*
  Platformní kontrakty kostry S0 nad skutečnou databází: `writeSystemFields` (deklarovaná systémová pole, audit,
  reindex) a `extendEntity` (háček cizího modulu u entity `company` se vyvolá přes engine).
*/
const app = connectAppDb();
afterAll(() => app.close());

const changed: { before: string | null; after: string | null }[] = [];
let registry: EntityRegistry;
let resolved: ResolvedEntity;

beforeAll(async () => {
  clearEntityPolicies();
  const [def] = applyEntityExtensions([
    { ...companyEntity, systemFields: ["aresCheckedAt"] },
    extendEntity("company", {
      afterUpdate: async (_ctx, before, after) => {
        changed.push({ before: before.name as string, after: after.name as string });
      },
    }),
  ]);
  registry = createEntityRegistry([def!]);
  registerEntityPolicies(registry);
  resolved = await resolveEntity(app.db, def!);
});

const boss = () =>
  makeUser(app.db, [
    ["kontakty.read", "all"],
    ["kontakty.write", "all"],
  ]);

describe("extendEntity", () => {
  it("háček rozšíření se vyvolá při změně záznamu přes engine", async () => {
    const u = await boss();
    const { row } = await createRecord(u.ctx, registry, resolved, { name: "Stará s.r.o." });
    await updateRecord(u.ctx, registry, resolved, row.id, { name: "Nová s.r.o." });
    expect(changed).toContainEqual({ before: "Stará s.r.o.", after: "Nová s.r.o." });
  });
});

describe("writeSystemFields", () => {
  it("zapíše deklarované systémové pole (vlastností i názvem sloupce), zaauditují se a vrátí, zda se hodnota změnila", async () => {
    const u = await boss();
    const { row } = await createRecord(u.ctx, registry, resolved, { name: "Disk s.r.o." });
    const at = new Date("2026-10-14T10:00:00Z");
    expect(
      await app.db.transaction((tx) =>
        writeSystemFields({ ...u.ctx, db: tx }, registry, "company", row.id, { aresCheckedAt: at }),
      ),
    ).toBe(true);
    const [after] = await app.db.select().from(company).where(eq(company.id, row.id));
    expect(after!.aresCheckedAt?.toISOString()).toBe(at.toISOString());
    // stejná hodnota podruhé (a zápis snake_case názvem) nic nemění
    expect(
      await app.db.transaction((tx) =>
        writeSystemFields({ ...u.ctx, db: tx }, registry, "company", row.id, {
          ares_checked_at: at,
        }),
      ),
    ).toBe(false);
    const audit = await app.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entityId, row.id));
    const written = audit.find((a) => a.summary?.startsWith("Systémová pole"));
    expect(written?.changes.map((c) => c.field)).toEqual(["aresCheckedAt"]);
  });

  it("odmítne sloupec, který není deklarovaný jako systémový, i neexistující sloupec", async () => {
    const u = await boss();
    const { row } = await createRecord(u.ctx, registry, resolved, { name: "Cizí s.r.o." });
    const write = (patch: Record<string, unknown>) =>
      app.db.transaction((tx) =>
        writeSystemFields({ ...u.ctx, db: tx }, registry, "company", row.id, patch),
      );
    await expect(write({ name: "Hacknuto" })).rejects.toBeInstanceOf(UserError);
    await expect(write({ neexistuje: 1 })).rejects.toBeInstanceOf(UserError);
  });

  it("neznámý záznam je NotFoundError; chybí-li entita v registru (modul vypnutý), nic se nestane", async () => {
    const u = await boss();
    await expect(
      app.db.transaction((tx) =>
        writeSystemFields({ ...u.ctx, db: tx }, registry, "company", crypto.randomUUID(), {
          aresCheckedAt: new Date(),
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(
      await writeSystemFields(u.ctx, registry, "deal", crypto.randomUUID(), { nextTaskId: "x" }),
    ).toBe(false);
  });
});
