import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditReadScope } from "@rebar/core/audit";
import { addComment, listComments } from "@rebar/core/collab";
import { schema, type Db } from "@rebar/core/db";
import {
  assertAssignable,
  assertEntityAccess,
  createRecord,
  deleteRecord,
  describeEntity,
  getRecord,
  getRecordActivity,
  isPrivateRecord,
  PrivateAssignmentError,
  queryGroups,
  queryRecords,
  recordTitles,
  searchAll,
  setVisibility,
  updateRecord,
  visibleIds,
  visibleRecordTitles,
  aggregateRecords,
} from "@rebar/core/entities";
import { prepareEntityExport } from "@rebar/core/export";
import { NotFoundError, PermissionError, UserError, type Ctx } from "@rebar/core/rbac";
import { connectAppDb } from "@rebar/core/testing";
import {
  canary,
  CANARY_PREFIX,
  hasCanary,
  PRIVATE_AMOUNT_MINOR,
  SHARED_AMOUNT_MINOR,
} from "./support/canary";
import { BUILDABLE, buildPrivateFixture, type PrivateFixture } from "./support/fixture";
import { buildFixture, isolatedDb, type Fixture } from "./support/security-fixture";

/*
  Matice soukromých záznamů (D §5.1, §5.4): každá entita se zámkem × cesty, kterými jádro čte data (seznam, detail,
  součty, skupiny, hledání, komentáře a aktivita, historie, export, popisky), jako `partner` i `owner`. Nová entita
  se `visibility` bez builderu ve `tests/support/fixture.ts` test shodí.
*/

const app = connectAppDb();
let f: Fixture;
let fx: PrivateFixture;
let db: Db;
let discard: () => Promise<void>;
let owner: Ctx;
let partner: Ctx;
const E = (key: string) => fx.resolve(key);

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

const isPrivateFilter = {
  op: "and" as const,
  conditions: [{ attr: "isPrivate", op: "is_true" as const }],
};

describe("soukromé záznamy: úplnost sestavy", () => {
  it("každá entita se zámkem má v sestavě builder (nová entita test shodí)", () => {
    const locked = f.registry
      .all()
      .filter((d) => d.visibility)
      .map((d) => d.key)
      .sort();
    expect(locked).toEqual([...BUILDABLE].sort());
    expect(fx.entities.sort()).toEqual([...BUILDABLE].sort());
  });

  it("role: vlastník má private.read, partner ho nemá", () => {
    expect(owner.actor.permissions.get("private.read")).toBe("all");
    expect(partner.actor.permissions.has("private.read")).toBe(false);
  });
});

describe.each(BUILDABLE)("soukromé záznamy: entita %s", (key) => {
  const sharedId = () => fx.shared[key]!;
  const privId = () => fx.priv[key]!;

  it("seznam: partner nevidí soukromý řádek ani canary, vlastník ano; součty a počty vynechají soukromé", async () => {
    const e = await E(key);
    const ownerPage = await queryRecords(owner, f.registry, e, { limit: 200 });
    const partnerPage = await queryRecords(partner, f.registry, e, { limit: 200 });
    expect(ownerPage.rows.map((r) => r.id)).toContain(privId());
    expect(ownerPage.rows.map((r) => r.id)).toContain(sharedId());
    expect(partnerPage.rows.map((r) => r.id)).not.toContain(privId());
    expect(partnerPage.rows.map((r) => r.id)).toContain(sharedId());
    expect(hasCanary(partnerPage), `${key}: canary v seznamu partnera`).toBe(false);
    expect(hasCanary(ownerPage), `${key}: vlastník canary vidí`).toBe(true);
    const privateCount = (
      await queryRecords(owner, f.registry, e, { filters: isPrivateFilter, limit: 1 })
    ).total;
    expect(privateCount).toBeGreaterThan(0);
    expect(partnerPage.total).toBe(ownerPage.total - privateCount);
    if (key === "payment") {
      expect(partnerPage.totals.amount).toBe(SHARED_AMOUNT_MINOR);
      expect(ownerPage.totals.amount).toBe(SHARED_AMOUNT_MINOR + PRIVATE_AMOUNT_MINOR);
    }
  });

  it("partner nemá filtr ani sloupec „Soukromé“ a nemůže řádky podle něj hledat", async () => {
    const e = await E(key);
    const dOwner = await describeEntity(owner, owner.db, e, f.registry);
    const dPartner = await describeEntity(partner, partner.db, e, f.registry);
    expect(dOwner.attributes.some((a) => a.key === "isPrivate")).toBe(true);
    expect(dPartner.attributes.some((a) => a.key === "isPrivate")).toBe(false);
    await expect(
      queryRecords(partner, f.registry, e, { filters: isPrivateFilter }),
    ).rejects.toThrow();
  });

  it("detail, úprava a smazání cizího soukromého záznamu = NotFoundError", async () => {
    const e = await E(key);
    await expect(getRecord(partner, f.registry, e, privId())).rejects.toThrow(NotFoundError);
    const title = e.def.titleKey;
    const attr = e.attributes.find((a) => a.key === title && !a.readonly && a.type === "text");
    if (attr)
      await expect(
        updateRecord(partner, f.registry, e, privId(), { [title]: "X" }),
      ).rejects.toThrow(NotFoundError);
    await expect(deleteRecord(partner, e, privId())).rejects.toThrow(NotFoundError);
    await expect(getRecord(partner, f.registry, e, sharedId())).resolves.toBeTruthy();
    await expect(getRecord(owner, f.registry, e, privId())).resolves.toBeTruthy();
  });

  it("visibleIds, skupiny a agregace nezahrnou soukromé", async () => {
    const e = await E(key);
    expect(await visibleIds(partner, e)).not.toContain(privId());
    expect(await visibleIds(owner, e)).toContain(privId());
    const d = await describeEntity(owner, owner.db, e, f.registry);
    const groupBy = d.attributes.find(
      (a) =>
        ["status", "select", "user", "checkbox"].includes(a.type) &&
        a.key !== "isPrivate" &&
        a.key !== "visibilitySource",
    );
    if (groupBy) {
      const sum = (g: { count: number }[]) => g.reduce((n, x) => n + x.count, 0);
      const ownerGroups = await queryGroups(owner, e, groupBy.key, {});
      const partnerGroups = await queryGroups(partner, e, groupBy.key, {});
      const privateTotal = (
        await queryRecords(owner, f.registry, e, { filters: isPrivateFilter, limit: 1 })
      ).total;
      expect(sum(partnerGroups)).toBe(sum(ownerGroups) - privateTotal);
    }
    const agg = (ctx: Ctx) => aggregateRecords(ctx, f.registry, e, { fn: "count" });
    const [a, b] = [await agg(owner), await agg(partner)];
    expect(a.total.count - b.total.count).toBeGreaterThan(0);
    expect(b.total.count).toBe((await queryRecords(partner, f.registry, e, { limit: 1 })).total);
  });

  it("hledání: partner soukromý záznam nenajde, vlastník ano (je-li entita hledatelná)", async () => {
    const e = await E(key);
    if (!e.def.search) return;
    const q = CANARY_PREFIX.toLowerCase();
    const ownerHits = await searchAll(owner, f.registry.all(), q, 100);
    const partnerHits = await searchAll(partner, f.registry.all(), q, 100);
    expect(ownerHits.map((h) => h.id)).toContain(privId());
    expect(partnerHits.map((h) => h.id)).not.toContain(privId());
    expect(hasCanary(partnerHits)).toBe(false);
  });

  it("přístup přes politiku (komentáře, aktivita, soubory): soukromý záznam pro partnera neexistuje", async () => {
    await expect(assertEntityAccess(partner, key, privId(), "read")).rejects.toThrow(NotFoundError);
    await expect(assertEntityAccess(owner, key, privId(), "read")).resolves.toMatchObject({
      isPrivate: true,
    });
    await expect(
      addComment(partner, { entityType: key, entityId: privId(), body: "ahoj" }),
    ).rejects.toThrow(NotFoundError);
    const c = await addComment(owner, {
      entityType: key,
      entityId: privId(),
      body: "Soukromý komentář",
    });
    expect(c.id).toBeTruthy();
    await expect(listComments(partner, key, privId())).rejects.toThrow(NotFoundError);
    await expect(getRecordActivity(partner, key, privId())).rejects.toThrow(NotFoundError);
    const act = await getRecordActivity(owner, key, privId());
    expect(act.timeline.length).toBeGreaterThan(0);
  });

  it("historie: záznamy soukromého záznamu (i komentáře) jsou pro partnera skryté, sdílené vidí", async () => {
    const rows = (ctx: Ctx, ids: string[]) =>
      ctx.db
        .select({
          id: schema.auditLog.id,
          entityId: schema.auditLog.entityId,
          p: schema.auditLog.isPrivate,
        })
        .from(schema.auditLog)
        .where(and(inArray(schema.auditLog.entityId, ids), auditReadScope(ctx)));
    const allOwn = await rows(owner, [privId(), sharedId()]);
    const allPartner = await rows(partner, [privId(), sharedId()]);
    expect(allOwn.some((r) => r.entityId === privId())).toBe(true);
    expect(allPartner.some((r) => r.entityId === privId())).toBe(false);
    expect(allPartner.some((r) => r.entityId === sharedId())).toBe(true);
    // všechny řádky soukromého záznamu mají zapsanou kopii zámku
    const raw = await db
      .select({ p: schema.auditLog.isPrivate })
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entityId, privId()));
    expect(raw.length).toBeGreaterThan(0);
    expect(raw.every((r) => r.p)).toBe(true);
    // komentář přidaný vlastníkem k soukromému záznamu: audit komentáře je soukromý
    const comments = await db
      .select({ p: schema.auditLog.isPrivate, c: schema.auditLog.context })
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entityType, "comment"));
    expect(comments.filter((c) => c.c?.entityId === privId()).every((c) => c.p)).toBe(true);
  });

  it("export (CSV) partnera neobsahuje soukromé záznamy, export vlastníka ano", async () => {
    const e = await E(key);
    const text = async (ctx: Ctx) => {
      const out = await prepareEntityExport(ctx, f.registry, e, {
        format: "csv",
        audit: false,
      });
      let s = "";
      for await (const chunk of out.chunks) s += Buffer.from(chunk as Uint8Array).toString("utf8");
      return s;
    };
    const p = await text(partner).catch((err) =>
      err instanceof PermissionError ? "" : Promise.reject(err),
    );
    expect(p).not.toContain(CANARY_PREFIX);
    const o = await text(owner);
    expect(o.length).toBeGreaterThan(0);
  });

  it("názvy záznamů: partner dostane místo soukromého názvu „Soukromý záznam“ nebo nic", async () => {
    const titles = await recordTitles(partner, f.registry, key, [privId(), sharedId()]);
    expect(titles[privId()]).toBe("Soukromý záznam");
    expect(titles[sharedId()]).not.toContain(CANARY_PREFIX);
    expect(await recordTitles(owner, f.registry, key, [privId()])).not.toEqual({
      [privId()]: "Soukromý záznam",
    });
    const visible = await visibleRecordTitles(partner, f.registry, key, [privId(), sharedId()]);
    expect(Object.keys(visible)).not.toContain(privId());
  });

  it("zámek je v private_record a v indexu hledání", async () => {
    expect(await isPrivateRecord(db, key, privId())).toBe(true);
    expect(await isPrivateRecord(db, key, sharedId())).toBe(false);
    const e = await E(key);
    if (e.def.search) {
      const [doc] = await db
        .select({ p: schema.searchDocument.isPrivate })
        .from(schema.searchDocument)
        .where(eq(schema.searchDocument.entityId, privId()));
      expect(doc?.p).toBe(true);
    }
  });
});

describe("soukromé záznamy: vytvoření", () => {
  it("co vytvoří partner, je sdílené; pokus o soukromý záznam je chyba", async () => {
    const e = await E("company");
    const made = await createRecord(partner, f.registry, e, { name: "Firma Patrika" });
    expect(await isPrivateRecord(db, "company", made.row.id)).toBe(false);
    await expect(
      createRecord(partner, f.registry, e, { name: "Tajná", isPrivate: true }),
    ).rejects.toThrow(UserError);
  });

  it("co vytvoří vlastník, je výchozí sdílené; isPrivate: true ho zamkne", async () => {
    const e = await E("company");
    const a = await createRecord(owner, f.registry, e, { name: "Sdílená vlastníkem" });
    const b = await createRecord(owner, f.registry, e, { name: canary("c-b"), isPrivate: true });
    expect(a.row.isPrivate).toBe(false);
    expect(b.row.isPrivate).toBe(true);
    expect(b.row.visibilitySource).toBe("own");
  });

  it("partner nevybere soukromou organizaci jako vazbu a dítě soukromého rodiče je soukromé", async () => {
    const e = await E("job");
    await expect(
      createRecord(partner, f.registry, await E("note"), {
        title: "Poznámka",
        job: fx.parents.privateJob,
      }),
    ).rejects.toThrow(UserError);
    const child = await createRecord(owner, f.registry, await E("note"), {
      title: canary("dite"),
      job: fx.parents.privateJob,
    });
    expect(child.row.isPrivate).toBe(true);
    expect(child.row.visibilitySource).toBe("inherited");
    void e;
  });

  it("platba bez zakázky je vždy soukromá a nejde zveřejnit (R-12)", async () => {
    const e = await E("payment");
    const p = await createRecord(owner, f.registry, e, {
      description: canary("fakturoid"),
      amount: 5_000_00,
    });
    expect(p.row.isPrivate).toBe(true);
    expect(p.row.visibilitySource).toBe("inherited");
    await expect(setVisibility(owner, f.registry, "payment", p.row.id, false)).rejects.toThrow(
      UserError,
    );
    const page = await queryRecords(partner, f.registry, e, { limit: 200 });
    expect(page.rows.map((r) => r.id)).not.toContain(p.row.id);
  });
});

describe("soukromé záznamy: změna viditelnosti a kaskáda", () => {
  async function jobTree() {
    const job = (
      await createRecord(owner, f.registry, await E("job"), {
        title: "Strom zakázka",
        company: (
          await createRecord(owner, f.registry, await E("company"), { name: "Strom firma" })
        ).row.id,
        type: "web",
      })
    ).row.id;
    const task = (
      await createRecord(owner, f.registry, await E("task"), { title: "Strom úkol", job })
    ).row.id;
    const note = (
      await createRecord(owner, f.registry, await E("note"), { title: "Strom poznámka", job })
    ).row.id;
    const time = (
      await createRecord(owner, f.registry, await E("time_entry"), {
        date: "2026-10-05",
        user: f.people.owner.id,
        job,
        minutes: 30,
      })
    ).row.id;
    const pay = (
      await createRecord(owner, f.registry, await E("payment"), {
        description: "Strom platba",
        amount: 100_00,
        job,
      })
    ).row.id;
    return { job, task, note, time, pay };
  }
  const priv = async (key: string, id: string) =>
    (await getRecord(owner, f.registry, await E(key), id)).row.isPrivate;

  it("zamčení zakázky zamkne děti, zveřejnění zveřejní jen zděděné; vlastní zámek dítěte přežije", async () => {
    const t = await jobTree();
    // dítě s vlastním zámkem: poznámka zamčená dřív, než se zamkne zakázka
    await setVisibility(owner, f.registry, "note", t.note, true);
    const r = await setVisibility(owner, f.registry, "job", t.job, true);
    expect(r.changed).toBe(true);
    expect(r.cascaded).toBeGreaterThanOrEqual(3); // úkol, hodiny, platba (poznámka už byla soukromá)
    for (const [k, id] of [
      ["task", t.task],
      ["time_entry", t.time],
      ["payment", t.pay],
      ["note", t.note],
    ] as const)
      expect(await priv(k, id), k).toBe(true);
    // partner nevidí nic z toho
    for (const [k, id] of [
      ["job", t.job],
      ["task", t.task],
      ["time_entry", t.time],
      ["payment", t.pay],
    ] as const)
      await expect(getRecord(partner, f.registry, await E(k), id), k).rejects.toThrow(
        NotFoundError,
      );

    const back = await setVisibility(owner, f.registry, "job", t.job, false);
    expect(back.changed).toBe(true);
    for (const [k, id] of [
      ["task", t.task],
      ["time_entry", t.time],
      ["payment", t.pay],
    ] as const) {
      expect(await priv(k, id), k).toBe(false);
      await expect(getRecord(partner, f.registry, await E(k), id), k).resolves.toBeTruthy();
    }
    // poznámka měla vlastní zámek, zůstává soukromá
    expect(await priv("note", t.note)).toBe(true);
    await expect(getRecord(partner, f.registry, await E("note"), t.note)).rejects.toThrow(
      NotFoundError,
    );
    expect(await isPrivateRecord(db, "note", t.note)).toBe(true);
    expect(await isPrivateRecord(db, "payment", t.pay)).toBe(false);
  });

  it("dítě soukromého rodiče nejde zveřejnit, dokud je soukromý rodič; změna zámku zapíše historii", async () => {
    const t = await jobTree();
    await setVisibility(owner, f.registry, "job", t.job, true);
    await expect(setVisibility(owner, f.registry, "task", t.task, false)).rejects.toThrow(
      UserError,
    );
    await expect(setVisibility(owner, f.registry, "time_entry", t.time, true)).rejects.toThrow(
      UserError,
    ); // bez vlastního zámku
    const hist = await db
      .select({
        a: schema.auditLog.action,
        p: schema.auditLog.isPrivate,
        ch: schema.auditLog.changes,
      })
      .from(schema.auditLog)
      .where(
        and(eq(schema.auditLog.entityId, t.job), eq(schema.auditLog.action, "visibility_changed")),
      );
    expect(hist).toHaveLength(1);
    expect(hist[0]!.p).toBe(true);
    expect(hist[0]!.ch[0]).toMatchObject({ old: false, new: true });
    // po zveřejnění je záznam o zveřejnění sdílený, ale starý záznam o zamčení zůstává skrytý (R-33)
    await setVisibility(owner, f.registry, "job", t.job, false);
    const rows = await db
      .select({ id: schema.auditLog.id, p: schema.auditLog.isPrivate, ch: schema.auditLog.changes })
      .from(schema.auditLog)
      .where(
        and(eq(schema.auditLog.entityId, t.job), eq(schema.auditLog.action, "visibility_changed")),
      );
    expect(rows.map((r) => r.p).sort()).toEqual([false, true]);
    const seen = await db
      .select({ id: schema.auditLog.id })
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.entityId, t.job), auditReadScope(partner)));
    const seenIds = new Set(seen.map((r) => r.id));
    expect(rows.filter((r) => seenIds.has(r.id)).every((r) => !r.p)).toBe(true);
  });

  it("zámek mění jen vlastník", async () => {
    const t = await jobTree();
    await expect(setVisibility(partner, f.registry, "job", t.job, true)).rejects.toThrow(
      PermissionError,
    );
  });

  it("změna rodiče přepočte zděděný zámek (úkol přesunutý pod soukromou zakázku se zamkne)", async () => {
    const t = await jobTree();
    const e = await E("task");
    const moved = await updateRecord(owner, f.registry, e, t.task, { job: fx.parents.privateJob });
    expect(moved.row.isPrivate).toBe(true);
    expect(moved.row.visibilitySource).toBe("inherited");
    const back = await updateRecord(owner, f.registry, e, t.task, { job: t.job });
    expect(back.row.isPrivate).toBe(false);
  });

  it("soukromý záznam nejde přiřadit uživateli bez private.read (VID-06)", async () => {
    const e = await E("task");
    const t = await createRecord(owner, f.registry, e, {
      title: canary("prirazeni"),
      isPrivate: true,
    });
    await expect(
      assertAssignable(owner, "task", t.row.id, f.people.partner.id),
    ).rejects.toBeInstanceOf(PrivateAssignmentError);
    await expect(
      assertAssignable(owner, "task", t.row.id, f.people.owner.id),
    ).resolves.toBeUndefined();
    await expect(
      assertAssignable(owner, "task", fx.shared.task!, f.people.partner.id),
    ).resolves.toBeUndefined();
    await expect(assertAssignable(partner, "task", t.row.id, f.people.partner.id)).rejects.toThrow(
      NotFoundError,
    );
    try {
      await assertAssignable(owner, "task", t.row.id, f.people.partner.id);
    } catch (err) {
      expect((err as PrivateAssignmentError).code).toBe("private_assign");
    }
  });
});

describe("soukromé záznamy: popisky odkazů", () => {
  it("odkaz sdíleného záznamu na soukromý (obchod → soukromá firma) se partnerovi ukáže jako „Soukromý záznam“", async () => {
    const e = await E("deal");
    const privCompany = await createRecord(owner, f.registry, await E("company"), {
      name: canary("popisek"),
      isPrivate: true,
    });
    const stage = (await queryRecords(owner, f.registry, e, { limit: 1 })).rows[0]!
      .status as string;
    const deal = await createRecord(owner, f.registry, e, {
      title: "Obchod se soukromou firmou",
      company: privCompany.row.id,
      status: stage,
    });
    expect(deal.row.isPrivate).toBe(false); // R-31: soukromá organizace nedědí do obchodů
    const seen = await getRecord(partner, f.registry, e, deal.row.id);
    expect(seen.labels.company?.[privCompany.row.id]?.label).toBe("Soukromý záznam");
    expect(hasCanary(seen)).toBe(false);
    const list = await queryRecords(partner, f.registry, e, { limit: 200 });
    expect(hasCanary(list)).toBe(false);
    const mine = await getRecord(owner, f.registry, e, deal.row.id);
    expect(mine.labels.company?.[privCompany.row.id]?.label).toContain(CANARY_PREFIX);
    // v historii obchodu je popisek soukromé firmy zamaskovaný pro všechny (historii čte i partner)
    const audit = await db
      .select({ ch: schema.auditLog.changes })
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entityId, deal.row.id));
    expect(hasCanary(audit)).toBe(false);
  });
});
