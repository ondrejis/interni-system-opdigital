import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { createQueueClient, defineJob, installQueues } from "../jobs/jobs";
import { z } from "zod";
import { connectAppDb, rebarDbUrls } from "../testing";
import { getHealth, sendHeartbeat } from "./health";

const app = connectAppDb();
afterAll(() => app.close());

async function tmp() {
  return fs.mkdtemp(path.join(os.tmpdir(), "health-"));
}

describe("getHealth", () => {
  it("zdravá instance: databáze, disk, verze; bez záloh a se čistou frontou je stav ok", async () => {
    const dir = await tmp();
    const r = await getHealth({ db: app.db, dataDir: dir, version: "1.2.3" });
    expect(r.db.ok).toBe(true);
    expect(r.db.latencyMs).toBeGreaterThanOrEqual(0);
    expect(r.disk?.totalBytes).toBeGreaterThan(0);
    expect(r.disk?.freePercent).toBeGreaterThan(0);
    expect(r).toMatchObject({ version: "1.2.3", backup: null });
    expect(r.queue).not.toBeNull();
    expect(["ok", "degraded"]).toContain(r.status); // degraded jen kvůli neúspěšným úlohám z jiných testů
  });

  it("databáze mimo provoz = fail", async () => {
    const dead = createDb("postgres://rebar_app:app@localhost:1/neni", { max: 1 });
    const r = await getHealth({ db: dead.db, dataDir: await tmp(), version: "x" });
    expect(r.status).toBe("fail");
    expect(r.db.ok).toBe(false);
    expect(r.problems.join(" ")).toMatch(/Databáze neodpovídá/);
    await dead.close().catch(() => {});
  });

  it("záloha: čerstvá je v pořádku, stará nebo nečitelná = degraded", async () => {
    const dir = await tmp();
    const file = path.join(dir, "backup.json");
    const now = new Date("2026-10-08T12:00:00Z");

    await fs.writeFile(file, JSON.stringify({ lastSuccessAt: "2026-10-08T03:00:00Z" }));
    const fresh = await getHealth({
      db: app.db,
      dataDir: dir,
      version: "x",
      backupStatusFile: file,
      now: () => now,
    });
    expect(fresh.backup).toEqual({ lastSuccessAt: "2026-10-08T03:00:00.000Z", ageHours: 9 });
    expect(fresh.problems.join(" ")).not.toMatch(/záloh/);

    await fs.writeFile(file, JSON.stringify({ lastSuccessAt: "2026-10-05T03:00:00Z" }));
    const stale = await getHealth({
      db: app.db,
      dataDir: dir,
      version: "x",
      backupStatusFile: file,
      now: () => now,
    });
    expect(stale.status).not.toBe("ok");
    expect(stale.problems.join(" ")).toMatch(/Poslední záloha je stará/);

    await fs.writeFile(file, "není json");
    const broken = await getHealth({
      db: app.db,
      dataDir: dir,
      version: "x",
      backupStatusFile: file,
      now: () => now,
    });
    expect(broken.problems.join(" ")).toMatch(/Není záznam o úspěšné záloze/);

    const missing = await getHealth({
      db: app.db,
      dataDir: dir,
      version: "x",
      backupStatusFile: path.join(dir, "neni.json"),
      now: () => now,
    });
    expect(missing.backup).toEqual({ lastSuccessAt: null, ageHours: null });
  });

  it("zkouška obnovy: selhání a stará zkouška zhorší stav, čerstvá úspěšná ne", async () => {
    const dir = await tmp();
    const file = path.join(dir, "backup.json");
    const now = new Date("2026-10-08T12:00:00Z");
    const check = async (restoreTest: unknown) => {
      await fs.writeFile(
        file,
        JSON.stringify({ lastSuccessAt: "2026-10-08T03:00:00Z", restoreTest }),
      );
      return getHealth({
        db: app.db,
        dataDir: dir,
        version: "x",
        backupStatusFile: file,
        now: () => now,
      });
    };
    const ok = await check({ at: "2026-10-02T04:00:00Z", ok: true, detail: "31 tabulek" });
    expect(ok.backup?.restoreTest).toEqual({
      at: "2026-10-02T04:00:00.000Z",
      ok: true,
      detail: "31 tabulek",
    });
    expect(ok.problems.join(" ")).not.toMatch(/obnovy/);

    const failed = await check({ at: "2026-10-02T04:00:00Z", ok: false, detail: "chybí tabulka" });
    expect(failed.status).toBe("degraded");
    expect(failed.problems.join(" ")).toMatch(/Zkouška obnovy ze zálohy selhala: chybí tabulka/);

    const old = await check({ at: "2026-08-01T04:00:00Z", ok: true, detail: null });
    expect(old.problems.join(" ")).toMatch(/zkouška obnovy ze zálohy je stará 68 dní/);
  });

  it("fronta: úloha čekající déle než 15 min zhorší stav, čerstvá ne", async () => {
    const job = defineJob({ name: "test.health", schema: z.object({}), handler: async () => {} });
    await installQueues(rebarDbUrls().migrator, [job]);
    const q = createQueueClient({ connectionString: rebarDbUrls().app });
    await q.start();
    try {
      await q.send(job, {});
      const quick = await getHealth({ db: app.db, dataDir: await tmp(), version: "x" });
      expect(quick.queue?.oldestReadySeconds).toBeLessThan(900);

      await app.sql`update pgboss.job set created_on = now() - interval '20 minutes' where name = 'test.health' and state = 'created'`;
      const lagging = await getHealth({ db: app.db, dataDir: await tmp(), version: "x" });
      expect(lagging.queue?.oldestReadySeconds).toBeGreaterThan(900);
      expect(lagging.problems.join(" ")).toMatch(/Fronta úloh zaostává/);
    } finally {
      await app.sql`delete from pgboss.job where name = 'test.health'`;
      await q.stop();
    }
  });
});

describe("sendHeartbeat", () => {
  it("pošle jen instanci, verzi, stav a počet problémů — žádné osobní údaje ani obsah", async () => {
    let body: Record<string, unknown> = {};
    let url = "";
    const fakeFetch = (async (u: string, init: RequestInit) => {
      url = u;
      body = JSON.parse(init.body as string);
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;
    await sendHeartbeat(
      "https://agentura.example/hb",
      { status: "degraded", version: "1.2.3", problems: ["Na disku zbývá 9 %.", "jiné"] },
      "stavby-novak",
      fakeFetch,
    );
    expect(url).toBe("https://agentura.example/hb");
    expect(Object.keys(body).sort()).toEqual([
      "at",
      "instance",
      "problemCount",
      "status",
      "version",
    ]);
    expect(body).toMatchObject({
      instance: "stavby-novak",
      version: "1.2.3",
      status: "degraded",
      problemCount: 2,
    });
    expect(JSON.stringify(body)).not.toContain("disku"); // texty problémů se neposílají
  });

  it("odpověď mimo 2xx je chyba (úloha se zopakuje)", async () => {
    const fail = (async () => new Response("no", { status: 503 })) as unknown as typeof fetch;
    await expect(
      sendHeartbeat(
        "https://agentura.example/hb",
        { status: "ok", version: "x", problems: [] },
        "i",
        fail,
      ),
    ).rejects.toThrow(/503/);
  });
});
