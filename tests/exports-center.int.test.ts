import { randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@rebar/core/db";
import type { Db } from "@rebar/core/db";
import {
  cleanupRuns,
  deleteTemplate,
  executeRun,
  listRuns,
  listSchedules,
  listTemplates,
  openRunFile,
  runDueSchedules,
  saveSchedule,
  saveTemplate,
  setScheduleActive,
  startExport,
  unsubscribeFromSchedule,
  exportRunJob,
  type ExportRuntime,
} from "@rebar/core/export";
import type { StorageDriver } from "@rebar/core/files";
import { createSettings } from "@rebar/core/settings";
import { createCipher, parseKeyRing } from "@rebar/core/security";
import { PermissionError, UserError, type Ctx } from "@rebar/core/rbac";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { company } from "@rebar/kontakty/schema";
import { buildFixture, isolatedDb, MONEY, type Fixture } from "./support/legacy/fixture";
import { collect, unzip } from "./support/unzip";

/** Exporty: oprávnění a skryté sloupce, audit, velké exporty na pozadí, Moje exporty, šablony, plány (idempotence, příjemci). */
const app = connectAppDb();
let f: Fixture;
let db: Db;
let discard: () => Promise<void>;
let rt: ExportRuntime;
const files = new Map<string, Buffer>();
const sent: { name: string; data: unknown }[] = [];

const storage: StorageDriver = {
  put: async (k, d) => void files.set(k, d),
  get: async (k) => {
    if (!files.has(k)) throw new Error("není");
    return Readable.from([files.get(k)!]);
  },
  delete: async (k) => void files.delete(k),
  exists: async (k) => files.has(k),
};

beforeAll(async () => {
  ({ db, discard } = await isolatedDb(app.db));
  f = await buildFixture(db);
  const cipher = createCipher(
    parseKeyRing({ APP_ENCRYPTION_KEY: randomBytes(32).toString("base64") }),
  );
  rt = {
    db,
    registry: f.registry,
    storage,
    catalog: f.catalog,
    settings: createSettings(cipher),
    queue: {
      send: async (job: { name: string }, data: unknown) => (
        sent.push({ name: job.name, data }),
        "id"
      ),
    } as never,
    cipher,
    baseURL: "http://localhost:3100",
    config: {
      enabled: true,
      csvDelimiter: ";",
      scheduled: true,
      syncMaxRows: 5000,
      retentionDays: 7,
    },
    brand: async () => "Test firma",
  };
}, 120_000);
afterAll(async () => {
  await discard();
  await app.close();
});

const P = () => f.people;
const specOf = (over: Record<string, unknown> = {}) => ({
  entity: "company",
  format: "csv" as const,
  columns: ["name", "ico"],
  ...over,
});
const text = async (c: AsyncGenerator<Buffer>) => (await collect(c)).toString("utf8");

describe("export seznamu: oprávnění, obsah, audit", () => {
  it("export respektuje oprávnění: externista bez práva na firmy nic nedostane", async () => {
    await expect(startExport(P().externistaA.ctx, rt, specOf())).rejects.toBeInstanceOf(
      PermissionError,
    );
  });

  it("citlivé sloupce bez práva nikdy: externista nemůže vyexportovat cenu zakázky ani změnou sloupců", async () => {
    await expect(
      startExport(P().externistaA.ctx, rt, {
        entity: "job",
        format: "csv",
        columns: ["title", "price"],
      }),
    ).rejects.toThrow(/neznámý nebo nedostupný sloupec/);
    const ok = await startExport(P().owner.ctx, rt, {
      entity: "job",
      format: "csv",
      columns: ["title", "price"],
    });
    expect(ok.mode).toBe("stream");
    if (ok.mode === "stream") expect(await text(ok.prepared.chunks)).toContain("77");
    // externista: jen svá data (rozsah „jen moje“), výchozí sloupce bez cen
    const mine = await startExport(P().externistaA.ctx, rt, { entity: "job", format: "csv" });
    if (mine.mode !== "stream") throw new Error("čekal se stream");
    const csv = await text(mine.prepared.chunks);
    expect(csv).toContain("Zakázka A");
    expect(csv).not.toContain("Zakázka B");
    expect(csv).not.toContain(String(MONEY.value / 100));
  });

  it("audit i záznam o exportu vznikne při každém exportu (kdo, co, kolik řádků, filtr), i s nulou řádků", async () => {
    const r = await startExport(P().owner.ctx, rt, {
      entity: "job",
      format: "csv",
      columns: ["title"],
      query: {
        filters: {
          op: "and",
          conditions: [{ attr: "title", op: "contains", value: "žádná taková zakázka" }],
        },
      },
    });
    expect(r.mode === "stream" && r.prepared.count).toBe(0);
    if (r.mode === "stream") await collect(r.prepared.chunks);
    const audit = await db
      .select()
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.action, "export"),
          eq(schema.auditLog.entityType, "job"),
          eq(schema.auditLog.actorId, P().owner.id),
        ),
      );
    const last = audit.at(-1)!;
    expect(last.summary).toContain("0 záznamů");
    expect(JSON.stringify(last.changes)).toContain("žádná taková zakázka");
    const runs = await listRuns(P().owner.ctx);
    expect(runs[0]).toMatchObject({ source: "manual", status: "done", rowCount: 0 });
  });

  it("CSV: oddělovač podle klienta, BOM, desetinné číslo, ochrana proti vzorcům", async () => {
    await db.insert(company).values({ name: '=HYPERLINK("http://x")', ico: "@SUM(1)" });
    const csv = await startExport(P().owner.ctx, rt, specOf({ query: { q: "HYPERLINK" } }));
    if (csv.mode !== "stream") throw new Error("stream");
    const t = await text(csv.prepared.chunks);
    expect(t.startsWith("﻿")).toBe(true);
    expect(t).toContain("'=HYPERLINK");
    expect(t).not.toMatch(/(^|;)=HYPERLINK/m);
    expect(t).toContain("'@SUM(1)");
    // čárka: ukládá se v nastavení administrace
    const admin = await makeUser(db, [
      ["settings.manage", "all"],
      ["kontakty.read", "all"],
      ["kontakty.export", "all"],
    ]);
    const { exportSetting } = await import("@rebar/core/export");
    await rt.settings.set(admin.ctx, exportSetting, { csvDelimiter: "," });
    const comma = await startExport(admin.ctx, rt, specOf({ query: { q: "Klient s.r.o." } }));
    if (comma.mode !== "stream") throw new Error("stream");
    expect((await text(comma.prepared.chunks)).split("\r\n")[0]).toBe("﻿Název,IČO");
    await rt.settings.set(admin.ctx, exportSetting, { csvDelimiter: null });
  });

  it("XLSX a PDF: správný typ souboru; PDF má hlavičku klienta", async () => {
    const x = await startExport(P().owner.ctx, rt, specOf({ format: "xlsx" }));
    if (x.mode !== "stream") throw new Error("stream");
    const zip = unzip(await collect(x.prepared.chunks));
    expect(zip.has("xl/worksheets/sheet1.xml")).toBe(true);
    const sheet = zip.get("xl/worksheets/sheet1.xml")!.toString();
    // vzorec zůstává textem
    expect(sheet).toContain('t="inlineStr"');
    const p = await startExport(
      P().owner.ctx,
      rt,
      specOf({ format: "pdf", fileName: "firmy-{datum}" }),
    );
    if (p.mode !== "stream") throw new Error("stream");
    expect(p.prepared.filename).toMatch(/^firmy-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect((await collect(p.prepared.chunks)).subarray(0, 5).toString()).toBe("%PDF-");
  });
});

describe("velké exporty na pozadí a Moje exporty", () => {
  it("nad limitem se export zařadí do fronty; úloha ho provede s právy uživatele, uloží soubor a upozorní", async () => {
    const small: ExportRuntime = { ...rt, config: { ...rt.config, syncMaxRows: 100 } };
    const r = await startExport(
      P().owner.ctx,
      small,
      specOf({ query: { sort: [{ attr: "name", dir: "asc" }] } }),
      {
        background: true,
      },
    );
    expect(r.mode).toBe("queued");
    if (r.mode !== "queued") return;
    expect(sent.at(-1)).toMatchObject({ name: exportRunJob.name, data: { runId: r.runId } });
    expect((await listRuns(P().owner.ctx)).find((x) => x.id === r.runId)?.status).toBe("queued");
    await executeRun(small, r.runId);
    await executeRun(small, r.runId); // opakované spuštění nic nezdvojí
    const run = (await listRuns(P().owner.ctx)).find((x) => x.id === r.runId)!;
    expect(run).toMatchObject({ status: "done", downloadable: true });
    expect(run.rowCount).toBeGreaterThan(0);
    const file = await openRunFile(P().owner.ctx, rt, r.runId);
    expect(file.filename).toMatch(/\.csv$/);
    expect(files.has(`exports/${r.runId}.csv`)).toBe(true);
    const notes = await db
      .select()
      .from(schema.notification)
      .where(
        and(
          eq(schema.notification.userId, P().owner.id),
          eq(schema.notification.kind, "export_ready"),
        ),
      );
    expect(notes.length).toBe(1);
    // cizí uživatel soubor nedostane
    await expect(openRunFile(P().partner.ctx, rt, r.runId)).rejects.toThrow(/nenalezen/);
  });

  it("export na pozadí běží s aktuálními právy: kdo mezitím o právo přišel, dostane chybu", async () => {
    const u = await makeUser(db, [
      ["kontakty.read", "all"],
      ["kontakty.export", "all"],
    ]);
    const r = await startExport(u.ctx, rt, specOf(), { background: true });
    if (r.mode !== "queued") throw new Error("queued");
    await db.execute(
      sql`delete from role_permission where role_id = (select role_id from "user" where id = ${u.id})`,
    );
    await executeRun(rt, r.runId);
    const run = (await listRuns(u.ctx))[0]!;
    expect(run.status).toBe("failed");
    expect(run.error).toBeTruthy();
  });

  it("úklid po uplynutí doby uchování smaže soubor a označí export jako vypršelý; stažení pak selže", async () => {
    const r = await startExport(P().owner.ctx, rt, specOf(), { background: true });
    if (r.mode !== "queued") throw new Error("queued");
    await executeRun(rt, r.runId);
    await db.execute(
      sql`update export_run set expires_at = now() - interval '1 hour' where id = ${r.runId}`,
    );
    await expect(openRunFile(P().owner.ctx, rt, r.runId)).rejects.toThrow(/vypršela/);
    const res = await cleanupRuns(rt);
    expect(res.removed).toBeGreaterThanOrEqual(1);
    expect(files.has(`exports/${r.runId}.csv`)).toBe(false);
    expect((await listRuns(P().owner.ctx)).find((x) => x.id === r.runId)?.status).toBe("expired");
  });

  it("exporty všech vidí jen správce exportů, soubory cizích ani on ne", async () => {
    await expect(listRuns(P().partner.ctx, { all: true })).rejects.toBeInstanceOf(PermissionError);
    const mgr = await makeUser(db, [["exports.manage", "all"]]);
    const all = await listRuns(mgr.ctx, { all: true });
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((x) => !x.downloadable)).toBe(true);
  });
});

describe("šablony exportů", () => {
  it("vlastní a sdílené; sdílet smí jen s oprávněním plánovat; cizí šablonu nesmaže", async () => {
    const sched = await makeUser(db, [
      ["kontakty.read", "all"],
      ["kontakty.export", "all"],
      ["exports.schedule", "all"],
    ]);
    const plain = await makeUser(db, [
      ["kontakty.read", "all"],
      ["kontakty.export", "all"],
    ]);
    const spec = specOf({ format: "xlsx", query: { q: "Klient" } });
    const t = await saveTemplate(sched.ctx, rt, { name: "Klienti", shared: true, spec });
    await expect(
      saveTemplate(plain.ctx, rt, { name: "Moje sdílená", shared: true, spec }),
    ).rejects.toBeInstanceOf(PermissionError);
    const own = await saveTemplate(plain.ctx, rt, { name: "Moje", shared: false, spec });
    const seen = (await listTemplates(plain.ctx, rt)).map((x) => x.name);
    expect(seen).toEqual(expect.arrayContaining(["Klienti", "Moje"]));
    expect((await listTemplates(sched.ctx, rt)).map((x) => x.name)).not.toContain("Moje");
    await expect(deleteTemplate(plain.ctx, t.id)).rejects.toThrow(/nenalezena/);
    await deleteTemplate(plain.ctx, own.id);
    // šablona na sloupec bez práva se neuloží
    await expect(
      saveTemplate(plain.ctx, rt, {
        name: "Zlá",
        shared: false,
        spec: { entity: "job", format: "csv", columns: ["price"] },
      }),
    ).rejects.toThrow();
  });
});

describe("plánované exporty", () => {
  const schedule = (over: Record<string, unknown> = {}) => ({
    name: "Denní firmy",
    spec: specOf(),
    recipients: [] as string[],
    deliver: "myexports" as const,
    frequency: "daily" as const,
    weekday: null,
    monthDay: null,
    timeLocal: "06:00",
    ...over,
  });

  it("příjemce e-mailem jen uživatel s právem na data; plán vyžaduje exports.schedule", async () => {
    const owner = P().owner;
    const noData = await makeUser(db, [["exports.schedule", "all"]]);
    await expect(
      saveSchedule(P().externistaA.ctx, rt, schedule({ recipients: [P().externistaA.id] })),
    ).rejects.toBeInstanceOf(PermissionError);
    await expect(
      saveSchedule(owner.ctx, rt, schedule({ recipients: [noData.id] })),
    ).rejects.toThrow(/nemá právo na data/);
    await expect(saveSchedule(owner.ctx, rt, schedule({ recipients: [] }))).rejects.toThrow(
      /aspoň jednoho příjemce/,
    );
  });

  it("plánovač: spustí splatný plán jednou (idempotence), posune další spuštění a příjemce dostane e-mail s přílohou", async () => {
    const owner = P().owner;
    const { id } = await saveSchedule(
      owner.ctx,
      rt,
      schedule({ recipients: [owner.id], deliver: "both" }),
    );
    await db.execute(
      sql`update export_schedule set next_run_at = now() - interval '1 minute' where id = ${id}`,
    );
    sent.length = 0;
    const first = await runDueSchedules(rt);
    expect(first.runs).toBe(1);
    // druhé volání ve stejné minutě i souběžný worker nic nezdvojí
    await db.execute(
      sql`update export_schedule set next_run_at = now() - interval '1 minute' where id = ${id}`,
    );
    const second = await runDueSchedules(rt);
    expect(second.runs).toBe(0);
    const runs = await db
      .select()
      .from(schema.exportRun)
      .where(eq(schema.exportRun.scheduleId, id));
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ source: "schedule", userId: owner.id, deliverEmail: true });
    expect(sent.filter((s) => s.name === exportRunJob.name)).toHaveLength(1);
    const [s] = await db
      .select()
      .from(schema.exportSchedule)
      .where(eq(schema.exportSchedule.id, id));
    expect(s!.lastStatus).toContain("Spuštěno");
    expect(s!.nextRunAt!.getTime()).toBeGreaterThan(Date.now());
    // job: soubor + e-mail do fronty s přílohou
    sent.length = 0;
    await executeRun(rt, runs[0]!.id);
    const mail = sent.find((m) => m.name === "mail.send");
    expect(mail).toBeTruthy();
    expect((mail!.data as { attachments?: unknown[] }).attachments).toHaveLength(1);
    const [u] = await db
      .select({ email: schema.user.email })
      .from(schema.user)
      .where(eq(schema.user.id, owner.id));
    const log = await db
      .select()
      .from(schema.emailLog)
      .where(eq(schema.emailLog.toEmail, u!.email));
    expect(log.some((l) => l.subject.startsWith("Export:"))).toBe(true);
  });

  it("příjemce, který mezitím přišel o právo, se přeskočí; zastavený plán neběží; odhlášení z plánu", async () => {
    const owner = P().owner;
    const reader = await makeUser(db, [
      ["kontakty.read", "all"],
      ["kontakty.export", "all"],
    ]);
    const { id } = await saveSchedule(
      owner.ctx,
      rt,
      schedule({ name: "Dva příjemci", recipients: [owner.id, reader.id] }),
    );
    await db.execute(
      sql`delete from role_permission where role_id = (select role_id from "user" where id = ${reader.id})`,
    );
    await db.execute(
      sql`update export_schedule set next_run_at = now() - interval '1 minute' where id = ${id}`,
    );
    const r = await runDueSchedules(rt);
    expect(r.runs).toBeGreaterThanOrEqual(1);
    expect(r.skipped).toContain(reader.id);
    // odhlášení: příjemce se odebere
    const other = await makeUser(db, [
      ["kontakty.read", "all"],
      ["kontakty.export", "all"],
    ]);
    const { id: id2 } = await saveSchedule(
      owner.ctx,
      rt,
      schedule({ name: "Odhlášení", recipients: [other.id] }),
    );
    await unsubscribeFromSchedule(other.ctx, id2);
    const [after] = await db
      .select()
      .from(schema.exportSchedule)
      .where(eq(schema.exportSchedule.id, id2));
    expect(after).toMatchObject({ recipients: [], active: false });
    // zastavení
    await setScheduleActive(owner.ctx, id, false);
    await db.execute(
      sql`update export_schedule set next_run_at = now() - interval '1 minute' where id = ${id}`,
    );
    expect((await runDueSchedules(rt)).schedules).toBe(0);
    expect((await listSchedules(owner.ctx, rt)).find((s) => s.id === id)?.active).toBe(false);
    await expect(unsubscribeFromSchedule(other.ctx, id2)).rejects.toThrow();
  });
});
void (null as unknown as Ctx);
void UserError;
