import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { schema } from "../db/client";
import { systemCtx } from "../rbac/context";
import { PermissionError } from "../rbac/errors";
import { createCipher, parseKeyRing } from "../security/crypto";
import { connectAppDb, makeUser } from "../testing";
import { createEndpoint, listEndpoints } from "../webhooks/endpoints";
import { createCredentialStore } from "./credentials";
import { getIntegrationStatus } from "./status";

const app = connectAppDb();
const cipher = createCipher(parseKeyRing({ APP_ENCRYPTION_KEY: randomBytes(32).toString("base64") }));
const store = createCredentialStore(cipher);
afterAll(() => app.close());

const TOKEN = "ya29.a0-velmi-tajny-access-token-QWERTY";
const REFRESH = "1//0g-velmi-tajny-refresh-token-ASDFGH";

beforeEach(async () => {
  await app.db.delete(schema.integrationCredential);
  await app.db.delete(schema.webhookDelivery);
  await app.db.delete(schema.webhookEndpoint);
  await app.db.delete(schema.inboundEvent);
});

describe("integration_credential: šifrovaná tajemství poskytovatelů", () => {
  it("ukládá jen zašifrované; čitelné je jen přes `load`; do auditu a seznamu se nedostane", async () => {
    const admin = await makeUser(app.db, [["settings.integrations", "all"]]);
    await store.save(admin.ctx, {
      provider: "meta",
      data: { accessToken: TOKEN, refreshToken: REFRESH, expiresAt: "2026-12-31" },
    });
    const [row] = await app.db.select().from(schema.integrationCredential);
    expect(row!.dataEnc).not.toContain(TOKEN);
    expect(row!.dataEnc).not.toContain(REFRESH);
    expect(row!.dataEnc.startsWith("v2.")).toBe(true);

    const loaded = await store.load<{ accessToken: string }>(app.db, "meta");
    expect(loaded).toMatchObject({ status: "ok", data: { accessToken: TOKEN } });

    const everything = JSON.stringify([
      await app.db.select().from(schema.auditLog),
      await store.list(admin.ctx),
    ]);
    expect(everything).not.toContain(TOKEN);
    expect(everything).not.toContain(REFRESH);
    expect(everything).toContain("integration_credential"); // změna je v historii, jen bez obsahu
  });

  it("opakované uložení přepíše (jeden společný přístup na poskytovatele), stav jde měnit", async () => {
    const admin = await makeUser(app.db, [["settings.integrations", "all"]]);
    await store.save(admin.ctx, { provider: "fakturoid", data: { key: "a" } });
    await store.save(admin.ctx, { provider: "fakturoid", data: { key: "b" } });
    expect(await app.db.select().from(schema.integrationCredential)).toHaveLength(1);
    expect((await store.load<{ key: string }>(app.db, "fakturoid"))?.data.key).toBe("b");
    await store.setStatus(app.db, "fakturoid", null, "reauth");
    expect((await store.load(app.db, "fakturoid"))?.status).toBe("reauth");
  });

  it("osobní přístup (Google účet uživatele) vidí a mění jen jeho vlastník nebo správce integrací", async () => {
    const me = await makeUser(app.db);
    const other = await makeUser(app.db);
    const admin = await makeUser(app.db, [["settings.integrations", "all"]]);
    await store.save(me.ctx, { provider: "google", userId: me.id, data: { refresh: REFRESH } });
    await expect(
      store.save(other.ctx, { provider: "google", userId: me.id, data: { refresh: "x" } }),
    ).rejects.toThrow(PermissionError);
    await expect(store.remove(other.ctx, "google", me.id)).rejects.toThrow(PermissionError);
    // společný přístup bez oprávnění ne
    await expect(store.save(me.ctx, { provider: "meta", data: { t: 1 } })).rejects.toThrow(PermissionError);

    expect((await store.list(me.ctx)).map((c) => c.provider)).toEqual(["google"]);
    expect(await store.list(other.ctx)).toEqual([]);
    expect(await store.list(admin.ctx)).toHaveLength(1);
    expect((await store.load<{ refresh: string }>(app.db, "google", me.id))?.data.refresh).toBe(REFRESH);
    expect(await store.load(app.db, "google", other.id)).toBeNull();
    expect(await store.remove(me.ctx, "google", me.id)).toBe(true);
    expect(await store.load(app.db, "google", me.id)).toBeNull();
  });

  it("systémový kontext (úloha na pozadí, OAuth callback) smí ukládat", async () => {
    await store.save(systemCtx(app.db), { provider: "meta", data: { t: TOKEN } });
    expect((await store.load<{ t: string }>(app.db, "meta"))?.data.t).toBe(TOKEN);
  });

  it("po změně šifrovacího klíče nejde dešifrovat a `load` vrátí null (žádná výjimka s obsahem)", async () => {
    await store.save(systemCtx(app.db), { provider: "meta", data: { t: TOKEN } });
    const other = createCredentialStore(
      createCipher(parseKeyRing({ APP_ENCRYPTION_KEY: randomBytes(32).toString("base64") })),
    );
    expect(await other.load(app.db, "meta")).toBeNull();
  });
});

describe("stav integrací (Nastavení → Integrace a Systém)", () => {
  it("počty doručení, příchozí zdroje a přístupy; bez obsahu zpráv", async () => {
    const admin = await makeUser(app.db, [["settings.integrations", "all"], ["private.read", "all"]]);
    const e = await createEndpoint(admin.ctx, cipher, {
      name: "n8n",
      url: "http://localhost:5678/webhook/x",
      events: ["deal.won"],
      includePrivate: false,
    });
    const payload = { event: "deal.won", entity: { isPrivate: false }, data: { titulek: "TAJNY-OBSAH" } };
    const mk = (status: "pending" | "delivered" | "failed") => ({
      endpointId: e.id, eventId: crypto.randomUUID(), event: "deal.won", payload, status,
      ...(status === "delivered" ? { deliveredAt: new Date() } : {}),
    });
    await app.db.insert(schema.webhookDelivery).values([mk("pending"), mk("failed"), mk("failed"), mk("delivered")]);
    await app.db.insert(schema.inboundEvent).values([
      { source: "leads", externalId: "a", payload: {}, status: "processed", processedAt: new Date() },
      { source: "leads", externalId: "b", payload: {}, status: "failed", error: "chyba" },
    ]);
    await store.save(admin.ctx, { provider: "meta", data: { t: 1 }, status: "reauth" });

    const s = await getIntegrationStatus(admin.ctx, cipher);
    expect(s.webhooks).toMatchObject({ endpointsActive: 1, endpointsTotal: 1, pending: 1, failed: 2, delivered24h: 1 });
    expect(s.webhooks.lastDeliveredAt).not.toBeNull();
    expect(s.inbound).toEqual([
      expect.objectContaining({ source: "leads", failedTotal: 1, failed24h: 1 }),
    ]);
    expect(s.inbound[0]!.lastProcessedAt).not.toBeNull();
    expect(s.credentials).toEqual([expect.objectContaining({ provider: "meta", status: "reauth" })]);
    expect(s.problems).toBe(2 + 1 + 1);
    expect(JSON.stringify(s)).not.toContain("TAJNY-OBSAH");
  });

  it("počty nezahrnují soukromá doručení, když aktér nesmí soukromé", async () => {
    const full = await makeUser(app.db, [["settings.integrations", "all"], ["private.read", "all"]]);
    const limited = await makeUser(app.db, [["settings.integrations", "all"]]);
    const e = await createEndpoint(full.ctx, cipher, {
      name: "n8n", url: "http://localhost:5678/x", events: ["deal.won"], includePrivate: true,
    });
    await app.db.insert(schema.webhookDelivery).values([
      { endpointId: e.id, eventId: crypto.randomUUID(), event: "deal.won", payload: { entity: { isPrivate: true } }, status: "failed" },
      { endpointId: e.id, eventId: crypto.randomUUID(), event: "deal.won", payload: { entity: { isPrivate: false } }, status: "failed" },
    ]);
    expect((await getIntegrationStatus(full.ctx, cipher)).webhooks.failed).toBe(2);
    expect((await getIntegrationStatus(limited.ctx, cipher)).webhooks.failed).toBe(1);
    expect((await listEndpoints(limited.ctx))[0]!.counts.failed).toBe(1);
  });

  it("stav smí číst správce integrací nebo nastavení, jiný ne", async () => {
    const sys = await makeUser(app.db, [["settings.manage", "all"]]);
    const nobody = await makeUser(app.db);
    await expect(getIntegrationStatus(sys.ctx, cipher)).resolves.toBeDefined();
    await expect(getIntegrationStatus(nobody.ctx, cipher)).rejects.toThrow(PermissionError);
    expect(await app.db.select().from(schema.integrationCredential).where(eq(schema.integrationCredential.provider, "meta"))).toEqual([]);
  });
});
