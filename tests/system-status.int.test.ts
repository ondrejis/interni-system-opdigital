import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema, type Db } from "@rebar/core/db";
import { PermissionError } from "@rebar/core/rbac";
import { connectAppDb } from "@rebar/core/testing";
import {
  loadSystemStatus,
  readBackupDetail,
} from "../apps/web/src/app/(app)/nastaveni/system/system-status";
import { buildFixture, isolatedDb, type Fixture } from "./support/security-fixture";

/*
  Nastavení → Systém (NAS-11, NFR-12, NFR-13): stav systému, záloha a zkouška obnovy ze stavového souboru, velikost
  databáze, fronty, chyby integrací a chybná doručení webhooků. Jen vlastník; nic z toho neobsahuje tajemství.
*/
const app = connectAppDb();
let f: Fixture;
let db: Db;
let discard: () => Promise<void>;
let dir: string;
let statusFile: string;
const SECRET_ENC = "v2.TAJNE-ENC-HODNOTA-NESMI-VEN";

beforeAll(async () => {
  ({ db, discard } = await isolatedDb(app.db));
  f = await buildFixture(db);
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "system-status-"));
  statusFile = path.join(dir, "backup.json");
}, 120_000);
afterAll(async () => {
  fs.rmSync(dir, { recursive: true, force: true });
  await discard();
  await app.close();
});

const deps = () => ({
  cipher: f.deps.cipher,
  dataDir: dir,
  version: "v9.9.9-test",
  backupStatusFile: statusFile,
  heartbeatUrl: undefined,
});

describe("readBackupDetail: stavový soubor záloh", () => {
  it("bez nastavené cesty nebo před první zálohou nic nevyhodí a nic nevymýšlí", async () => {
    expect(await readBackupDetail(undefined)).toMatchObject({ configured: false, readable: false });
    expect(await readBackupDetail(path.join(dir, "neexistuje.json"))).toMatchObject({
      configured: true,
      readable: false,
      lastSuccessAt: null,
      restoreTest: null,
    });
  });

  it("poškozený soubor se tváří jako nečitelný, platný se přečte včetně zkoušky obnovy a poslední chyby", async () => {
    fs.writeFileSync(statusFile, "{ rozbité");
    expect((await readBackupDetail(statusFile)).readable).toBe(false);
    fs.writeFileSync(
      statusFile,
      JSON.stringify({
        lastSuccessAt: "2026-10-14T00:31:00Z",
        lastSnapshot: "ab12cd34",
        dumpBytes: 123456,
        snapshots: 42,
        lastFailureAt: "2026-10-13T00:30:00Z",
        lastError: "záloha selhala (viz log kontejneru backup)",
        restoreTest: { at: "2026-10-01T02:35:00Z", ok: true, detail: "obnoveno 80 tabulek" },
      }),
    );
    expect(await readBackupDetail(statusFile)).toEqual({
      configured: true,
      readable: true,
      lastSuccessAt: "2026-10-14T00:31:00.000Z",
      lastSnapshot: "ab12cd34",
      dumpBytes: 123456,
      snapshots: 42,
      lastFailureAt: "2026-10-13T00:30:00.000Z",
      lastError: "záloha selhala (viz log kontejneru backup)",
      restoreTest: { at: "2026-10-01T02:35:00.000Z", ok: true, detail: "obnoveno 80 tabulek" },
    });
  });
});

describe("loadSystemStatus", () => {
  it("partner (bez settings.manage) stav systému nevidí", async () => {
    await expect(loadSystemStatus(f.people.partner.ctx, deps())).rejects.toBeInstanceOf(
      PermissionError,
    );
  });

  it("vlastník dostane zdraví, verzi, zálohy, velikost databáze, fronty a prázdné chyby integrací", async () => {
    fs.writeFileSync(
      statusFile,
      JSON.stringify({
        lastSuccessAt: new Date().toISOString(),
        lastSnapshot: "ab12cd34",
        dumpBytes: 2048,
        restoreTest: { at: new Date().toISOString(), ok: true, detail: "ok" },
      }),
    );
    const s = await loadSystemStatus(f.people.owner.ctx, deps());
    expect(s.version).toBe("v9.9.9-test");
    expect(s.health.db.ok).toBe(true);
    expect(s.backup).toMatchObject({ readable: true, lastSnapshot: "ab12cd34", dumpBytes: 2048 });
    expect(s.backup.restoreTest?.ok).toBe(true);
    expect(s.health.backup?.restoreTest?.ok).toBe(true);
    expect(s.database.available).toBe(true);
    expect(s.database.sizeBytes).toBeGreaterThan(1_000_000);
    expect(s.database.tables.length).toBeGreaterThan(0);
    expect(s.queue).toHaveProperty("ready");
    expect(s.failedDeliveries).toEqual([]);
    expect(s.failedInbound).toEqual([]);
    expect(s.integrations.problems).toBe(0);
    expect(s.heartbeat.configured).toBe(false);
  });

  it("neúspěšná záloha a neúspěšná zkouška obnovy se propíšou do stavu a počtu věcí k řešení", async () => {
    fs.writeFileSync(
      statusFile,
      JSON.stringify({
        lastSuccessAt: new Date(Date.now() - 3600_000).toISOString(),
        lastFailureAt: new Date().toISOString(),
        lastError: "záloha selhala (viz log kontejneru backup)",
        restoreTest: { at: new Date().toISOString(), ok: false, detail: "pg_restore selhal" },
      }),
    );
    const s = await loadSystemStatus(f.people.owner.ctx, deps());
    expect(s.health.status).toBe("degraded");
    expect(s.health.problems.join(" ")).toMatch(/Zkouška obnovy ze zálohy selhala/);
    expect(s.backup.lastError).toMatch(/záloha selhala/);
    expect(s.attention).toBeGreaterThanOrEqual(2);
  });

  it("chybná doručení webhooků a selhané příchozí události jsou vidět, tajemství ne", async () => {
    const endpointId = randomUUID();
    await db.insert(schema.webhookEndpoint).values({
      id: endpointId,
      name: "n8n Disk",
      url: "https://n8n.example.test/webhook/drive",
      secretEnc: SECRET_ENC,
      events: ["drive.*"],
    });
    await db.insert(schema.webhookDelivery).values({
      endpointId,
      eventId: randomUUID(),
      event: "drive.client.create",
      payload: { hovno: "PAYLOAD-NESMI-VEN" },
      status: "failed",
      attempts: 5,
      lastError: "2026-10-14T10:00:00Z · HTTP 502",
    });
    await db.insert(schema.inboundEvent).values({
      source: "leads",
      externalId: "lead-1",
      payload: { email: "lead@example.test" },
      status: "failed",
      error: "Neznámý formulář",
    });
    const s = await loadSystemStatus(f.people.owner.ctx, deps());
    expect(s.failedDeliveries).toHaveLength(1);
    expect(s.failedDeliveries[0]).toMatchObject({
      event: "drive.client.create",
      endpointName: "n8n Disk",
      attempts: 5,
    });
    expect(s.failedInbound).toHaveLength(1);
    expect(s.failedInbound[0]?.error).toBe("Neznámý formulář");
    expect(s.integrations.webhooks.failed).toBe(1);
    expect(s.integrations.problems).toBeGreaterThanOrEqual(2);
    const dump = JSON.stringify(s);
    expect(dump).not.toContain(SECRET_ENC);
    expect(dump).not.toContain("PAYLOAD-NESMI-VEN");
    expect(dump).not.toContain("lead@example.test");
  });
});
