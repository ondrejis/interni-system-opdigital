import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { desc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DealSnap, DriveEventData } from "../contracts/events";
import { schema } from "../db/client";
import { newId } from "../db/ids";
import { emitDomain } from "../events";
import { PermissionError, UserError } from "../rbac/errors";
import { inTx, systemCtx } from "../rbac/context";
import { createCipher, parseKeyRing } from "../security/crypto";
import { connectAppDb, makeUser } from "../testing";
import {
  MAX_ATTEMPTS,
  RETRY_DELAYS_SECONDS,
  cleanupWebhookData,
  deliverDue,
  type DeliverDeps,
} from "./deliver";
import {
  createEndpoint,
  deleteEndpoint,
  getDeliveryPayload,
  listDeliveries,
  listEndpoints,
  retryAllFailed,
  retryDelivery,
  rotateEndpointSecret,
  sendTestDelivery,
  updateEndpoint,
} from "./endpoints";
import { verifySignature } from "./signature";

/*
  Odchozí webhooky proti skutečné databázi a skutečnému HTTP serveru (lokální): outbox v transakci změny, filtr
  událostí a soukromých záznamů, podpis, plán opakování 1 min → 1 h, ruční opakování, zkušební webhook, oprávnění.
*/

const app = connectAppDb();
const cipher = createCipher(parseKeyRing({ APP_ENCRYPTION_KEY: randomBytes(32).toString("base64") }));
const sys = systemCtx(app.db);

type Hit = { headers: IncomingMessage["headers"]; body: string };
let server: Server;
let base: string;
let hits: Hit[] = [];
let respond: (hit: Hit, n: number) => { status: number; body?: string; headers?: Record<string, string> } =
  () => ({ status: 200 });

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const hit = { headers: req.headers, body: Buffer.concat(chunks).toString("utf8") };
      hits.push(hit);
      const r = respond(hit, hits.length);
      res.writeHead(r.status, r.headers);
      res.end(r.body ?? "ok");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise((r) => server.close(r));
  await app.close();
});
beforeEach(async () => {
  hits = [];
  respond = () => ({ status: 200 });
  // každý test začíná bez endpointů a doručení
  await app.db.delete(schema.webhookDelivery);
  await app.db.delete(schema.webhookEndpoint);
});

/** Adresa, na které nic neposlouchá (port po chvilce uvolníme). */
async function deadUrl(): Promise<string> {
  const s = createServer();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const port = (s.address() as AddressInfo).port;
  await new Promise((r) => s.close(r));
  return `http://127.0.0.1:${port}/nikdo`;
}

const owner = () => makeUser(app.db, [["settings.integrations", "all"], ["private.read", "all"]]);
const deps = (extra: Partial<DeliverDeps> = {}): DeliverDeps => ({ db: app.db, cipher, ...extra });

const deal = (id = newId()): DealSnap => ({
  id,
  title: "Web pro Novákovi",
  companyId: null,
  personId: null,
  stageId: null,
  result: "won",
  valueMinor: 5_000_000,
  services: ["web"],
  ownerId: null,
  source: "manual",
});

async function addEndpoint(
  ctx: Awaited<ReturnType<typeof owner>>["ctx"],
  events: string[],
  opts: { includePrivate?: boolean; name?: string; url?: string } = {},
) {
  return createEndpoint(ctx, cipher, {
    name: opts.name ?? `n8n ${newId().slice(-4)}`,
    url: opts.url ?? `${base}/hook`,
    events,
    includePrivate: opts.includePrivate ?? false,
  });
}

const deliveriesOf = async (endpointId: string) =>
  app.db.select().from(schema.webhookDelivery).where(eq(schema.webhookDelivery.endpointId, endpointId));

async function emit(isPrivate = false, name: "deal.won" | "deal.created" = "deal.won") {
  const d = deal();
  await inTx(sys, (c) =>
    emitDomain(c, name, name === "deal.won" ? { deal: d, jobIds: [] } : { deal: d }, {
      entity: { type: "deal", id: d.id, isPrivate },
    }),
  );
  return d;
}

describe("outbox: zápis doručení v transakci změny", () => {
  it("doručení vznikne jen aktivním endpointům, které událost odebírají; smazané a vypnuté ne", async () => {
    const { ctx } = await owner();
    const a = await addEndpoint(ctx, ["deal.*"]);
    const b = await addEndpoint(ctx, ["task.created"]);
    const c = await addEndpoint(ctx, ["deal.won"]);
    const off = await addEndpoint(ctx, ["deal.won"]);
    const gone = await addEndpoint(ctx, ["deal.won"]);
    await updateEndpoint(ctx, off.id, {
      name: "vypnutý",
      url: `${base}/hook`,
      events: ["deal.won"],
      includePrivate: false,
      active: false,
    });
    await deleteEndpoint(ctx, gone.id);

    await emit();

    expect((await deliveriesOf(a.id)).map((d) => d.event)).toEqual(["deal.won"]);
    expect(await deliveriesOf(b.id)).toHaveLength(0);
    expect(await deliveriesOf(c.id)).toHaveLength(1);
    expect(await deliveriesOf(off.id)).toHaveLength(0);
    expect(await deliveriesOf(gone.id)).toHaveLength(0);
  });

  it("tělo nese událost včetně `entity.isPrivate`, aktéra a čas", async () => {
    const { ctx } = await owner();
    const e = await addEndpoint(ctx, ["deal.won"]);
    const d = await emit();
    const [row] = await deliveriesOf(e.id);
    expect(row).toMatchObject({ status: "pending", attempts: 0, event: "deal.won" });
    expect(row!.payload).toMatchObject({
      id: row!.eventId,
      event: "deal.won",
      actor: { kind: "system", id: null },
      entity: { type: "deal", id: d.id, isPrivate: false },
      data: { deal: { id: d.id, title: "Web pro Novákovi" }, jobIds: [] },
    });
    expect(typeof (row!.payload as { occurredAt: string }).occurredAt).toBe("string");
  });

  it("soukromé záznamy jdou jen na endpointy s `include_private`", async () => {
    const { ctx } = await owner();
    const shared = await addEndpoint(ctx, ["deal.*"]);
    const mine = await addEndpoint(ctx, ["deal.*"], { includePrivate: true });
    await emit(true);
    expect(await deliveriesOf(shared.id)).toHaveLength(0);
    const [row] = await deliveriesOf(mine.id);
    expect((row!.payload as { entity: { isPrivate: boolean } }).entity.isPrivate).toBe(true);
    await emit(false);
    expect(await deliveriesOf(shared.id)).toHaveLength(1);
    expect(await deliveriesOf(mine.id)).toHaveLength(2);
  });

  it("události Disku dostane jen endpoint s `drive.*`; interní události nikdo", async () => {
    const { ctx } = await owner();
    const general = await addEndpoint(ctx, ["deal.*", "client.status_changed", "project.*"]);
    const drive = await addEndpoint(ctx, ["drive.*"]);
    const data: DriveEventData = {
      requestId: newId(),
      client: { id: newId(), name: "Firma", ico: null },
      structure: {},
      callbackUrl: "https://opsys.example/api/ingest/drive",
    };
    await inTx(sys, async (c) => {
      await emitDomain(c, "drive.client.create", data, {
        entity: { type: "company", id: data.client.id, isPrivate: false },
      });
      await emitDomain(
        c,
        "client.renamed",
        { clientId: data.client.id, from: "A", to: "B" },
        { entity: { type: "company", id: data.client.id, isPrivate: false } },
      );
    });
    expect(await deliveriesOf(general.id)).toHaveLength(0);
    expect((await deliveriesOf(drive.id)).map((r) => r.event)).toEqual(["drive.client.create"]);
  });

  it("vrácená transakce nezanechá žádné doručení", async () => {
    const { ctx } = await owner();
    const e = await addEndpoint(ctx, ["deal.won"]);
    await expect(
      inTx(sys, async (c) => {
        const d = deal();
        await emitDomain(c, "deal.won", { deal: d, jobIds: [] }, {
          entity: { type: "deal", id: d.id, isPrivate: false },
        });
        throw new Error("změna se nepovedla");
      }),
    ).rejects.toThrow("změna se nepovedla");
    expect(await deliveriesOf(e.id)).toHaveLength(0);
  });

  it("chyba zápisu do outboxu nepoloží transakci změny (a transakce zůstane použitelná)", async () => {
    const { ctx } = await owner();
    const e = await addEndpoint(ctx, ["deal.won"]);
    const key = `test-${newId()}`;
    await inTx(sys, async (c) => {
      await c.db.insert(schema.setting).values({ key, value: { a: 1 } });
      const d = deal();
      // BigInt nejde serializovat do JSON: webhook se nezapíše, změna musí projít
      await emitDomain(
        c,
        "deal.won",
        { deal: { ...d, valueMinor: 10n as never }, jobIds: [] },
        { entity: { type: "deal", id: d.id, isPrivate: false } },
      );
      await c.db.insert(schema.setting).values({ key: `${key}-po`, value: { a: 2 } });
    });
    const saved = await app.db.select().from(schema.setting).where(eq(schema.setting.key, key));
    const after = await app.db.select().from(schema.setting).where(eq(schema.setting.key, `${key}-po`));
    expect(saved).toHaveLength(1);
    expect(after).toHaveLength(1);
    expect(await deliveriesOf(e.id)).toHaveLength(0);
  });

  it("nedostupný endpoint změnu nezdrží ani nezruší: commit proběhne bez čekání na HTTP", async () => {
    const { ctx } = await owner();
    await addEndpoint(ctx, ["deal.won"], { url: await deadUrl() });
    const t0 = Date.now();
    await emit();
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(hits).toHaveLength(0);
  });
});

describe("doručení: podpis, hlavičky, výsledek", () => {
  it("odešle tělo s podpisem, který n8n ověří tajemstvím z vytvoření endpointu", async () => {
    const { ctx } = await owner();
    const e = await addEndpoint(ctx, ["deal.won"]);
    await emit();
    const now = new Date();
    const result = await deliverDue(deps({ now: () => now }));
    expect(result).toMatchObject({ claimed: 1, delivered: 1, failed: 0 });
    expect(hits).toHaveLength(1);
    const hit = hits[0]!;
    const [row] = await deliveriesOf(e.id);
    expect(hit.headers["x-opsys-event"]).toBe("deal.won");
    expect(hit.headers["x-opsys-delivery"]).toBe(row!.id);
    expect(hit.headers["content-type"]).toBe("application/json");
    expect(
      verifySignature({
        secrets: [e.secret],
        header: String(hit.headers["x-opsys-signature"]),
        body: hit.body,
        nowMs: now.getTime(),
      }),
    ).toEqual({ ok: true });
    expect(JSON.parse(hit.body)).toMatchObject({ id: row!.eventId, event: "deal.won" });
    expect(row).toMatchObject({ status: "delivered", attempts: 1, lastError: null });
    expect(row!.deliveredAt).toBeInstanceOf(Date);
  });

  it("tajemství je v databázi jen zašifrované a seznam endpointů ho neobsahuje", async () => {
    const { ctx } = await owner();
    const e = await addEndpoint(ctx, ["deal.won"]);
    const [row] = await app.db.select().from(schema.webhookEndpoint).where(eq(schema.webhookEndpoint.id, e.id));
    expect(row!.secretEnc).not.toContain(e.secret);
    expect(cipher.decrypt(row!.secretEnc)).toBe(e.secret);
    expect(JSON.stringify(await listEndpoints(ctx))).not.toContain(e.secret);
    const audit = await app.db.select().from(schema.auditLog);
    expect(JSON.stringify(audit)).not.toContain(e.secret);
  });

  it("souběžné běhy doručovače pošlou každé doručení právě jednou", async () => {
    const { ctx } = await owner();
    await addEndpoint(ctx, ["deal.created"]);
    for (let i = 0; i < 12; i++) await emit(false, "deal.created");
    const now = new Date(Date.now() + 1000);
    const runs = await Promise.all([1, 2, 3].map(() => deliverDue(deps({ now: () => now }))));
    expect(runs.reduce((s, r) => s + r.delivered, 0)).toBe(12);
    expect(hits).toHaveLength(12);
    expect(new Set(hits.map((h) => h.headers["x-opsys-delivery"])).size).toBe(12);
  });

  it("přesměrování se nenásleduje a počítá se jako chyba", async () => {
    const { ctx } = await owner();
    const e = await addEndpoint(ctx, ["deal.won"]);
    respond = () => ({ status: 302, headers: { location: `${base}/jinde` } });
    await emit();
    await deliverDue(deps({ now: () => new Date(Date.now() + 1000) }));
    expect(hits).toHaveLength(1);
    const [row] = await deliveriesOf(e.id);
    expect(row).toMatchObject({ status: "pending", attempts: 1 });
    expect(row!.lastError).toMatch(/HTTP 302/);
  });
});

describe("opakování: 1 min → 5 min → 15 min → 30 min → 1 h, pak chyba", () => {
  it("plán odkladů a počet pokusů", () => {
    expect([...RETRY_DELAYS_SECONDS]).toEqual([60, 300, 900, 1800, 3600]);
    expect(MAX_ATTEMPTS).toBe(6);
  });

  it("server stále odpovídá 500: pokusy přesně podle plánu, na konci `failed` s důvodem; každý pokus má čerstvý podpis", async () => {
    const { ctx } = await owner();
    const e = await addEndpoint(ctx, ["deal.won"]);
    respond = () => ({ status: 500, body: "n8n spadlo\nstack" });
    await emit();

    let now = new Date(Date.now() + 1000);
    const times: number[] = [];
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const r = await deliverDue(deps({ now: () => now }));
      expect(r.claimed, `pokus ${attempt}`).toBe(1);
      times.push(now.getTime());
      const [row] = await deliveriesOf(e.id);
      expect(row!.attempts).toBe(attempt);
      if (attempt < MAX_ATTEMPTS) {
        expect(row!.status).toBe("pending");
        const delay = RETRY_DELAYS_SECONDS[attempt - 1]!;
        expect(row!.nextAttemptAt.getTime()).toBe(now.getTime() + delay * 1000);
        // před uplynutím odkladu se nic neodešle
        const early = await deliverDue(deps({ now: () => new Date(now.getTime() + delay * 1000 - 1) }));
        expect(early.claimed).toBe(0);
        now = new Date(now.getTime() + delay * 1000);
      }
    }
    const [row] = await deliveriesOf(e.id);
    expect(row).toMatchObject({ status: "failed", attempts: 6 });
    expect(row!.lastError).toContain("HTTP 500: n8n spadlo stack");
    expect(hits).toHaveLength(6);
    // nic dalšího se už neodesílá
    expect((await deliverDue(deps({ now: () => new Date(now.getTime() + 86_400_000) }))).claimed).toBe(0);
    // každý pokus podepsán časem svého pokusu (a opakování po hodině proto prošlo ověřením ±5 min)
    hits.forEach((h, i) =>
      expect(
        verifySignature({
          secrets: [e.secret],
          header: String(h.headers["x-opsys-signature"]),
          body: h.body,
          nowMs: times[i]!,
        }).ok,
      ).toBe(true),
    );
  });

  it("po dvou chybách projde: doručeno, chyba vymazána, počet pokusů 3", async () => {
    const { ctx } = await owner();
    const e = await addEndpoint(ctx, ["deal.won"]);
    respond = (_h, n) => (n < 3 ? { status: 503 } : { status: 200 });
    await emit();
    let now = new Date(Date.now() + 1000);
    for (let i = 0; i < 3; i++) {
      await deliverDue(deps({ now: () => now }));
      now = new Date(now.getTime() + 3_600_000);
    }
    const [row] = await deliveriesOf(e.id);
    expect(row).toMatchObject({ status: "delivered", attempts: 3, lastError: null });
  });

  it("nedostupný server: srozumitelná chyba spojení bez adresy", async () => {
    const { ctx } = await owner();
    const e = await addEndpoint(ctx, ["deal.won"], { url: await deadUrl() });
    await emit();
    await deliverDue(deps({ now: () => new Date(Date.now() + 1000) }));
    const [row] = await deliveriesOf(e.id);
    expect(row!.status).toBe("pending");
    expect(row!.lastError).toMatch(/Spojení se nezdařilo \(ECONNREFUSED\)/);
    expect(row!.lastError).not.toContain("127.0.0.1");
    expect(row!.lastError).not.toContain("nikdo");
  });

  it("pomalý server: vyprší čas a doručení se opakuje", async () => {
    const { ctx } = await owner();
    const e = await addEndpoint(ctx, ["deal.won"]);
    await emit();
    const slowFetch: typeof fetch = async () => {
      throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
    };
    await deliverDue(deps({ fetch: slowFetch, now: () => new Date(Date.now() + 1000) }));
    const [row] = await deliveriesOf(e.id);
    expect(row!.lastError).toMatch(/Server neodpověděl/);
  });

  it("převzaté doručení po pádu workeru se po uplynutí zámku zpracuje znovu", async () => {
    const { ctx } = await owner();
    const e = await addEndpoint(ctx, ["deal.won"]);
    await emit();
    const t0 = new Date(Date.now() + 1000);
    // worker doručení převzal (zámek), ale spadl dřív, než odeslal
    await app.db.execute(sql`update webhook_delivery set attempts = 1, next_attempt_at = ${new Date(t0.getTime() + 120_000).toISOString()}::timestamptz`);
    expect((await deliverDue(deps({ now: () => t0 }))).claimed).toBe(0);
    const later = new Date(t0.getTime() + 121_000);
    expect(await deliverDue(deps({ now: () => later }))).toMatchObject({ delivered: 1 });
    expect((await deliveriesOf(e.id))[0]).toMatchObject({ status: "delivered", attempts: 2 });
  });

  it("endpoint vypnutý po vzniku doručení: doručení skončí chybou bez odeslání", async () => {
    const { ctx } = await owner();
    const e = await addEndpoint(ctx, ["deal.won"]);
    await emit();
    await updateEndpoint(ctx, e.id, {
      name: "vypnutý",
      url: `${base}/hook`,
      events: ["deal.won"],
      includePrivate: false,
      active: false,
    });
    await deliverDue(deps({ now: () => new Date(Date.now() + 1000) }));
    expect(hits).toHaveLength(0);
    expect((await deliveriesOf(e.id))[0]).toMatchObject({ status: "failed" });
  });
});

describe("správa endpointů a doručení", () => {
  it("bez oprávnění `settings.integrations` nejde nic (ani číst)", async () => {
    const nobody = await makeUser(app.db, [["settings.manage", "all"]]);
    const { ctx } = await owner();
    const e = await addEndpoint(ctx, ["deal.won"]);
    const input = { name: "x", url: `${base}/h`, events: ["deal.won"], includePrivate: false };
    await expect(listEndpoints(nobody.ctx)).rejects.toThrow(PermissionError);
    await expect(createEndpoint(nobody.ctx, cipher, input)).rejects.toThrow(PermissionError);
    await expect(updateEndpoint(nobody.ctx, e.id, { ...input, active: true })).rejects.toThrow(PermissionError);
    await expect(rotateEndpointSecret(nobody.ctx, cipher, e.id)).rejects.toThrow(PermissionError);
    await expect(deleteEndpoint(nobody.ctx, e.id)).rejects.toThrow(PermissionError);
    await expect(sendTestDelivery(nobody.ctx, { cipher }, e.id)).rejects.toThrow(PermissionError);
    await expect(listDeliveries(nobody.ctx)).rejects.toThrow(PermissionError);
    await expect(retryAllFailed(nobody.ctx)).rejects.toThrow(PermissionError);
    expect(hits).toHaveLength(0);
  });

  it("validace: název, adresa, události", async () => {
    const { ctx } = await owner();
    const ok = { name: "n8n", url: `${base}/h`, events: ["deal.won"], includePrivate: false };
    await expect(createEndpoint(ctx, cipher, { ...ok, name: " " })).rejects.toThrow(UserError);
    await expect(createEndpoint(ctx, cipher, { ...ok, url: "ftp://x" })).rejects.toThrow(UserError);
    await expect(createEndpoint(ctx, cipher, { ...ok, url: "http://n8n.firma.cz/x" })).rejects.toThrow(/https/);
    await expect(createEndpoint(ctx, cipher, { ...ok, events: [] })).rejects.toThrow(/aspoň jednu/);
    await expect(createEndpoint(ctx, cipher, { ...ok, events: ["client.renamed"] })).rejects.toThrow(/Neznámá událost/);
    expect(await listEndpoints(ctx)).toHaveLength(0);
  });

  it("úprava změní události a soukromá data; změna je v auditu bez tajemství", async () => {
    const { ctx } = await owner();
    const e = await addEndpoint(ctx, ["deal.won"]);
    await updateEndpoint(ctx, e.id, {
      name: "Nový název",
      url: `${base}/jiny`,
      events: ["deal.*", "task.created"],
      includePrivate: true,
      active: true,
    });
    const [row] = await listEndpoints(ctx);
    expect(row).toMatchObject({
      name: "Nový název",
      events: ["deal.*", "task.created"],
      includePrivate: true,
      active: true,
    });
    const log = await app.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entityId, e.id))
      .orderBy(desc(schema.auditLog.occurredAt));
    expect(log.map((l) => l.action)).toContain("update");
    expect(log[0]!.entityTitle).toBe("Nový název");
  });

  it("výměna tajemství: staré přestane platit, nové se použije při dalším odeslání", async () => {
    const { ctx } = await owner();
    const e = await addEndpoint(ctx, ["deal.won"]);
    const { secret } = await rotateEndpointSecret(ctx, cipher, e.id);
    expect(secret).not.toBe(e.secret);
    await emit();
    const now = new Date(Date.now() + 1000);
    await deliverDue(deps({ now: () => now }));
    const h = hits[0]!;
    const check = (s: string) =>
      verifySignature({
        secrets: [s],
        header: String(h.headers["x-opsys-signature"]),
        body: h.body,
        nowMs: now.getTime(),
      }).ok;
    expect(check(secret)).toBe(true);
    expect(check(e.secret)).toBe(false);
  });

  it("smazání endpointu ukončí jeho čekající doručení a endpoint zmizí ze seznamu", async () => {
    const { ctx } = await owner();
    const e = await addEndpoint(ctx, ["deal.won"]);
    await emit();
    await deleteEndpoint(ctx, e.id);
    expect(await listEndpoints(ctx)).toHaveLength(0);
    expect((await deliveriesOf(e.id))[0]).toMatchObject({ status: "failed" });
    await deliverDue(deps({ now: () => new Date(Date.now() + 1000) }));
    expect(hits).toHaveLength(0);
  });

  it("zkušební webhook: odešle se hned, jednou, a výsledek je v seznamu doručení", async () => {
    const { ctx } = await owner();
    const e = await addEndpoint(ctx, ["deal.won"]);
    const ok = await sendTestDelivery(ctx, { cipher }, e.id);
    expect(ok).toMatchObject({ outcome: "delivered", error: null });
    expect(hits).toHaveLength(1);
    expect(hits[0]!.headers["x-opsys-event"]).toBe("webhook.test");
    expect(JSON.parse(hits[0]!.body)).toMatchObject({ event: "webhook.test", entity: { isPrivate: false } });
    expect(
      verifySignature({
        secrets: [e.secret],
        header: String(hits[0]!.headers["x-opsys-signature"]),
        body: hits[0]!.body,
      }).ok,
    ).toBe(true);

    respond = () => ({ status: 404, body: "Not Found" });
    const bad = await sendTestDelivery(ctx, { cipher }, e.id);
    expect(bad.outcome).toBe("failed"); // bez opakování
    expect(bad.error).toContain("HTTP 404: Not Found");
    const list = await listDeliveries(ctx, { endpointId: e.id });
    expect(list.map((d) => [d.event, d.status, d.attempts])).toEqual(
      expect.arrayContaining([
        ["webhook.test", "delivered", 1],
        ["webhook.test", "failed", 1],
      ]),
    );
  });

  it("ruční opakování: vrátí chybné doručení do fronty s novými pokusy a hned ho zkusí; zapíše se do auditu", async () => {
    const { ctx } = await owner();
    const e = await addEndpoint(ctx, ["deal.won"]);
    respond = () => ({ status: 500 });
    await emit();
    let now = new Date(Date.now() + 1000);
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await deliverDue(deps({ now: () => now }));
      now = new Date(now.getTime() + 3_600_000);
    }
    const [failed] = await listDeliveries(ctx, { status: "failed" });
    expect(failed).toMatchObject({ endpointId: e.id, status: "failed", attempts: 6 });
    // pending nejde „opakovat“
    respond = () => ({ status: 200 });
    const report = await retryDelivery(ctx, { cipher }, failed!.id);
    expect(report).toMatchObject({ outcome: "delivered", error: null });
    const [after] = await deliveriesOf(e.id);
    expect(after).toMatchObject({ status: "delivered", attempts: 1, lastError: null });
    await expect(retryDelivery(ctx, { cipher }, failed!.id)).rejects.toThrow(/selhalo/);
    const log = await app.db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "retry"));
    expect(log.some((l) => l.entityId === e.id)).toBe(true);
  });

  it("opakovat všechna chybná: vrátí je do fronty a odešle je pak doručovač", async () => {
    const { ctx } = await owner();
    const e = await addEndpoint(ctx, ["deal.created"]);
    for (let i = 0; i < 3; i++) await emit(false, "deal.created");
    await app.db.update(schema.webhookDelivery).set({ status: "failed", attempts: 6 });
    expect(await retryAllFailed(ctx, { endpointId: e.id })).toBe(3);
    const r = await deliverDue(deps({ now: () => new Date(Date.now() + 1000) }));
    expect(r.delivered).toBe(3);
  });

  it("soukromá doručení vidí jen ten, kdo smí soukromé záznamy (seznam, počty, tělo, opakování)", async () => {
    const full = await owner();
    const limited = await makeUser(app.db, [["settings.integrations", "all"]]);
    const e = await addEndpoint(full.ctx, ["deal.*"], { includePrivate: true });
    await emit(true);
    await emit(false);
    expect(await listDeliveries(full.ctx)).toHaveLength(2);
    const seen = await listDeliveries(limited.ctx);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.isPrivate).toBe(false);
    expect(await listEndpoints(limited.ctx)).toEqual([]); // endpoint se soukromými daty je mu skrytý
    expect((await listEndpoints(full.ctx))[0]!.counts.pending).toBe(2);
    const [priv] = (await listDeliveries(full.ctx)).filter((d) => d.isPrivate);
    await expect(getDeliveryPayload(limited.ctx, priv!.id)).rejects.toThrow(/nenalezeno/);
    expect(await getDeliveryPayload(full.ctx, priv!.id)).toMatchObject({ entity: { isPrivate: true } });
    await app.db.update(schema.webhookDelivery).set({ status: "failed" });
    expect(await retryAllFailed(limited.ctx, { endpointId: e.id })).toBe(1); // jen to, co vidí
    const stillFailed = await listDeliveries(full.ctx, { status: "failed" });
    expect(stillFailed).toHaveLength(1);
    expect(stillFailed[0]!.isPrivate).toBe(true);
  });
});

describe("endpointy pro soukromá data", () => {
  it("`include_private` smí nastavit a měnit jen ten, kdo smí soukromé záznamy; ostatním endpoint není vidět", async () => {
    const full = await owner();
    const limited = await makeUser(app.db, [["settings.integrations", "all"]]);
    const input = { name: "n8n", url: `${base}/h`, events: ["deal.won"], includePrivate: true };
    await expect(createEndpoint(limited.ctx, cipher, input)).rejects.toThrow(/Soukromá data/);
    const mine = await createEndpoint(full.ctx, cipher, input);
    const shared = await addEndpoint(full.ctx, ["deal.won"]);

    expect((await listEndpoints(limited.ctx)).map((e) => e.id)).toEqual([shared.id]);
    expect(await listEndpoints(full.ctx)).toHaveLength(2);
    // nemůže ho přesměrovat, vyměnit mu tajemství, smazat ho, otestovat ani zapnout soukromá data u jiného
    await expect(
      updateEndpoint(limited.ctx, mine.id, { ...input, includePrivate: false, url: "https://utok.example/x", active: true }),
    ).rejects.toThrow(/nenalezen/);
    await expect(rotateEndpointSecret(limited.ctx, cipher, mine.id)).rejects.toThrow(/nenalezen/);
    await expect(deleteEndpoint(limited.ctx, mine.id)).rejects.toThrow(/nenalezen/);
    await expect(sendTestDelivery(limited.ctx, { cipher }, mine.id)).rejects.toThrow(/nenalezen/);
    await expect(
      updateEndpoint(limited.ctx, shared.id, { ...input, active: true }),
    ).rejects.toThrow(/Soukromá data/);
    expect(hits).toHaveLength(0);
  });
});

describe("úklid", () => {
  it("smaže stará vyřízená doručení, čekající a čerstvá nechá", async () => {
    const { ctx } = await owner();
    const e = await addEndpoint(ctx, ["deal.created"]);
    for (let i = 0; i < 4; i++) await emit(false, "deal.created");
    const rows = await deliveriesOf(e.id);
    const old = new Date(Date.now() - 200 * 86_400_000);
    await app.db
      .update(schema.webhookDelivery)
      .set({ status: "delivered", createdAt: old })
      .where(eq(schema.webhookDelivery.id, rows[0]!.id));
    await app.db
      .update(schema.webhookDelivery)
      .set({ status: "failed", createdAt: old })
      .where(eq(schema.webhookDelivery.id, rows[1]!.id));
    await app.db
      .update(schema.webhookDelivery)
      .set({ createdAt: old })
      .where(eq(schema.webhookDelivery.id, rows[2]!.id)); // čekající, i když stará
    const r = await cleanupWebhookData(app.db);
    expect(r.deliveries).toBe(2);
    expect(await deliveriesOf(e.id)).toHaveLength(2);
  });
});
