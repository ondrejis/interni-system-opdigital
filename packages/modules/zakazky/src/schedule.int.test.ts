import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensurePipeline, getPipeline } from "@rebar/core/config-data";
import { schema } from "@rebar/core/db";
import {
  clearEntityPolicies,
  createEntityRegistry,
  registerEntityPolicies,
} from "@rebar/core/entities";
import { ensureSeries } from "@rebar/core/numbering";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { zonedToUtc } from "@rebar/core/time";
import { company } from "@rebar/kontakty/schema";
import { companyEntity, personEntity } from "@rebar/kontakty/server";
import { manifest } from "./index";
import { job, jobMember } from "./schema";
import { notifyJobsStartingToday, startsTodayJob } from "./schedule";
import { jobEntity } from "./server";

/** Ranní upozornění „Zakázka dnes začíná“: výběr zakázek, příjemci, idempotence a hranice dne v Europe/Prague. */
const app = connectAppDb();
afterAll(() => app.close());

beforeAll(async () => {
  clearEntityPolicies();
  registerEntityPolicies(createEntityRegistry([companyEntity, personEntity, jobEntity]));
  for (const p of manifest.seed.pipelines) await ensurePipeline(app.db, p);
  await ensureSeries(app.db, manifest.seed.series);
});

const reader = () => makeUser(app.db, [["zakazky.read", "own"]]);

async function newJob(over: Partial<typeof job.$inferInsert> & { startDate: string }) {
  const [c] = await app.db
    .insert(company)
    .values({ name: `Firma ${randomBytes(3).toString("hex")}` })
    .returning();
  const stage = (await getPipeline(app.db, "job", "default"))!.stages[0]!;
  const [j] = await app.db
    .insert(job)
    .values({
      number: `T-${randomBytes(4).toString("hex")}`,
      title: "Koupelna",
      address: "Husova 12, Plzeň",
      companyId: c!.id,
      stageId: stage.id,
      phase: "preparation",
      ...over,
    })
    .returning();
  return j!;
}

const notesOf = (userId: string, jobId: string) =>
  app.db
    .select()
    .from(schema.notification)
    .where(
      and(
        eq(schema.notification.userId, userId),
        eq(schema.notification.kind, "zakazky.starts_today"),
        eq(schema.notification.entityId, jobId),
      ),
    );

// 3. 11. 2026 je úterý (pracovní den), 31. 3. 2026 úterý po přechodu na letní čas, 7. 11. 2026 sobota
const MORNING = zonedToUtc("2026-11-03", "06:30");

describe("zakazky.starts_today", () => {
  it("upozorní vedoucího a členy týmu, ne ty bez přístupu; odkaz vede na zakázku", async () => {
    const manager = await reader();
    const member = await reader();
    const stranger = await reader();
    const j = await newJob({ startDate: "2026-11-03", managerId: manager.id });
    await app.db.insert(jobMember).values({ jobId: j.id, userId: member.id });

    const r = await notifyJobsStartingToday(app.db, MORNING);
    expect(r.jobs).toBeGreaterThanOrEqual(1);

    for (const who of [manager, member]) {
      const [n] = await notesOf(who.id, j.id);
      expect(n!.title).toBe(`Dnes začíná zakázka ${j.number}`);
      expect(n!.body).toBe("Koupelna\nHusova 12, Plzeň");
      expect(n!.url).toBe(`/zakazky/${j.id}`);
    }
    expect(await notesOf(stranger.id, j.id)).toEqual([]);
  });

  it("opakované spuštění ve stejný den nic nezdvojí; další den je nová příležitost jen s novým začátkem", async () => {
    const manager = await reader();
    const j = await newJob({ startDate: "2026-11-03", managerId: manager.id });
    await notifyJobsStartingToday(app.db, MORNING);
    await notifyJobsStartingToday(app.db, zonedToUtc("2026-11-03", "09:00"));
    expect(await notesOf(manager.id, j.id)).toHaveLength(1);
    await notifyJobsStartingToday(app.db, zonedToUtc("2026-11-04", "06:30"));
    expect(await notesOf(manager.id, j.id)).toHaveLength(1);
  });

  it("přeskočí zakázky mimo přípravu a realizaci, smazané a ty s jiným datem", async () => {
    const manager = await reader();
    const rows = [
      await newJob({ startDate: "2026-11-03", managerId: manager.id, phase: "execution" }),
      await newJob({ startDate: "2026-11-03", managerId: manager.id, phase: "offer" }),
      await newJob({ startDate: "2026-11-03", managerId: manager.id, phase: "closed" }),
      await newJob({ startDate: "2026-11-03", managerId: manager.id, phase: "lost" }),
      await newJob({ startDate: "2026-11-03", managerId: manager.id, phase: "paused" }),
      await newJob({ startDate: "2026-11-03", managerId: manager.id, deletedAt: new Date() }),
      await newJob({ startDate: "2026-11-04", managerId: manager.id }),
    ];
    await notifyJobsStartingToday(app.db, MORNING);
    const got = await Promise.all(rows.map(async (r) => (await notesOf(manager.id, r.id)).length));
    expect(got).toEqual([1, 0, 0, 0, 0, 0, 0]);
  });

  it("o víkendu a ve svátek neposílá", async () => {
    const manager = await reader();
    const sat = await newJob({ startDate: "2026-11-07", managerId: manager.id });
    const holiday = await newJob({ startDate: "2026-12-25", managerId: manager.id });
    expect(await notifyJobsStartingToday(app.db, zonedToUtc("2026-11-07", "06:30"))).toEqual({
      jobs: 0,
      created: 0,
    });
    await notifyJobsStartingToday(app.db, zonedToUtc("2026-12-25", "06:30"));
    expect(await notesOf(manager.id, sat.id)).toEqual([]);
    expect(await notesOf(manager.id, holiday.id)).toEqual([]);
  });

  it("den se počítá v Europe/Prague, ne v UTC (zimní i letní čas)", async () => {
    const manager = await reader();
    const winter = await newJob({ startDate: "2026-11-03", managerId: manager.id });
    const summer = await newJob({ startDate: "2026-03-31", managerId: manager.id });
    // 00:30 pražského času je ještě předchozí den v UTC
    const winterNight = new Date("2026-11-02T23:30:00Z");
    const summerNight = new Date("2026-03-30T22:30:00Z");
    await notifyJobsStartingToday(app.db, winterNight);
    await notifyJobsStartingToday(app.db, summerNight);
    expect(await notesOf(manager.id, winter.id)).toHaveLength(1);
    expect(await notesOf(manager.id, summer.id)).toHaveLength(1);
    // 22:30 UTC je v zimě ještě 23:30 téhož dne v Praze: zakázka s začátkem zítra se nehlásí
    const tomorrow = await newJob({ startDate: "2026-11-10", managerId: manager.id });
    await notifyJobsStartingToday(app.db, new Date("2026-11-09T22:30:00Z"));
    expect(await notesOf(manager.id, tomorrow.id)).toEqual([]);
  });

  it("úloha je naplánovaná na pracovní dny ráno", () => {
    expect(startsTodayJob.name).toBe("zakazky.starts_today");
    expect(startsTodayJob.cron).toBe("30 6 * * 1-5");
  });
});
