import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema, type Db } from "@rebar/core/db";
import { UserError } from "@rebar/core/rbac";
import { connectAppDb } from "@rebar/core/testing";
import {
  accountCommand,
  createMeetingCommand,
  deleteEventCommand,
  forRecordCommand,
  linkCommand,
  moveCommand,
  rangeCommand,
  settingsGetCommand,
  settingsSaveCommand,
  suggestLinksCommand,
  testCommand,
  toggleCalendarCommand,
} from "../packages/modules/kalendar/src/google/commands";
import { sealState } from "../packages/modules/kalendar/src/google/accounts";
import { completeConnect } from "../packages/modules/kalendar/src/google/connect";
import { onTaskChanged } from "../packages/modules/kalendar/src/google/events";
import { setGoogleClientOverride, type KalEnv } from "../packages/modules/kalendar/src/google/env";
import { enqueuePush, processPushQueue } from "../packages/modules/kalendar/src/google/push";
import { pollAll, syncCalendar } from "../packages/modules/kalendar/src/google/sync";
import { disconnectAccount } from "../packages/modules/kalendar/src/google/accounts";
import { ensureWatch, handleGoogleWebhook } from "../packages/modules/kalendar/src/google/watch";
import { createFakeGoogle } from "../packages/modules/kalendar/src/google/fake-google";
import {
  calendar,
  calendarAccount,
  calendarEvent,
  calendarPush,
} from "../packages/modules/kalendar/src/schema";
import { company, person, personContactPoint } from "@rebar/kontakty/schema";
import { task, taskAttendee, taskType } from "@rebar/ukoly/schema";
import { buildFixture, isolatedDb } from "./support/security-fixture";

/*
  Google Kalendář proti `fake-google` (AS-13): připojení účtu, výběr kalendářů, obousměrná synchronizace (syncToken,
  výskyty, smazání), zápis schůzek z úkolů, konflikt (novější vyhrává), „Obsazeno“ pro cizí soukromé, push kanály,
  odpojení a vazby na klienty. Žádný skutečný Google ani klíče.
*/

const app = connectAppDb();
afterAll(() => app.close());

let db: Db;
let discard: () => Promise<void>;
let fx: Awaited<ReturnType<typeof buildFixture>>;
let env: KalEnv;
const clock = { skew: 0 };
const fake = createFakeGoogle({ now: () => Date.now() + clock.skew });
const ONDREJ = "ondrej@opdigital.test";
const PATRIK = "patrik@opdigital.test";

const owner = () => fx.people.owner;
const partner = () => fx.people.partner;
const deps = () => ({ ...fx.deps, baseURL: "https://opsys.test" });

const at = (day: string, time: string) => `2026-10-${day}T${time}:00+02:00`;
const gEvent = (id: string, summary: string, from: string, to: string, extra = {}) => ({
  id,
  summary,
  start: { dateTime: at("20", from) },
  end: { dateTime: at("20", to) },
  ...extra,
});

async function connect(p: typeof fx.people.owner, email: string) {
  const state = sealState(env.cipher, p.id, "/nastaveni/google-kalendar");
  return completeConnect(p.ctx, env, { code: fake.codeFor(email), state });
}
const calOf = async (userId: string) => {
  const [a] = await db.select().from(calendarAccount).where(eq(calendarAccount.userId, userId));
  const [c] = await db
    .select()
    .from(calendar)
    .where(and(eq(calendar.accountId, a!.id), eq(calendar.isPrimary, true)));
  return { account: a!, calendar: c! };
};
const eventsOf = (calendarId: string) =>
  db.select().from(calendarEvent).where(eq(calendarEvent.calendarId, calendarId));
const range = (p: typeof fx.people.owner, who: "me" | "all" = "all") =>
  rangeCommand.handler(p.ctx, { from: "2026-10-01", to: "2026-10-31", who }, deps());

async function newTask(over: Partial<typeof task.$inferInsert> = {}) {
  const [t] = await db
    .insert(task)
    .values({
      title: "Schůzka s Novákem",
      typeKey: "meeting",
      status: "todo",
      assigneeId: owner().id,
      dueDate: "2026-10-21",
      dueTime: "09:00",
      durationMin: 60,
      createdBy: owner().id,
      ...over,
    })
    .returning();
  return t!;
}
const push = async (taskId: string, wantMeet = false) => {
  await enqueuePush(db, taskId, { wantMeet });
  return processPushQueue(db, env, { client: fake.client, taskId });
};
const taskRow = async (id: string) => (await db.select().from(task).where(eq(task.id, id)))[0]!;

beforeAll(async () => {
  ({ db, discard } = await isolatedDb(app.db));
  fx = await buildFixture(db);
  env = { ...fx.deps, baseURL: "https://opsys.test" };
  for (const [key, name, flag] of [
    ["task", "Úkol", false],
    ["call", "Hovor", true],
    ["meeting", "Schůzka", true],
    ["deadline", "Termín", true],
  ] as const)
    await db
      .insert(taskType)
      .values({ key, name, isCalendarEvent: flag, isSystem: true })
      .onConflictDoNothing();
  fake.addAccount(ONDREJ);
  fake.addAccount(PATRIK);
  // události existující v Googlu ještě před připojením
  fake.putEvent(
    PATRIK,
    PATRIK,
    gEvent("p-zubar", "Zubař - tajné", "10:00", "11:00", {
      visibility: "private",
      location: "Ordinace",
    }),
  );
  fake.putEvent(PATRIK, PATRIK, gEvent("p-porada", "Porada týmu", "13:00", "14:00"));
  fake.putEvent(ONDREJ, ONDREJ, gEvent("o-obed", "Oběd s Dvořákem", "12:00", "13:00"));
  setGoogleClientOverride(fake.client);
});
afterAll(async () => {
  setGoogleClientOverride(null);
  await discard?.();
});

describe("připojení účtu", () => {
  it("návrat ze souhlasu uloží účet s kalendáři; tokeny jsou v DB šifrované", async () => {
    expect((await connect(owner(), ONDREJ)).ok).toBe(true);
    expect((await connect(partner(), PATRIK)).ok).toBe(true);
    const { account, calendar: cal } = await calOf(owner().id);
    expect(account).toMatchObject({ googleEmail: ONDREJ, status: "ok" });
    expect(account.tokensEnc).not.toMatch(/fake-at|fake-rt/);
    expect(cal).toMatchObject({
      visible: true,
      isWriteTarget: true,
      isPrimary: true,
      accessRole: "owner",
    });
    expect(await eventsOf(cal.id)).toHaveLength(1);
    expect(cal.syncToken).toBeTruthy();
  });
  it("cizí nebo prošlý `state` nikoho nepřipojí", async () => {
    const bad = await completeConnect(owner().ctx, env, {
      code: fake.codeFor(PATRIK),
      state: sealState(env.cipher, partner().id, "/x"),
    });
    expect(bad.ok).toBe(false);
    const denied = await completeConnect(owner().ctx, env, {
      error: "access_denied",
      state: sealState(env.cipher, owner().id, "/nastaveni/google-kalendar"),
    });
    expect(denied.redirectTo).toContain("google=denied");
  });
  it("`kalendar.account` ukáže můj účet a (s rozsahem „vše“) kalendáře ostatních", async () => {
    const s = await accountCommand.handler(owner().ctx, {}, deps());
    expect(s.mine?.googleEmail).toBe(ONDREJ);
    expect(s.others.map((o) => o.userId)).toContain(partner().id);
  });
  it("výběr kalendářů: další kalendář se zobrazí až po zapnutí a pak se synchronizuje", async () => {
    fake.addCalendar(ONDREJ, { id: "svatky", summary: "Svátky" });
    fake.putEvent(ONDREJ, "svatky", gEvent("s1", "Státní svátek", "00:00", "01:00"));
    const { refreshCalendarsCommand } =
      await import("../packages/modules/kalendar/src/google/commands");
    const acc = await refreshCalendarsCommand.handler(owner().ctx, {}, deps());
    const holidays = acc.calendars.find((c) => c.googleId === "svatky")!;
    expect(holidays.visible).toBe(false);
    expect(await eventsOf(holidays.id)).toHaveLength(0);
    await toggleCalendarCommand.handler(
      owner().ctx,
      { calendarId: holidays.id, visible: true },
      deps(),
    );
    expect(await eventsOf(holidays.id)).toHaveLength(1);
    await toggleCalendarCommand.handler(
      owner().ctx,
      { calendarId: holidays.id, visible: false },
      deps(),
    );
    expect(await eventsOf(holidays.id)).toHaveLength(0);
  });
});

describe("AS-13: cizí soukromé jsou „Obsazeno“", () => {
  it("Ondřej vidí Patrikovu soukromou událost jen jako Obsazeno, běžnou celou", async () => {
    const r = await range(owner());
    const json = JSON.stringify(r.items);
    expect(json).not.toMatch(/Zubař|Ordinace/);
    expect(r.items.filter((i) => i.kind === "busy")).toHaveLength(1);
    expect(r.items.find((i) => i.title === "Porada týmu")).toMatchObject({
      kind: "event",
      own: false,
    });
    expect(r.items.find((i) => i.title === "Oběd s Dvořákem")).toMatchObject({ own: true });
  });
  it("Patrik vidí svou soukromou událost celou; „jen moje“ nevrací cizí kalendáře", async () => {
    const mine = await range(partner(), "me");
    expect(mine.items.map((i) => i.title)).toContain("Zubař - tajné");
    expect(mine.items.map((i) => i.title)).not.toContain("Oběd s Dvořákem");
  });
  it("soukromá schůzka z OPSYS se do Googlu zapíše jako soukromá a Patrik vidí jen Obsazeno", async () => {
    const t = await newTask({ title: "Tajná schůzka", isPrivate: true, dueTime: "15:00" });
    await db.insert(schema.privateRecord).values({ entityType: "task", entityId: t.id });
    await push(t.id);
    const ev = fake.getEvent(ONDREJ, ONDREJ, `opsys${t.id.replaceAll("-", "")}`);
    expect(ev?.visibility).toBe("private");
    const r = await range(partner());
    expect(JSON.stringify(r.items)).not.toContain("Tajná schůzka");
    expect(r.items.filter((i) => i.kind === "busy")).toHaveLength(1);
    const own = await range(owner());
    expect(own.items.map((i) => i.title)).toContain("Tajná schůzka");
  });
});

describe("synchronizace Google → OPSYS", () => {
  it("přírůstek přinese novou, změněnou i smazanou událost a zapíše historii s aktérem google", async () => {
    const { calendar: cal } = await calOf(owner().id);
    fake.putEvent(ONDREJ, ONDREJ, gEvent("o-new", "Nová událost", "16:00", "17:00"));
    fake.putEvent(ONDREJ, ONDREJ, gEvent("o-obed", "Oběd přesunut", "12:30", "13:30"));
    const res = await syncCalendar(db, env, cal.id);
    expect(res.full).toBe(false);
    expect(res.changed).toBeGreaterThanOrEqual(2);
    const rows = await eventsOf(cal.id);
    expect(rows.find((r) => r.googleId === "o-obed")?.title).toBe("Oběd přesunut");
    fake.removeEvent(ONDREJ, ONDREJ, "o-new");
    await syncCalendar(db, env, cal.id);
    expect((await eventsOf(cal.id)).some((r) => r.googleId === "o-new")).toBe(false);
    const audit = await db
      .select()
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.entityType, "calendar_event"),
          eq(schema.auditLog.actorKind, "google"),
        ),
      );
    expect(audit.length).toBeGreaterThanOrEqual(3);
    expect(audit[0]!.actorLabel).toBe("Google Kalendář");
  });
  it("vypršelý sync token spustí úplnou synchronizaci, která smaže, co v Googlu zmizelo", async () => {
    const { calendar: cal } = await calOf(owner().id);
    fake.putEvent(ONDREJ, ONDREJ, gEvent("o-tmp", "Dočasná", "18:00", "19:00"));
    await syncCalendar(db, env, cal.id);
    fake.removeEvent(ONDREJ, ONDREJ, "o-tmp");
    fake.expireSyncTokens();
    const res = await syncCalendar(db, env, cal.id);
    expect(res.full).toBe(true);
    expect((await eventsOf(cal.id)).some((r) => r.googleId === "o-tmp")).toBe(false);
    const [after] = await db.select().from(calendar).where(eq(calendar.id, cal.id));
    expect(after!.syncToken).toBeTruthy();
    expect(after!.syncWindowTo).toBeTruthy();
  });
  it("opakovaná událost: výskyty jsou samostatné řádky, zrušený výskyt zmizí", async () => {
    const { calendar: cal } = await calOf(owner().id);
    for (const [n, d] of [
      ["22", "A"],
      ["29", "B"],
      ["30", "C"],
    ] as const)
      fake.putEvent(ONDREJ, ONDREJ, {
        id: `serie_${d}`,
        recurringEventId: "serie",
        originalStartTime: { dateTime: at(n, "08:00") },
        summary: "Týdenní porada",
        start: { dateTime: at(n, "08:00") },
        end: { dateTime: at(n, "08:30") },
      });
    await syncCalendar(db, env, cal.id);
    const series = (await eventsOf(cal.id)).filter((r) => r.recurringEventId === "serie");
    expect(series).toHaveLength(3);
    expect(
      (await range(owner(), "me")).items
        .filter((i) => i.title === "Týdenní porada")
        .every((i) => i.recurring),
    ).toBe(true);
    fake.removeEvent(ONDREJ, ONDREJ, "serie_B");
    await syncCalendar(db, env, cal.id);
    expect((await eventsOf(cal.id)).filter((r) => r.recurringEventId === "serie")).toHaveLength(2);
  });
  it("odvolaný souhlas = stav „reauth“, další čtení se přeskočí", async () => {
    await connect(partner(), PATRIK).catch(() => {});
    const { account, calendar: cal } = await calOf(partner().id);
    fake.revokeConsent(PATRIK);
    await expect(syncCalendar(db, env, cal.id)).rejects.toThrow();
    const [a] = await db.select().from(calendarAccount).where(eq(calendarAccount.id, account.id));
    expect(a!.status).toBe("reauth");
    expect(await pollAll(db, env)).toBeGreaterThanOrEqual(0);
    const test = await testCommand.handler(partner().ctx, {}, deps());
    expect(test.ok).toBe(false);
    // znovupřipojení stav obnoví
    fake.addAccount(PATRIK);
    expect((await connect(partner(), PATRIK)).ok).toBe(true);
    const [b] = await db.select().from(calendarAccount).where(eq(calendarAccount.id, account.id));
    expect(b!.status).toBe("ok");
  });
});

describe("zápis úkolů a schůzek do Google Kalendáře řešitele", () => {
  it("schůzka s časem vznikne v Googlu s id úkolu, pražským časem a bez účastníků; opakovaný zápis nic nemění", async () => {
    const t = await newTask();
    await db.insert(taskAttendee).values({ taskId: t.id, kind: "email", ref: "novak@klient.cz" });
    fake.clearCalls();
    await push(t.id);
    const gid = `opsys${t.id.replaceAll("-", "")}`;
    const ev = fake.getEvent(ONDREJ, ONDREJ, gid)!;
    expect(ev.summary).toBe("Schůzka s Novákem");
    expect(ev.start?.dateTime).toBe("2026-10-21T09:00:00+02:00");
    expect(ev.end?.dateTime).toBe("2026-10-21T10:00:00+02:00");
    expect(ev.extendedProperties?.private?.opsysTaskId).toBe(t.id);
    expect(ev.attendees).toBeUndefined();
    expect(fake.calls.filter((c) => c.op === "insert").map((c) => c.sendUpdates)).toEqual(["none"]);
    const [row] = await db.select().from(calendarEvent).where(eq(calendarEvent.taskId, t.id));
    expect(row).toMatchObject({ source: "opsys", googleId: gid });
    fake.clearCalls();
    await push(t.id);
    expect(fake.calls.filter((c) => c.op === "insert" || c.op === "patch")).toHaveLength(0);
  });
  it("„Poslat pozvánky“ zapíše účastníky a nechá Google je rozeslat; bez něj ne", async () => {
    const t = await newTask({ title: "S pozvánkou", sendInvites: true, dueTime: "11:00" });
    await db.insert(taskAttendee).values({ taskId: t.id, kind: "email", ref: "Novak@Klient.cz" });
    fake.clearCalls();
    await push(t.id);
    const ev = fake.getEvent(ONDREJ, ONDREJ, `opsys${t.id.replaceAll("-", "")}`)!;
    expect(ev.attendees?.map((a) => a.email)).toEqual(["novak@klient.cz"]);
    expect(fake.calls.find((c) => c.op === "insert")?.sendUpdates).toBe("all");
  });
  it("úkol bez času, úkol bez řešitele s účtem a nekalendářový typ se nezapisují", async () => {
    const noTime = await newTask({ title: "Jen datum", dueTime: null });
    const plain = await newTask({ title: "Obyčejný úkol", typeKey: "task" });
    const noAccount = await newTask({ title: "Externí", assigneeId: fx.people.external.id });
    fake.clearCalls();
    for (const t of [noTime, plain, noAccount]) await push(t.id);
    expect(fake.calls.filter((c) => c.op === "insert")).toHaveLength(0);
    expect(
      await db.select().from(calendarEvent).where(eq(calendarEvent.taskId, noTime.id)),
    ).toHaveLength(0);
  });
  it("obsluha `task.changed` zařadí zápis jen u úkolu s termínem", async () => {
    const t = await newTask({ title: "Přes událost" });
    const snap = {
      id: t.id,
      title: t.title,
      typeKey: "meeting",
      status: "todo" as const,
      assigneeId: owner().id,
      dueDate: "2026-10-21",
      dueTime: "09:00",
      dealId: null,
      jobId: null,
      companyId: null,
    };
    await onTaskChanged(
      owner().ctx,
      { data: { taskId: t.id, before: null, after: snap } } as never,
      { ...deps(), queue: { send: async () => null } },
    );
    const [q] = await db.select().from(calendarPush).where(eq(calendarPush.taskId, t.id));
    expect(q?.doneAt).toBeNull();
    await onTaskChanged(
      owner().ctx,
      {
        data: {
          taskId: "00000000-0000-4000-8000-00000000dead",
          before: null,
          after: { ...snap, dueDate: null },
        },
      } as never,
      { ...deps(), queue: { send: async () => null } },
    );
    expect(
      await db
        .select()
        .from(calendarPush)
        .where(eq(calendarPush.taskId, "00000000-0000-4000-8000-00000000dead")),
    ).toHaveLength(0);
  });
  it("Meet se založí na požádání", async () => {
    const t = await newTask({ title: "Videohovor", dueTime: "14:00" });
    await push(t.id, true);
    const ev = fake.getEvent(ONDREJ, ONDREJ, `opsys${t.id.replaceAll("-", "")}`)!;
    expect(ev.hangoutLink).toMatch(/meet\.google\.com/);
    const [row] = await db.select().from(calendarEvent).where(eq(calendarEvent.taskId, t.id));
    expect(row!.meetUrl).toBe(ev.hangoutLink);
  });
  it("změna času a názvu úkolu se propíše, zrušení úkolu událost smaže", async () => {
    const t = await newTask({ title: "Původní", dueTime: "08:00" });
    await push(t.id);
    await db
      .update(task)
      .set({ title: "Změněná", dueTime: "08:30", durationMin: 45 })
      .where(eq(task.id, t.id));
    await push(t.id);
    const gid = `opsys${t.id.replaceAll("-", "")}`;
    const ev = fake.getEvent(ONDREJ, ONDREJ, gid)!;
    expect([ev.summary, ev.start?.dateTime, ev.end?.dateTime]).toEqual([
      "Změněná",
      "2026-10-21T08:30:00+02:00",
      "2026-10-21T09:15:00+02:00",
    ]);
    await db.update(task).set({ status: "canceled" }).where(eq(task.id, t.id));
    await push(t.id);
    expect(fake.getEvent(ONDREJ, ONDREJ, gid)?.status).toBe("cancelled");
    expect(
      await db.select().from(calendarEvent).where(eq(calendarEvent.taskId, t.id)),
    ).toHaveLength(0);
  });
  it("přeřazení k jinému řešiteli přesune událost do jeho kalendáře", async () => {
    const t = await newTask({ title: "Předat Patrikovi", dueTime: "10:00" });
    await push(t.id);
    await db.update(task).set({ assigneeId: partner().id }).where(eq(task.id, t.id));
    await push(t.id);
    const gid = `opsys${t.id.replaceAll("-", "")}`;
    expect(fake.getEvent(ONDREJ, ONDREJ, gid)?.status).toBe("cancelled");
    expect(fake.getEvent(PATRIK, PATRIK, gid)?.summary).toBe("Předat Patrikovi");
  });
});

describe("zpětný zápis z Googlu a konflikty", () => {
  it("přetažení události v Googlu změní čas úkolu", async () => {
    const t = await newTask({ title: "Přetáhnout", dueTime: "09:00" });
    await push(t.id);
    const { calendar: cal } = await calOf(owner().id);
    const gid = `opsys${t.id.replaceAll("-", "")}`;
    clock.skew = 120_000; // změna v Googlu je novější než zápis z OPSYS
    fake.putEvent(ONDREJ, ONDREJ, {
      id: gid,
      start: { dateTime: at("21", "13:00") },
      end: { dateTime: at("21", "14:30") },
    });
    clock.skew = 0;
    await syncCalendar(db, env, cal.id);
    const after = await taskRow(t.id);
    expect(after.dueTime?.slice(0, 5)).toBe("13:00");
    expect(after.durationMin).toBe(90);
  });
  it("konflikt: novější změna v OPSYS přebije starší změnu v Googlu", async () => {
    const t = await newTask({ title: "Konflikt místní", dueTime: "09:00" });
    await push(t.id);
    const { calendar: cal } = await calOf(owner().id);
    const gid = `opsys${t.id.replaceAll("-", "")}`;
    clock.skew = -120_000; // Google změnil před dvěma minutami
    fake.putEvent(ONDREJ, ONDREJ, {
      id: gid,
      start: { dateTime: at("21", "16:00") },
      end: { dateTime: at("21", "17:00") },
    });
    clock.skew = 0;
    await db.update(task).set({ dueTime: "10:00" }).where(eq(task.id, t.id));
    await enqueuePush(db, t.id);
    await syncCalendar(db, env, cal.id);
    expect((await taskRow(t.id)).dueTime?.slice(0, 5)).toBe("10:00");
    await processPushQueue(db, env, { client: fake.client, taskId: t.id });
    expect(fake.getEvent(ONDREJ, ONDREJ, gid)?.start?.dateTime).toBe("2026-10-21T10:00:00+02:00");
  });
  it("konflikt: novější změna v Googlu zahodí čekající zápis z OPSYS", async () => {
    const t = await newTask({ title: "Konflikt vzdálený", dueTime: "09:00" });
    await push(t.id);
    const { calendar: cal } = await calOf(owner().id);
    const gid = `opsys${t.id.replaceAll("-", "")}`;
    await db.update(task).set({ dueTime: "10:00" }).where(eq(task.id, t.id));
    await enqueuePush(db, t.id);
    clock.skew = 120_000;
    fake.putEvent(ONDREJ, ONDREJ, {
      id: gid,
      start: { dateTime: at("21", "17:00") },
      end: { dateTime: at("21", "18:00") },
    });
    clock.skew = 0;
    await syncCalendar(db, env, cal.id);
    expect((await taskRow(t.id)).dueTime?.slice(0, 5)).toBe("17:00");
    const [q] = await db.select().from(calendarPush).where(eq(calendarPush.taskId, t.id));
    expect(q?.doneAt).not.toBeNull();
  });
  it("smazání v Googlu: úkol zůstane, událost se znovu založí až novější změnou úkolu", async () => {
    const t = await newTask({ title: "Smazaná v Googlu", dueTime: "09:00" });
    await push(t.id);
    const { calendar: cal } = await calOf(owner().id);
    const gid = `opsys${t.id.replaceAll("-", "")}`;
    fake.removeEvent(ONDREJ, ONDREJ, gid);
    await syncCalendar(db, env, cal.id);
    const [tomb] = await db.select().from(calendarEvent).where(eq(calendarEvent.taskId, t.id));
    expect(tomb?.remoteDeleted).toBe(true);
    expect((await taskRow(t.id)).deletedAt).toBeNull();
    // starší změna úkolu než smazání se nepoužije
    await db
      .insert(calendarPush)
      .values({ taskId: t.id, queuedAt: new Date(Date.now() - 600_000) })
      .onConflictDoNothing();
    await processPushQueue(db, env, { client: fake.client, taskId: t.id });
    expect(fake.getEvent(ONDREJ, ONDREJ, gid)?.status).toBe("cancelled");
    // novější změna událost oživí (stejné id)
    await db.update(task).set({ dueTime: "09:30" }).where(eq(task.id, t.id));
    await push(t.id);
    const ev = fake.getEvent(ONDREJ, ONDREJ, gid)!;
    expect(ev.status).toBe("confirmed");
    expect(ev.start?.dateTime).toBe("2026-10-21T09:30:00+02:00");
  });
  it("kopie události v Googlu se stejným id úkolu se k úkolu nepřipojí podruhé", async () => {
    const t = await newTask({ title: "Originál", dueTime: "11:30" });
    await push(t.id);
    const { calendar: cal } = await calOf(owner().id);
    fake.putEvent(ONDREJ, ONDREJ, {
      id: "kopie1",
      summary: "Originál (kopie)",
      start: { dateTime: at("21", "15:00") },
      end: { dateTime: at("21", "16:00") },
      extendedProperties: { private: { opsysTaskId: t.id } },
    });
    await syncCalendar(db, env, cal.id);
    const rows = await db.select().from(calendarEvent).where(eq(calendarEvent.calendarId, cal.id));
    expect(rows.filter((r) => r.taskId === t.id)).toHaveLength(1);
    expect(rows.find((r) => r.googleId === "kopie1")?.taskId).toBeNull();
  });
});

describe("push kanály a webhook", () => {
  it("kanál se založí jen na https; ověří se kanál i tajný token; první zpráva „sync“ nic nespouští", async () => {
    const { calendar: cal } = await calOf(owner().id);
    // kanál založilo už připojení účtu; živý kanál se bez nátlaku neobnovuje
    expect(fake.channelsOf(ONDREJ)).toHaveLength(1);
    expect(await ensureWatch(db, env, cal.id, { client: fake.client })).toBe("skipped");
    expect(await ensureWatch(db, env, cal.id, { client: fake.client, force: true })).toBe(
      "renewed",
    );
    expect(fake.channelsOf(ONDREJ)).toHaveLength(1);
    expect(
      await ensureWatch(db, { ...env, baseURL: "http://localhost:3100" }, cal.id, {
        client: fake.client,
        force: true,
      }),
    ).toBe("unavailable");
    const queued: string[] = [];
    const ping = fake.ping(ONDREJ)!;
    const h = (o: Record<string, string>) => ({ get: (n: string) => o[n.toLowerCase()] ?? null });
    expect(
      (await handleGoogleWebhook(db, h(ping), async (id) => void queued.push(id))).status,
    ).toBe(200);
    expect(queued).toEqual([cal.id]);
    expect(
      (
        await handleGoogleWebhook(
          db,
          h(fake.ping(ONDREJ, ONDREJ, "sync")!),
          async (id) => void queued.push(id),
        )
      ).status,
    ).toBe(200);
    expect(queued).toHaveLength(1);
    expect(
      (
        await handleGoogleWebhook(
          db,
          h({ ...ping, "x-goog-channel-token": "podvrh" }),
          async () => {},
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handleGoogleWebhook(
          db,
          h({ ...ping, "x-goog-channel-id": "neznamy" }),
          async () => {},
        )
      ).status,
    ).toBe(404);
    expect((await handleGoogleWebhook(db, h({}), async () => {})).status).toBe(400);
    const [after] = await db.select().from(calendar).where(eq(calendar.id, cal.id));
    expect(after!.watchTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(after)).not.toContain(ping["x-goog-channel-token"]!);
  });
});

describe("příkazy: schůzka z kalendáře, přesun, smazání, vazby", () => {
  it("bez modulu úkolů vznikne událost jen v Googlu; pozvánky jen s přepínačem, soukromá s příznakem", async () => {
    fake.clearCalls();
    const base = {
      place: undefined,
      description: undefined,
      title: "Z kalendáře",
      startsAt: at("22", "09:00"),
      endsAt: at("22", "10:00"),
      attendeeEmails: ["host@firma.cz"],
    };
    const plain = await createMeetingCommand.handler(owner().ctx, base, deps());
    expect(plain).toMatchObject({ taskId: null, pending: false });
    let ev = fake.events(ONDREJ).find((e) => e.summary === "Z kalendáře")!;
    expect(ev.attendees).toBeUndefined();
    expect(fake.calls.find((c) => c.op === "insert")?.sendUpdates).toBe("none");
    fake.clearCalls();
    await createMeetingCommand.handler(
      owner().ctx,
      { ...base, title: "S pozvánkou 2", sendInvites: true, addMeet: true, isPrivate: true },
      deps(),
    );
    ev = fake.events(ONDREJ).find((e) => e.summary === "S pozvánkou 2")!;
    expect(ev.attendees?.map((a) => a.email)).toEqual(["host@firma.cz"]);
    expect(ev.visibility).toBe("private");
    expect(ev.hangoutLink).toBeTruthy();
    expect(fake.calls.find((c) => c.op === "insert")).toMatchObject({
      sendUpdates: "all",
      conference: true,
    });
  });
  it("přesun tažením propíše čas do Googlu; neshoda etagu vrátí srozumitelnou chybu a data se obnoví", async () => {
    const created = await createMeetingCommand.handler(
      owner().ctx,
      {
        title: "Přesunout",
        place: undefined,
        description: undefined,
        startsAt: at("23", "09:00"),
        endsAt: at("23", "10:00"),
      },
      deps(),
    );
    const moved = await moveCommand.handler(
      owner().ctx,
      { eventId: created.eventId!, startsAt: at("23", "11:00"), endsAt: at("23", "12:30") },
      deps(),
    );
    expect(moved.start).toBe("2026-10-23T11:00");
    const [row] = await db
      .select()
      .from(calendarEvent)
      .where(eq(calendarEvent.id, created.eventId!));
    expect(fake.getEvent(ONDREJ, ONDREJ, row!.googleId)?.end?.dateTime).toBe(
      "2026-10-23T12:30:00+02:00",
    );
    fake.putEvent(ONDREJ, ONDREJ, { id: row!.googleId, summary: "Někdo to změnil" });
    await expect(
      moveCommand.handler(
        owner().ctx,
        { eventId: created.eventId!, startsAt: at("23", "14:00"), endsAt: at("23", "15:00") },
        deps(),
      ),
    ).rejects.toBeInstanceOf(UserError);
    const [fresh] = await db
      .select()
      .from(calendarEvent)
      .where(eq(calendarEvent.id, created.eventId!));
    expect(fresh!.title).toBe("Někdo to změnil");
  });
  it("cizí událost smí upravit jen rozsah „vše“; cizí soukromou nikdo", async () => {
    const { calendar: pcal } = await calOf(partner().id);
    const rows = await eventsOf(pcal.id);
    const priv = rows.find((r) => r.googleId === "p-zubar")!;
    await expect(
      moveCommand.handler(
        owner().ctx,
        { eventId: priv.id, startsAt: at("20", "10:00"), endsAt: at("20", "11:00") },
        deps(),
      ),
    ).rejects.toThrow();
    await expect(
      deleteEventCommand.handler(owner().ctx, { eventId: priv.id }, deps()),
    ).rejects.toThrow();
  });
  it("vazba na klienta a kontakt, návrh podle e-mailu účastníka a výpis podle záznamu", async () => {
    const [co] = await db.insert(company).values({ name: "Novák s.r.o." }).returning();
    const [pe] = await db
      .insert(person)
      .values({ lastName: "Novák", firstName: "Jan", primaryCompanyId: co!.id })
      .returning();
    await db.insert(personContactPoint).values({
      personId: pe!.id,
      kind: "email",
      value: "Jan@Novak.cz",
      valueNorm: "jan@novak.cz",
      isPrimary: true,
    });
    const { calendar: cal } = await calOf(owner().id);
    fake.putEvent(ONDREJ, ONDREJ, {
      ...gEvent("o-novak", "Jednání s Novákem", "09:00", "10:00"),
      attendees: [
        { email: ONDREJ, self: true },
        { email: "jan@novak.cz", displayName: "Jan Novák" },
      ],
    });
    await syncCalendar(db, env, cal.id);
    const [ev] = await db
      .select()
      .from(calendarEvent)
      .where(and(eq(calendarEvent.calendarId, cal.id), eq(calendarEvent.googleId, "o-novak")));
    const sug = await suggestLinksCommand.handler(owner().ctx, { eventId: ev!.id }, deps());
    expect(sug.suggestions).toEqual([
      expect.objectContaining({ personId: pe!.id, companyId: co!.id, companyName: "Novák s.r.o." }),
    ]);
    const linked = await linkCommand.handler(
      owner().ctx,
      { eventId: ev!.id, companyId: co!.id, personId: pe!.id },
      deps(),
    );
    expect(linked.company).toEqual({ id: co!.id, title: "Novák s.r.o." });
    const list = await forRecordCommand.handler(owner().ctx, { companyId: co!.id }, deps());
    expect(list.items.map((i) => i.title)).toEqual(["Jednání s Novákem"]);
    // vazba přežije další synchronizaci
    fake.putEvent(ONDREJ, ONDREJ, { id: "o-novak", summary: "Jednání s Novákem (přesun)" });
    await syncCalendar(db, env, cal.id);
    const [after] = await db.select().from(calendarEvent).where(eq(calendarEvent.id, ev!.id));
    expect(after).toMatchObject({
      title: "Jednání s Novákem (přesun)",
      companyId: co!.id,
      personId: pe!.id,
    });
    // vazba na neexistující záznam nejde
    await expect(
      linkCommand.handler(
        owner().ctx,
        { eventId: ev!.id, companyId: "00000000-0000-4000-8000-0000000000ff" },
        deps(),
      ),
    ).rejects.toThrow();
  });
  it("smazání události z kalendáře ji smaže v Googlu", async () => {
    const created = await createMeetingCommand.handler(
      owner().ctx,
      {
        title: "Smazat",
        place: undefined,
        description: undefined,
        startsAt: at("24", "09:00"),
        endsAt: at("24", "10:00"),
      },
      deps(),
    );
    const [row] = await db
      .select()
      .from(calendarEvent)
      .where(eq(calendarEvent.id, created.eventId!));
    await deleteEventCommand.handler(owner().ctx, { eventId: created.eventId! }, deps());
    expect(fake.getEvent(ONDREJ, ONDREJ, row!.googleId)?.status).toBe("cancelled");
    expect(
      await db.select().from(calendarEvent).where(eq(calendarEvent.id, created.eventId!)),
    ).toHaveLength(0);
  });
});

describe("nastavení OAuth klienta", () => {
  it("tajemství se ukládá šifrovaně a UI ho nikdy nedostane zpět; prázdné ponechá uložené", async () => {
    await settingsSaveCommand.handler(
      owner().ctx,
      { clientId: "abc.apps.googleusercontent.com", clientSecret: "TAJNE-HESLO-123" },
      deps(),
    );
    const [stored] = await db
      .select()
      .from(schema.setting)
      .where(eq(schema.setting.key, "google_calendar"));
    expect(JSON.stringify(stored!.value)).not.toContain("TAJNE-HESLO-123");
    const got = await settingsGetCommand.handler(owner().ctx, {}, deps());
    expect(JSON.stringify(got)).not.toContain("TAJNE-HESLO-123");
    expect(got).toMatchObject({
      clientId: "abc.apps.googleusercontent.com",
      clientSecretSet: true,
      privateMeetingsToGoogle: true,
      redirectUri: "https://opsys.test/api/kalendar/google/callback",
      webhookUrl: "https://opsys.test/api/kalendar/google/webhook",
      pushAvailable: true,
    });
    await settingsSaveCommand.handler(
      owner().ctx,
      { clientSecret: "", privateMeetingsToGoogle: false },
      deps(),
    );
    const again = await settingsGetCommand.handler(owner().ctx, {}, deps());
    expect(again).toMatchObject({ clientSecretSet: true, privateMeetingsToGoogle: false });
  });
  it("partner (bez settings.manage) nastavení nevidí", async () => {
    const { assertCommandPermission } = await import("../apps/web/src/server/command-gate");
    expect(() => assertCommandPermission(partner().ctx, settingsGetCommand)).toThrow();
  });
  it("vypnutý zápis soukromých schůzek je z Googlu odstraní", async () => {
    const t = await newTask({ title: "Soukromá po vypnutí", isPrivate: true, dueTime: "16:00" });
    await push(t.id);
    expect(
      await db.select().from(calendarEvent).where(eq(calendarEvent.taskId, t.id)),
    ).toHaveLength(0);
  });
});

describe("odpojení", () => {
  it("odpojení smaže zrcadlo i tokeny a zastaví push kanály; události v Googlu zůstanou", async () => {
    const { account, calendar: cal } = await calOf(owner().id);
    const channels = fake.channelsOf(ONDREJ).map((c) => c.id);
    expect(channels.length).toBeGreaterThan(0);
    const before = fake.events(ONDREJ).length;
    await disconnectAccount(owner().ctx, env);
    expect(await eventsOf(cal.id)).toHaveLength(0);
    const [a] = await db.select().from(calendarAccount).where(eq(calendarAccount.id, account.id));
    expect(a!.deletedAt).not.toBeNull();
    expect(a!.tokensEnc).toBe("revoked");
    expect(fake.stoppedChannels).toEqual(expect.arrayContaining(channels));
    expect(fake.events(ONDREJ).length).toBe(before);
    expect((await accountCommand.handler(owner().ctx, {}, deps())).mine).toBeNull();
    // bez Googlu kalendář vrací jen vrstvy a svátky (úkoly a schůzky z OPSYS dodává vrstva úkolů)
    const r = await rangeCommand.handler(
      owner().ctx,
      { from: "2026-10-01", to: "2026-10-31", who: "me" },
      deps(),
    );
    expect(r.connected).toBe(false);
    expect(r.items.every((i) => i.kind !== "event")).toBe(true);
  });
});
