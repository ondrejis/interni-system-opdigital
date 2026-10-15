import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { schema } from "../db/client";
import { newId } from "../db/ids";
import { defineIngest, type ModuleDeps } from "../modules/server";
import { PermissionError, UserError } from "../rbac/errors";
import { createCipher, parseKeyRing } from "../security/crypto";
import { connectAppDb, makeUser } from "../testing";
import { signatureHeader, SIGNATURE_TOLERANCE_SECONDS } from "../webhooks/signature";
import { listInboundEvents } from "./list";
import { processIngest, reprocessInbound } from "./process";
import { getIngestSecretStatus, loadIngestSecrets, rotateIngestSecret } from "./secret";

/*
  Příchozí požadavky (`/api/ingest/<zdroj>`): podpis, časová značka, idempotence přes `inbound_event`, záznam i při
  selhání, opakování selhaných, výměna tajemství, oprávnění.
*/

const app = connectAppDb();
const cipher = createCipher(
  parseKeyRing({ APP_ENCRYPTION_KEY: randomBytes(32).toString("base64") }),
);
afterAll(() => app.close());

const deps = {} as ModuleDeps;
const admin = () => makeUser(app.db, [["settings.integrations", "all"]]);

/** Poznámky do tabulky `setting` slouží jako „vedlejší účinek“ handleru, který se musí vrátit při selhání. */
let calls: string[] = [];
let failNext = 0;
const ingests = [
  defineIngest({
    source: "leads",
    schema: z.object({ leadgenId: z.string().min(1), name: z.string() }),
    externalId: (b) => b.leadgenId,
    async handle(ctx, body) {
      calls.push(body.leadgenId);
      await ctx.db
        .insert(schema.setting)
        .values({ key: `lead:${body.leadgenId}`, value: { n: body.name } });
      if (failNext > 0) {
        failNext--;
        throw new Error("Meta nedostupná, token tajny-token-123456789012345678");
      }
      return { entity: { type: "deal", id: ENTITY } };
    },
  }),
  defineIngest({
    source: "drive",
    schema: z.object({ eventId: z.string() }),
    externalId: (b) => b.eventId,
    async handle() {
      throw new UserError("Událost Disku neznám.");
    },
  }),
];
const ENTITY = newId();

let secret: string;
const NOW = new Date();

const send = (
  body: unknown,
  opts: {
    source?: string;
    secret?: string | null;
    now?: Date;
    signedAt?: Date;
    raw?: string;
    ip?: string;
  } = {},
) => {
  const raw = opts.raw ?? JSON.stringify(body);
  const key = opts.secret === undefined ? secret : opts.secret;
  return processIngest({
    db: app.db,
    cipher,
    ingests,
    deps,
    source: opts.source ?? "leads",
    rawBody: raw,
    signature:
      key === null ? null : signatureHeader(key, raw, (opts.signedAt ?? opts.now ?? NOW).getTime()),
    ip: opts.ip ?? "203.0.113.7",
    now: opts.now ?? NOW,
  });
};

const events = (source?: string) =>
  app.db
    .select()
    .from(schema.inboundEvent)
    .where(source ? eq(schema.inboundEvent.source, source) : undefined);

beforeEach(async () => {
  calls = [];
  failNext = 0;
  await app.db.delete(schema.inboundEvent);
  await app.db.delete(schema.setting).where(eq(schema.setting.key, "ingest"));
  const a = await admin();
  ({ secret } = await rotateIngestSecret(a.ctx, cipher));
  await app.db.delete(schema.rateLimit);
});

describe("ověření podpisu", () => {
  it("bez nastaveného tajemství se nepřijme nic (503)", async () => {
    await app.db.delete(schema.setting).where(eq(schema.setting.key, "ingest"));
    const r = await send({ leadgenId: "1", name: "A" });
    expect(r.status).toBe(503);
    expect(calls).toEqual([]);
  });

  it("chybějící, špatný a prošlý podpis = 401, handler neběží; odmítnutí se zapíše bez těla", async () => {
    const body = { leadgenId: "L1", name: "Soukromý údaj Karel" };
    expect((await send(body, { secret: null })).body).toMatchObject({
      error: "invalid_signature",
      reason: "missing",
    });
    expect((await send(body, { secret: "uplne-jine-tajemstvi" })).status).toBe(401);
    const old = new Date(NOW.getTime() - (SIGNATURE_TOLERANCE_SECONDS + 1) * 1000);
    const expired = await send(body, { signedAt: old });
    expect(expired).toMatchObject({ status: 401, body: { reason: "expired" } });
    // tělo upravené po podpisu
    const raw = JSON.stringify(body);
    const tampered = await processIngest({
      db: app.db,
      cipher,
      ingests,
      deps,
      source: "leads",
      rawBody: raw.replace("L1", "L2"),
      signature: signatureHeader(secret, raw, NOW.getTime()),
      now: NOW,
    });
    expect(tampered.status).toBe(401);
    expect(calls).toEqual([]);
    const rows = await events("leads");
    expect(rows).toHaveLength(4);
    for (const r of rows) {
      expect(r).toMatchObject({ status: "failed" });
      expect(r.externalId).toMatch(/^rejected:/);
      expect(JSON.stringify(r.payload)).not.toContain("Karel"); // tělo neprověřeného požadavku se neukládá
    }
  });

  it("čas ±5 minut ještě projde", async () => {
    const edge = new Date(NOW.getTime() - SIGNATURE_TOLERANCE_SECONDS * 1000);
    expect((await send({ leadgenId: "edge", name: "A" }, { signedAt: edge })).status).toBe(200);
  });

  it("záplava špatných podpisů z jedné adresy se po 20 pokusech přestane zapisovat (429)", async () => {
    let last = 0;
    for (let i = 0; i < 25; i++)
      last = (
        await send({ leadgenId: `${i}`, name: "A" }, { secret: "spatne", ip: "198.51.100.9" })
      ).status;
    expect(last).toBe(429);
    expect((await events("leads")).length).toBe(20);
    // správný podpis z téže adresy dál prochází
    expect((await send({ leadgenId: "ok", name: "A" }, { ip: "198.51.100.9" })).status).toBe(200);
  });

  it("neznámý zdroj s platným podpisem = 404", async () => {
    expect((await send({ x: 1 }, { source: "nesmysl" })).status).toBe(404);
  });
});

describe("zpracování a idempotence", () => {
  it("platný požadavek: handler proběhne, událost je `processed` s vazbou na záznam", async () => {
    const r = await send({ leadgenId: "L100", name: "Jana" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, entity: { type: "deal", id: ENTITY } });
    expect(calls).toEqual(["L100"]);
    const [row] = await events("leads");
    expect(row).toMatchObject({
      source: "leads",
      externalId: "L100",
      status: "processed",
      entityType: "deal",
      entityId: ENTITY,
      error: null,
    });
    expect(row!.processedAt).toBeInstanceOf(Date);
    expect(row!.payload).toEqual({ leadgenId: "L100", name: "Jana" });
  });

  it("duplicita (zdroj, externí ID): 200 `{duplicate:true}` bez zpracování", async () => {
    await send({ leadgenId: "L200", name: "Jana" });
    const again = await send({ leadgenId: "L200", name: "Jana (znovu)" });
    expect(again).toMatchObject({ status: 200, body: { ok: true, duplicate: true } });
    expect(calls).toEqual(["L200"]);
    expect(await events("leads")).toHaveLength(1);
  });

  it("stejné externí ID u jiného zdroje je jiná událost", async () => {
    await send({ leadgenId: "X", name: "A" });
    const r = await send({ eventId: "X" }, { source: "drive" });
    expect(r.status).toBe(500); // drive handler vždy selže, ale ne jako duplicita
    expect(await events()).toHaveLength(2);
  });

  it("souběžné stejné požadavky zpracuje handler jen jednou", async () => {
    const rs = await Promise.all(
      Array.from({ length: 6 }, () => send({ leadgenId: "L300", name: "Souběh" })),
    );
    expect(calls).toEqual(["L300"]);
    expect(rs.filter((r) => r.status === 200).length).toBe(6);
    expect(rs.filter((r) => r.body.duplicate).length).toBe(5);
    expect(await events("leads")).toHaveLength(1);
  });

  it("selhání handleru: 500, důvod v `inbound_event` bez tajných hodnot, vedlejší účinky vráceny", async () => {
    failNext = 1;
    const r = await send({ leadgenId: "L400", name: "Petr" });
    expect(r.status).toBe(500);
    expect(r.body).toMatchObject({ error: "processing_failed" });
    expect(JSON.stringify(r.body)).not.toContain("Meta nedostupná"); // odpověď nic neprozradí
    const [row] = await events("leads");
    expect(row).toMatchObject({ status: "failed", externalId: "L400" });
    expect(row!.error).toContain("Meta nedostupná");
    expect(row!.error).not.toContain("tajny-token-123456789012345678");
    // handler se změnil na „zpracoval a spadl“: jeho zápis se vrátil
    const side = await app.db
      .select()
      .from(schema.setting)
      .where(eq(schema.setting.key, "lead:L400"));
    expect(side).toHaveLength(0);
  });

  it("n8n po 500 požadavek zopakuje: selhaná událost se zpracuje znovu a pak je duplicitní", async () => {
    failNext = 1;
    await send({ leadgenId: "L500", name: "Petr" });
    const retry = await send({ leadgenId: "L500", name: "Petr" });
    expect(retry).toMatchObject({ status: 200, body: { ok: true } });
    expect(retry.body.duplicate).toBeUndefined();
    expect(calls).toEqual(["L500", "L500"]);
    const [row] = await events("leads");
    expect(row).toMatchObject({ status: "processed", error: null });
    expect(await send({ leadgenId: "L500", name: "Petr" })).toMatchObject({
      body: { duplicate: true },
    });
    expect(calls).toHaveLength(2);
  });

  it("UserError se ukáže v protokolu srozumitelně", async () => {
    await send({ eventId: "D1" }, { source: "drive" });
    const [row] = await events("drive");
    expect(row).toMatchObject({ status: "failed", error: "Událost Disku neznám." });
  });

  it("dávno „přijatá“ a nedokončená událost (pád procesu) se zpracuje znovu, čerstvá ne", async () => {
    await app.db.insert(schema.inboundEvent).values({
      source: "leads",
      externalId: "L600",
      payload: { leadgenId: "L600", name: "A" },
      status: "received",
      receivedAt: new Date(NOW.getTime() - 60_000),
    });
    expect(await send({ leadgenId: "L600", name: "A" })).toMatchObject({
      body: { duplicate: true },
    });
    expect(calls).toEqual([]);
    const later = new Date(NOW.getTime() + 6 * 60_000);
    expect((await send({ leadgenId: "L600", name: "A" }, { now: later })).status).toBe(200);
    expect(calls).toEqual(["L600"]);
  });

  it("neplatné tělo: 400 / 422, zapíše se jako chyba a opakování stejného těla nevytvoří další řádek", async () => {
    expect((await send(null, { raw: "{nesmysl" })).status).toBe(400);
    const bad = await send({ leadgenId: "", name: 5 });
    expect(bad).toMatchObject({ status: 422, body: { error: "invalid_payload" } });
    await send({ leadgenId: "", name: 5 });
    const rows = await events("leads");
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === "failed" && r.error)).toBe(true);
    expect(calls).toEqual([]);
  });

  it("ruční opakování selhané události z uloženého těla (bez nového požadavku n8n)", async () => {
    failNext = 1;
    await send({ leadgenId: "L700", name: "Eva" });
    const [row] = await events("leads");
    const r = await reprocessInbound({ db: app.db, ingests, deps }, row!.id);
    expect(r).toMatchObject({ status: 200, body: { ok: true } });
    expect((await events("leads"))[0]).toMatchObject({ status: "processed", error: null });
    expect(calls).toEqual(["L700", "L700"]);
    // zpracovanou už znovu nespustí
    expect(await reprocessInbound({ db: app.db, ingests, deps }, row!.id)).toMatchObject({
      body: { duplicate: true },
    });
    expect(calls).toHaveLength(2);
  });
});

describe("tajemství příchozích požadavků", () => {
  it("v databázi je jen zašifrované a stav ho neprozradí", async () => {
    const a = await admin();
    const [row] = await app.db
      .select()
      .from(schema.setting)
      .where(eq(schema.setting.key, "ingest"));
    expect(JSON.stringify(row!.value)).not.toContain(secret);
    expect(JSON.stringify(await getIngestSecretStatus(a.ctx))).not.toContain(secret);
    expect(await loadIngestSecrets(app.db, cipher)).toEqual([secret]);
    const audit = await app.db.select().from(schema.auditLog);
    expect(JSON.stringify(audit)).not.toContain(secret);
  });

  it("výměna: staré tajemství platí ještě 24 h (nejdou ztratit leady), nové hned", async () => {
    const a = await admin();
    const old = secret;
    const next = await rotateIngestSecret(a.ctx, cipher);
    expect(next.previousValidUntil).not.toBeNull();
    expect((await send({ leadgenId: "R1", name: "A" }, { secret: old })).status).toBe(200);
    expect((await send({ leadgenId: "R2", name: "A" }, { secret: next.secret })).status).toBe(200);
    const after = new Date(NOW.getTime() + 25 * 3_600_000);
    expect((await send({ leadgenId: "R3", name: "A" }, { secret: old, now: after })).status).toBe(
      401,
    );
    expect(
      (await send({ leadgenId: "R4", name: "A" }, { secret: next.secret, now: after })).status,
    ).toBe(200);
  });

  it("výměna s okamžitým zneplatněním starého", async () => {
    const a = await admin();
    const old = secret;
    const next = await rotateIngestSecret(a.ctx, cipher, { revokeOld: true });
    expect(next.previousValidUntil).toBeNull();
    expect((await send({ leadgenId: "V1", name: "A" }, { secret: old })).status).toBe(401);
    expect((await send({ leadgenId: "V2", name: "A" }, { secret: next.secret })).status).toBe(200);
  });

  it("výměnu i stav smí jen správce integrací", async () => {
    const other = await makeUser(app.db, [["settings.manage", "all"]]);
    await expect(rotateIngestSecret(other.ctx, cipher)).rejects.toThrow(PermissionError);
    await expect(getIngestSecretStatus(other.ctx)).rejects.toThrow(PermissionError);
    await expect(listInboundEvents(other.ctx)).rejects.toThrow(PermissionError);
  });
});

describe("seznam příchozích událostí", () => {
  it("vrací stav a chybu, ale ne tělo (osobní údaje z leadů)", async () => {
    const a = await admin();
    failNext = 1;
    await send({ leadgenId: "S1", name: "Tajné Jméno" });
    await send({ leadgenId: "S2", name: "Jiné" });
    const all = await listInboundEvents(a.ctx);
    expect(all.map((e) => [e.externalId, e.status]).sort()).toEqual([
      ["S1", "failed"],
      ["S2", "processed"],
    ]);
    expect(JSON.stringify(all)).not.toContain("Tajné Jméno");
    expect(await listInboundEvents(a.ctx, { status: "failed" })).toHaveLength(1);
    expect(await listInboundEvents(a.ctx, { source: "drive" })).toHaveLength(0);
  });
});
