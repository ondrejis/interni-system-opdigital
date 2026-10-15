import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@rebar/core/db";
import {
  createRecord,
  deleteRecord,
  getRecord,
  queryRecords,
  restoreRecord,
  type ResolvedEntity,
} from "@rebar/core/entities";
import { NotFoundError, PermissionError, UserError, type Ctx } from "@rebar/core/rbac";
import { connectAppDb } from "@rebar/core/testing";
import { listTrash, purgeExpiredTrash, purgeRecord } from "@rebar/core/trash";
import { job as jobTable } from "@rebar/zakazky/schema";
import { note as noteTable } from "@rebar/ukoly/schema";
import { buildPrivateFixture, type PrivateFixture } from "./support/fixture";
import { buildFixture, isolatedDb, type Fixture } from "./support/security-fixture";

/*
  Koš (SPOL-14, HIS-04): smazání je měkké a kaskádové (jedna dávka), obnova vrací celou dávku, koš ukazuje jen kořeny,
  partner vidí jen své nesoukromé, trvalé smazání jen s `trash.purge`, po 30 dnech maže úklid.
*/
const app = connectAppDb();
let f: Fixture;
let fx: PrivateFixture;
let db: Db;
let discard: () => Promise<void>;
let owner: Ctx;
let partner: Ctx;
const E = (k: string): Promise<ResolvedEntity> => fx.resolve(k);

beforeAll(async () => {
  ({ db, discard } = await isolatedDb(app.db));
  f = await buildFixture(db);
  fx = await buildPrivateFixture(f, db);
  owner = f.people.owner.ctx;
  partner = f.people.partner.ctx;
}, 120_000);
afterAll(async () => {
  await discard();
  await app.close();
});

async function tree(ctx: Ctx) {
  const company = (await createRecord(ctx, f.registry, await E("company"), { name: "Koš firma" }))
    .row.id;
  const job = (
    await createRecord(ctx, f.registry, await E("job"), {
      title: "Koš zakázka",
      company,
      type: "web",
    })
  ).row.id;
  const note = (
    await createRecord(ctx, f.registry, await E("note"), { title: "Koš poznámka", job })
  ).row.id;
  const pay = (
    await createRecord(ctx, f.registry, await E("payment"), {
      description: "Koš platba",
      amount: 100,
      job,
    })
  ).row.id;
  return { job, note, pay };
}
const exists = async (key: string, ctx: Ctx, id: string) =>
  getRecord(ctx, f.registry, await E(key), id).then(
    () => true,
    () => false,
  );

describe("koš", () => {
  it("smazání zakázky smaže i děti jednou dávkou; obnova vrátí všechno", async () => {
    const t = await tree(owner);
    await deleteRecord(owner, await E("job"), t.job);
    for (const [k, id] of [
      ["job", t.job],
      ["note", t.note],
      ["payment", t.pay],
    ] as const)
      expect(await exists(k, owner, id), k).toBe(false);
    const [n] = await db.select().from(noteTable).where(eq(noteTable.id, t.note));
    expect(n!.deletedBatch).toBe(t.job);
    expect(n!.deletedBy).toBe(f.people.owner.id);
    const trash = await listTrash(owner, f.registry, { q: "Koš zakázka" });
    expect(trash.items).toHaveLength(1);
    expect(trash.items[0]).toMatchObject({
      entityType: "job",
      id: t.job,
      children: 2,
      daysLeft: 30,
    });
    await restoreRecord(owner, await E("job"), t.job);
    for (const [k, id] of [
      ["job", t.job],
      ["note", t.note],
      ["payment", t.pay],
    ] as const)
      expect(await exists(k, owner, id), k).toBe(true);
    expect((await listTrash(owner, f.registry, { q: "Koš zakázka" })).items).toHaveLength(0);
  });

  it("dítě smazané s rodičem nejde obnovit samo; dítě smazané samostatně ano", async () => {
    const t = await tree(owner);
    await deleteRecord(owner, await E("note"), t.note);
    await deleteRecord(owner, await E("job"), t.job);
    await expect(restoreRecord(owner, await E("note"), t.note)).rejects.toThrow(UserError);
    await restoreRecord(owner, await E("job"), t.job);
    // poznámka byla smazaná dřív, jinou dávkou: zůstává v koši
    expect(await exists("note", owner, t.note)).toBe(false);
    await restoreRecord(owner, await E("note"), t.note);
    expect(await exists("note", owner, t.note)).toBe(true);
  });

  it("partner vidí v koši jen své nesoukromé; soukromé nevidí a neobnoví", async () => {
    const mine = {
      job: (await createRecord(partner, f.registry, await E("task"), { title: "Úkol Patrika" })).row
        .id,
    };
    const theirs = await tree(owner);
    const priv = (
      await createRecord(owner, f.registry, await E("company"), {
        name: "Tajná v koši",
        isPrivate: true,
      })
    ).row.id;
    await deleteRecord(partner, await E("task"), mine.job);
    await deleteRecord(owner, await E("job"), theirs.job);
    await deleteRecord(owner, await E("company"), priv);
    const p = (await listTrash(partner, f.registry)).items.map((i) => i.id);
    expect(p).toContain(mine.job);
    expect(p).not.toContain(theirs.job);
    expect(p).not.toContain(priv);
    const o = (await listTrash(owner, f.registry)).items.map((i) => i.id);
    expect(o).toEqual(expect.arrayContaining([mine.job, theirs.job, priv]));
    await expect(restoreRecord(partner, await E("company"), priv)).rejects.toThrow(NotFoundError);
    await restoreRecord(partner, await E("task"), mine.job);
    expect(await exists("task", partner, mine.job)).toBe(true);
  });

  it("trvalé smazání jen s trash.purge a jen záznam z koše", async () => {
    const t = await tree(owner);
    await expect(purgeRecord(owner, f.registry, "job", t.job)).rejects.toThrow(NotFoundError);
    await deleteRecord(owner, await E("job"), t.job);
    await expect(purgeRecord(partner, f.registry, "job", t.job)).rejects.toThrow(PermissionError);
    await purgeRecord(owner, f.registry, "job", t.job);
    expect(await db.select().from(jobTable).where(eq(jobTable.id, t.job))).toHaveLength(0);
    expect(await db.select().from(noteTable).where(eq(noteTable.id, t.note))).toHaveLength(0);
  });

  it("úklid smaže po 30 dnech kořeny i děti, mladší nechá", async () => {
    const old = await tree(owner);
    const young = await tree(owner);
    await deleteRecord(owner, await E("job"), old.job);
    await deleteRecord(owner, await E("job"), young.job);
    const ago = new Date(Date.now() - 31 * 86_400_000);
    await db.update(jobTable).set({ deletedAt: ago }).where(eq(jobTable.id, old.job));
    await db.update(noteTable).set({ deletedAt: ago }).where(eq(noteTable.id, old.note));
    const n = await purgeExpiredTrash(owner, f.registry);
    expect(n).toBeGreaterThanOrEqual(1);
    expect(await db.select().from(jobTable).where(eq(jobTable.id, old.job))).toHaveLength(0);
    expect(await db.select().from(noteTable).where(eq(noteTable.id, old.note))).toHaveLength(0);
    expect(await db.select().from(jobTable).where(eq(jobTable.id, young.job))).toHaveLength(1);
  });

  it("smazané záznamy nejsou v seznamu ani v hledání", async () => {
    const t = await tree(owner);
    await deleteRecord(owner, await E("job"), t.job);
    const page = await queryRecords(owner, f.registry, await E("job"), { limit: 200 });
    expect(page.rows.map((r) => r.id)).not.toContain(t.job);
  });
});
