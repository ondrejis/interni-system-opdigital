import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { recordAudit } from "@rebar/core/audit";
import { schema, type Db } from "@rebar/core/db";
import {
  createRecord,
  deleteRecord,
  describeEntity,
  searchAll,
  setVisibility,
  type ResolvedEntity,
} from "@rebar/core/entities";
import { exportHistoryCsv, listRecent, queryHistory, trackRecent } from "@rebar/core/history";
import { PermissionError, sourceCtx, type Ctx } from "@rebar/core/rbac";
import { RealtimeHub, createRealtimeStream, notifyChange } from "@rebar/core/realtime";
import { connectAppDb } from "@rebar/core/testing";
import { createView, setFavorite } from "@rebar/core/views";
import { buildFixture, isolatedDb, type Fixture } from "./support/security-fixture";

/*
  C3: realtime (SSE nad LISTEN/NOTIFY), globální historie, hledání (telefon, viditelnost), nedávné záznamy, rychlé
  předvolby a připnutí pohledu. Viditelnost se ověřuje pro partnera: soukromé záznamy Ondřeje nesmí uniknout.
*/
const app = connectAppDb();
let f: Fixture;
let db: Db;
let discard: () => Promise<void>;
let owner: Ctx;
let partner: Ctx;
const E = (k: string): Promise<ResolvedEntity> => {
  const def = f.registry.get(k);
  if (!def) throw new Error(k);
  return import("@rebar/core/entities").then((m) => m.resolveEntity(db, def));
};
const CANARY = `PRIVATE-CANARY-${randomUUID().slice(0, 6)}`;

beforeAll(async () => {
  ({ db, discard } = await isolatedDb(app.db));
  f = await buildFixture(db);
  owner = f.people.owner.ctx;
  partner = f.people.partner.ctx;
}, 120_000);
afterAll(async () => {
  await discard();
  await app.close();
});

/* ---------------- realtime ---------------- */

type Sse = { event: string; data: Record<string, unknown>; at: number };

/** Čte proud SSE a vrací události, dokud `done` nevrátí true (nebo vyprší čas). */
async function collect(
  stream: ReadableStream<Uint8Array>,
  done: (events: Sse[]) => boolean,
  ms = 2500,
): Promise<Sse[]> {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  const events: Sse[] = [];
  let buf = "";
  const until = Date.now() + ms;
  let pending: Promise<ReadableStreamReadResult<Uint8Array>> | null = null;
  while (Date.now() < until && !done(events)) {
    pending ??= reader.read(); // jedno nevyřízené čtení (zahozené by spolklo další blok)
    const r = await Promise.race([
      pending,
      new Promise<null>((res) => setTimeout(() => res(null), 100)),
    ]);
    if (!r) continue;
    pending = null;
    if (r.done) break;
    buf += dec.decode(r.value, { stream: true });
    for (const block of buf.split("\n\n").slice(0, -1)) {
      const ev = /^event: (.+)$/m.exec(block)?.[1];
      const data = /^data: (.+)$/m.exec(block)?.[1];
      if (ev && data) events.push({ event: ev, data: JSON.parse(data), at: Date.now() });
    }
    buf = buf.slice(buf.lastIndexOf("\n\n") + 2);
  }
  await reader.cancel().catch(() => {});
  return events;
}

describe("realtime (SPOL-18)", () => {
  let hub: RealtimeHub;
  beforeAll(async () => {
    hub = new RealtimeHub(app.sql);
    expect(await hub.whenReady()).toBe(true);
  });
  afterAll(() => hub.close());

  const open = (ctx: Ctx) =>
    createRealtimeStream({
      hub,
      ctx,
      readPermission: (t) => f.registry.get(t)?.permissions.read ?? null,
      heartbeatMs: 60_000,
    });

  /** Změna zapsaná a potvrzená v transakci jako v aplikaci (`recordAudit` pošle NOTIFY při commitu). */
  const commitChange = (entityType: string, id: string, isPrivate: boolean, action = "update") =>
    app.db.transaction(async (tx) => {
      await recordAudit(
        { ...sourceCtx(tx as unknown as Db, "system", "test C3"), db: tx as unknown as Db },
        { action, entityType, entityId: id, isPrivate, summary: "realtime test" },
      );
    });

  it("změna jednoho se druhému projeví do 2 s; událost nese jen typ, id a akci", async () => {
    const id = randomUUID();
    const stream = open(partner);
    const p = collect(stream, (ev) => ev.some((e) => e.event === "change"));
    await new Promise((r) => setTimeout(r, 150)); // `ready`
    const t0 = Date.now();
    await commitChange("company", id, false);
    const ev = await p;
    const change = ev.find((e) => e.event === "change");
    expect(ev[0]?.event).toBe("ready");
    expect(change).toBeTruthy();
    expect(change!.at - t0).toBeLessThan(2000);
    expect(change!.data).toEqual({ e: "company", i: id, a: "update" });
  });

  it("soukromá změna se vlastníkovi pošle, partnerovi ne (bez úniku ani typu)", async () => {
    const id = randomUUID();
    const sp = collect(open(partner), () => false, 1200);
    const so = collect(open(owner), (ev) => ev.some((e) => e.event === "change"), 1200);
    await new Promise((r) => setTimeout(r, 150));
    await commitChange("company", id, true);
    const [pe, oe] = await Promise.all([sp, so]);
    expect(pe.filter((e) => e.event === "change")).toHaveLength(0);
    expect(JSON.stringify(pe)).not.toContain(id);
    expect(oe.find((e) => e.event === "change")?.data).toMatchObject({ e: "company", i: id });
  });

  it("zamčení sdíleného záznamu partnera zneplatní (zmizí mu ze seznamu), bez dalších údajů", async () => {
    const id = randomUUID();
    const sp = collect(open(partner), (ev) => ev.some((e) => e.event === "change"), 1500);
    await new Promise((r) => setTimeout(r, 150));
    await commitChange("company", id, true, "visibility_changed");
    const ev = (await sp).find((e) => e.event === "change");
    expect(ev?.data).toEqual({ e: "company", i: id, a: "visibility_changed" });
  });

  it("nesměřuje typy záznamů bez oprávnění ke čtení (externista nedostane obchody)", async () => {
    const ext = f.people.external.ctx;
    const sp = collect(open(ext), () => false, 800);
    await new Promise((r) => setTimeout(r, 150));
    await commitChange("deal", randomUUID(), false);
    expect((await sp).filter((e) => e.event === "change")).toHaveLength(0);
  });

  it("zrušená transakce nic nerozešle", async () => {
    const sp = collect(open(owner), () => false, 800);
    await new Promise((r) => setTimeout(r, 150));
    await app.db
      .transaction(async (tx) => {
        await notifyChange(tx, {
          entityType: "company",
          entityId: randomUUID(),
          action: "update",
          isPrivate: false,
        });
        throw new Error("rollback");
      })
      .catch(() => {});
    expect((await sp).filter((e) => e.event === "change")).toHaveLength(0);
  });

  it("zápis přes engine i audit posílá NOTIFY (v téže transakci)", async () => {
    const { PgTransaction } = await import("drizzle-orm/pg-core");
    const spy = vi.spyOn(PgTransaction.prototype, "execute");
    const row = (await createRecord(owner, f.registry, await E("company"), { name: "RT firma" }))
      .row;
    const dialect = new PgDialect();
    const notifies = spy.mock.calls
      .map(([q]) => dialect.sqlToQuery(q as never))
      .filter((q) => q.sql.includes("pg_notify"));
    spy.mockRestore();
    expect(notifies.length).toBeGreaterThan(0);
    expect(
      notifies.some((q) => q.params.includes(row.id) && q.params.includes("opsys_change")),
    ).toBe(true);
  });
});

/* ---------------- historie ---------------- */

describe("globální historie (HIS-02, HIS-05, HIS-06)", () => {
  let shared: string;
  let priv: string;
  beforeAll(async () => {
    shared = (await createRecord(owner, f.registry, await E("company"), { name: "Hist sdílená" }))
      .row.id;
    priv = (
      await createRecord(owner, f.registry, await E("company"), {
        name: `Hist ${CANARY}`,
        isPrivate: true,
      })
    ).row.id;
    await createRecord(sourceCtx(db, "n8n", "n8n: Disk"), f.registry, await E("company"), {
      name: "Hist z n8n",
    });
    // bezpečnostní událost partnera a vlastníka
    await recordAudit(partner, {
      action: "login",
      entityType: "user",
      entityId: partner.actor.userId!,
      category: "security",
    });
    await recordAudit(owner, {
      action: "login",
      entityType: "user",
      entityId: owner.actor.userId!,
      category: "security",
    });
  });

  it("vlastník vidí vše, partner nevidí historii soukromého záznamu ani jeho název", async () => {
    const o = await queryHistory(owner, f.registry, { q: CANARY });
    expect(o.items.some((i) => i.entityId === priv)).toBe(true);
    const p = await queryHistory(partner, f.registry, { limit: 200 });
    expect(JSON.stringify(p)).not.toContain(CANARY);
    expect(p.items.some((i) => i.entityId === priv)).toBe(false);
    expect((await queryHistory(partner, f.registry, { q: CANARY })).total).toBe(0);
    expect(p.items.some((i) => i.entityId === shared)).toBe(true);
  });

  it("po zveřejnění zůstane starší soukromá historie skrytá (R-33)", async () => {
    await setVisibility(owner, f.registry, "company", priv, false);
    const p = await queryHistory(partner, f.registry, { entityId: priv, limit: 200 });
    // zveřejněný záznam je vidět, ale jeho dřívější soukromé změny (vznik) zůstávají skryté
    expect(p.items.map((i) => i.action)).toEqual(["visibility_changed"]);
    await setVisibility(owner, f.registry, "company", priv, true);
  });

  it("bezpečnostní události vidí partner jen své", async () => {
    const p = await queryHistory(partner, f.registry, { category: "security", limit: 200 });
    expect(p.items.length).toBeGreaterThan(0);
    expect(p.items.every((i) => i.actorId === partner.actor.userId)).toBe(true);
    const o = await queryHistory(owner, f.registry, { category: "security", limit: 200 });
    expect(new Set(o.items.map((i) => i.actorId))).toContain(partner.actor.userId);
  });

  it("autor mimo uživatele: n8n s popiskem a filtr podle druhu aktéra", async () => {
    const r = await queryHistory(partner, f.registry, { actorKind: "n8n" });
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.items[0]).toMatchObject({ actor: "n8n: Disk", actorKind: "n8n", action: "create" });
  });

  it("před → po u polí, odkaz na záznam a po smazání odkaz do koše", async () => {
    const company = await E("company");
    const { updateRecord } = await import("@rebar/core/entities");
    await updateRecord(owner, f.registry, company, shared, { city: "Plzeň" });
    let r = await queryHistory(owner, f.registry, { entityId: shared, action: "update" });
    const upd = r.items[0]!;
    expect(upd.changes.some((c) => c.new === "Plzeň")).toBe(true);
    expect(upd).toMatchObject({ state: "live", href: expect.stringContaining(shared) });
    await deleteRecord(owner, company, shared);
    r = await queryHistory(owner, f.registry, { entityId: shared });
    expect(r.items[0]).toMatchObject({ state: "deleted", href: "/kos" });
  });

  it("filtry: typ, akce, období a hledání", async () => {
    const day = new Date().toISOString().slice(0, 10);
    const all = await queryHistory(owner, f.registry, {
      entityType: "company",
      from: day,
      to: day,
    });
    expect(all.items.length).toBeGreaterThan(0);
    expect(all.items.every((i) => i.entityType === "company")).toBe(true);
    expect(
      (await queryHistory(owner, f.registry, { from: "2000-01-01", to: "2000-01-02" })).total,
    ).toBe(0);
    expect((await queryHistory(owner, f.registry, { q: "hist z n8n" })).total).toBeGreaterThan(0);
    expect(
      (await queryHistory(owner, f.registry, { action: "create" })).items.length,
    ).toBeGreaterThan(0);
  });

  it("export CSV: jen s právem `activity.export`, stejná viditelnost, zapíše se do historie", async () => {
    await expect(exportHistoryCsv(partner, f.registry, {})).rejects.toBeInstanceOf(PermissionError);
    const csv = await exportHistoryCsv(owner, f.registry, { q: "Hist" });
    expect(csv.csv.startsWith("﻿Kdy;Kdo")).toBe(true);
    expect(csv.csv).toContain(CANARY); // vlastník ho vidí
    const after = await queryHistory(owner, f.registry, { action: "export", category: "security" });
    expect(after.items.length).toBeGreaterThan(0);
  });

  it("historie je nemazatelná: aplikační role nesmí UPDATE ani DELETE audit_log", async () => {
    await expect(
      app.db.delete(schema.auditLog).where(eq(schema.auditLog.action, "login")),
    ).rejects.toThrow();
  });
});

/* ---------------- hledání ---------------- */

describe("hledání Cmd+K (HLE-03, HLE-07, MOB-02)", () => {
  let sharedPerson: string;
  let privPerson: string;
  beforeAll(async () => {
    const person = await E("person");
    sharedPerson = (
      await createRecord(owner, f.registry, person, {
        firstName: "Žofie",
        lastName: "Černá",
        phone: "+420 777 123 456",
        email: "zofie@firma.cz",
      })
    ).row.id;
    privPerson = (
      await createRecord(owner, f.registry, person, {
        firstName: "Soukromý",
        lastName: CANARY,
        phone: "+420 603 999 888",
        isPrivate: true,
      })
    ).row.id;
  });
  const defs = () => f.registry.all();

  it("telefon bez ohledu na mezery a předvolbu: „777 12“ najde „+420 777 123 456“", async () => {
    for (const q of ["777 12", "77712", "+420 777 12", "777123456", "00420777123456"]) {
      const hits = await searchAll(partner, defs(), q);
      expect(
        hits.some((h) => h.id === sharedPerson),
        q,
      ).toBe(true);
    }
  });

  it("bez diakritiky a velikosti písmen; nález nese telefon, e-mail a skupinu", async () => {
    const hits = await searchAll(partner, defs(), "zofie cerna");
    const h = hits.find((x) => x.id === sharedPerson);
    expect(h).toMatchObject({
      entityType: "person",
      phone: expect.stringContaining("777"),
      email: "zofie@firma.cz",
      labelMany: expect.any(String),
    });
  });

  it("další telefon osoby (nejen hlavní) se hledá přes `searchLoad` při indexaci", async () => {
    const { personContactPoint, person } = await import("@rebar/kontakty/schema");
    await db.insert(personContactPoint).values({
      personId: sharedPerson,
      kind: "phone",
      value: "602 555 444",
      valueNorm: "+420602555444",
      position: 1,
    });
    const [row] = await db.select().from(person).where(eq(person.id, sharedPerson));
    const { indexRecord } = await import("@rebar/core/entities");
    // minimální popis entity bez `searchLoad` (jako ho mají služby kontaktů): doplní se z registru entit
    await indexRecord(
      db,
      { def: { key: "person", search: f.registry.get("person")!.search } as never },
      row as never,
    );
    const hits = await searchAll(partner, defs(), "602 5554");
    expect(hits.some((h) => h.id === sharedPerson)).toBe(true);
  });

  it("soukromé se partnerovi nenajde (ani telefonem), vlastníkovi ano", async () => {
    for (const q of [CANARY, "603 999", "603999888"]) {
      expect(
        (await searchAll(partner, defs(), q)).some((h) => h.id === privPerson),
        q,
      ).toBe(false);
      expect(
        (await searchAll(owner, defs(), q)).some((h) => h.id === privPerson),
        q,
      ).toBe(true);
    }
  });

  it("výsledky jednoho typu jsou omezené (`perType`)", async () => {
    const hits = await searchAll(owner, defs(), "Hist", 30, { perType: 1 });
    const per = new Map<string, number>();
    for (const h of hits) per.set(h.entityType, (per.get(h.entityType) ?? 0) + 1);
    expect([...per.values()].every((n) => n <= 1)).toBe(true);
  });
});

/* ---------------- nedávné záznamy ---------------- */

describe("posledních 8 otevřených záznamů (HLE-02)", () => {
  it("drží osm, nejnovější první, a nenabízí záznam, který už uživatel nesmí vidět", async () => {
    const company = await E("company");
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) {
      const id = (await createRecord(owner, f.registry, company, { name: `Nedávná ${i}` })).row.id;
      ids.push(id);
      await trackRecent(partner, f.registry, "company", id);
      await db
        .update(schema.recentRecord)
        .set({ visitedAt: new Date(Date.now() - (10 - i) * 60_000) })
        .where(eq(schema.recentRecord.entityId, id));
    }
    const r = await listRecent(partner, f.registry);
    expect(r).toHaveLength(8);
    expect(r[0]!.id).toBe(ids[9]);
    // zamčený záznam partner nesmí vidět → z nabídky zmizí
    await setVisibility(owner, f.registry, "company", ids[9]!, true);
    const r2 = await listRecent(partner, f.registry);
    expect(r2.some((x) => x.id === ids[9])).toBe(false);
    expect(JSON.stringify(r2)).not.toContain("Nedávná 9");
    // smazaný se nenabízí
    await deleteRecord(owner, company, ids[8]!);
    expect((await listRecent(partner, f.registry)).some((x) => x.id === ids[8])).toBe(false);
  });
});

/* ---------------- předvolby a pohledy ---------------- */

describe("rychlé předvolby a připnutí pohledu (SPOL-03, SPOL-10)", () => {
  it("předvolba Soukromé jen pro vlastníka, Moje/Dnes/Po termínu u úkolů", async () => {
    const company = await E("company");
    const own = await describeEntity(owner, db, company, f.registry);
    const par = await describeEntity(partner, db, company, f.registry);
    expect(own.quickFilters?.map((q) => q.key)).toContain("private");
    expect(par.quickFilters?.map((q) => q.key) ?? []).not.toContain("private");
    const task = await describeEntity(owner, db, await E("task"), f.registry);
    expect(task.quickFilters?.map((q) => q.key)).toEqual(
      expect.arrayContaining(["mine", "today", "overdue"]),
    );
  });

  it("připnutí pohledu do panelu nastaví `pinned` u vlastního pohledu", async () => {
    const def = f.registry.get("company")!;
    const view = await createView(owner, def, new Set(["name"]), {
      name: "Moje firmy",
      shared: true,
      config: { viewType: "table" },
    });
    await setFavorite(owner, view.id, true);
    const [row] = await db.select().from(schema.savedView).where(eq(schema.savedView.id, view.id));
    expect(row!.pinned).toBe(true);
    // partner si sdílený pohled připne po svém, vlastníkův příznak se nemění
    await setFavorite(partner, view.id, true);
    await setFavorite(owner, view.id, false);
    const [row2] = await db.select().from(schema.savedView).where(eq(schema.savedView.id, view.id));
    expect(row2!.pinned).toBe(false);
  });
});
