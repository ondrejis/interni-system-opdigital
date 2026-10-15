import { describe, expect, it } from "vitest";
import {
  fromGoogleEvent,
  googleIdForTask,
  inputToFields,
  sameWritten,
  taskTimes,
  taskToGoogle,
  timesToGoogle,
  timesToTask,
  toPragueIso,
  type TaskForPush,
} from "./mapping";
import { resolveConflict } from "./conflict";

const TASK_ID = "0198a000-1111-7222-8333-444455556666";
const task = (over: Partial<TaskForPush> = {}): TaskForPush => ({
  id: TASK_ID,
  title: "Schůzka s klientem",
  typeKey: "meeting",
  description: null,
  place: "Plzeň",
  dueDate: "2026-10-15",
  dueTime: "09:00",
  durationMin: 90,
  allDay: false,
  isPrivate: false,
  sendInvites: false,
  attendeeEmails: ["klient@firma.cz"],
  ...over,
});

describe("časová pásma (Europe/Prague)", () => {
  it("zapisuje pražský posun podle letního a zimního času", () => {
    expect(toPragueIso(new Date("2026-07-15T07:00:00Z"))).toBe("2026-07-15T09:00:00+02:00");
    expect(toPragueIso(new Date("2026-12-15T08:00:00Z"))).toBe("2026-12-15T09:00:00+01:00");
  });
  it("přechody na letní a zimní čas drží místní čas", () => {
    // 29. 3. 2026 přechod na letní: 09:00 je už +02:00
    expect(
      timesToGoogle(new Date("2026-03-29T07:00:00Z"), new Date("2026-03-29T08:00:00Z"), false).start
        .dateTime,
    ).toBe("2026-03-29T09:00:00+02:00");
    // 25. 10. 2026 přechod na zimní: 09:00 je +01:00
    expect(
      taskTimes(task({ dueDate: "2026-10-25", dueTime: "09:00" })).startsAt.toISOString(),
    ).toBe("2026-10-25T08:00:00.000Z");
  });
  it("úkol v 09:00 trvá podle délky, výchozí 60 min (hovor 30)", () => {
    const t = taskTimes(task());
    expect(t.endsAt.getTime() - t.startsAt.getTime()).toBe(90 * 60_000);
    const d = taskTimes(task({ durationMin: null }));
    expect(d.endsAt.getTime() - d.startsAt.getTime()).toBe(60 * 60_000);
    const c = taskTimes(task({ durationMin: null, typeKey: "call" }));
    expect(c.endsAt.getTime() - c.startsAt.getTime()).toBe(30 * 60_000);
  });
});

describe("celodenní události", () => {
  it("konec v Googlu je výlučný a převádí se na místní půlnoci", () => {
    const r = fromGoogleEvent({
      id: "a",
      start: { date: "2026-10-15" },
      end: { date: "2026-10-17" },
      summary: "Dovolená",
    });
    expect(r.deleted).toBe(false);
    if (r.deleted) return;
    expect(r.fields.allDay).toBe(true);
    expect(r.fields.startsAt.toISOString()).toBe("2026-10-14T22:00:00.000Z");
    expect(r.fields.endsAt.toISOString()).toBe("2026-10-16T22:00:00.000Z");
  });
  it("zpět do Googlu jde `date` s výlučným koncem a jednodenní úkol má konec o den později", () => {
    const t = taskToGoogle(task({ allDay: true, dueTime: null }));
    expect(t.start).toEqual({ date: "2026-10-15" });
    expect(t.end).toEqual({ date: "2026-10-16" });
  });
});

describe("události z Googlu", () => {
  it("zrušené a „pracovní místo“ se nezrcadlí", () => {
    expect(fromGoogleEvent({ id: "x", status: "cancelled" }).deleted).toBe(true);
    expect(
      fromGoogleEvent({
        id: "y",
        eventType: "workingLocation",
        start: { date: "2026-10-15" },
        end: { date: "2026-10-16" },
      }).deleted,
    ).toBe(true);
  });
  it("soukromá a důvěrná událost je soukromá, výchozí ne", () => {
    const f = (visibility?: "private" | "confidential" | "public" | "default") => {
      const r = fromGoogleEvent({
        id: "p",
        start: { dateTime: "2026-10-15T09:00:00+02:00" },
        end: { dateTime: "2026-10-15T10:00:00+02:00" },
        ...(visibility ? { visibility } : {}),
      });
      return r.deleted ? null : r.fields.isGooglePrivate;
    };
    expect(f("private")).toBe(true);
    expect(f("confidential")).toBe(true);
    expect(f("public")).toBe(false);
    expect(f()).toBe(false);
  });
  it("výskyt opakované události nese hlavní událost a původní začátek", () => {
    const r = fromGoogleEvent({
      id: "series_20261022T070000Z",
      recurringEventId: "series",
      originalStartTime: { dateTime: "2026-10-22T09:00:00+02:00" },
      start: { dateTime: "2026-10-22T09:30:00+02:00" },
      end: { dateTime: "2026-10-22T10:30:00+02:00" },
    });
    if (r.deleted) throw new Error("nemá být smazaná");
    expect(r.fields.recurringEventId).toBe("series");
    expect(r.fields.originalStartAt?.toISOString()).toBe("2026-10-22T07:00:00.000Z");
    expect(r.fields.startsAt.toISOString()).toBe("2026-10-22T07:30:00.000Z");
  });
  it("odkaz na Meet, účastníci a id úkolu z rozšířených vlastností", () => {
    const r = fromGoogleEvent({
      id: "m",
      hangoutLink: "https://meet.google.com/abc",
      start: { dateTime: "2026-10-15T09:00:00+02:00" },
      end: { dateTime: "2026-10-15T10:00:00+02:00" },
      attendees: [{ email: "a@b.cz", displayName: "A", responseStatus: "accepted", self: true }],
      extendedProperties: { private: { opsysTaskId: TASK_ID.toUpperCase() } },
    });
    if (r.deleted) throw new Error("nemá být smazaná");
    expect(r.fields.meetUrl).toBe("https://meet.google.com/abc");
    expect(r.fields.attendees[0]).toMatchObject({ email: "a@b.cz", name: "A", self: true });
    expect(r.taskId).toBe(TASK_ID);
  });
  it("neplatné id úkolu se ignoruje", () => {
    const r = fromGoogleEvent({
      id: "m",
      start: { dateTime: "2026-10-15T09:00:00Z" },
      end: { dateTime: "2026-10-15T10:00:00Z" },
      extendedProperties: { private: { opsysTaskId: "nesmysl" } },
    });
    if (r.deleted) throw new Error("nemá být smazaná");
    expect(r.taskId).toBeNull();
  });
});

describe("úkol → Google", () => {
  it("soukromý úkol je v Googlu soukromý, ID úkolu je v rozšířených vlastnostech", () => {
    const g = taskToGoogle(task({ isPrivate: true }));
    expect(g.visibility).toBe("private");
    expect(g.extendedProperties?.private?.opsysTaskId).toBe(TASK_ID);
  });
  it("bez „Poslat pozvánky“ se účastníci do Googlu nezapisují", () => {
    expect(taskToGoogle(task()).attendees).toBeUndefined();
    expect(taskToGoogle(task({ sendInvites: true })).attendees).toEqual([
      { email: "klient@firma.cz" },
    ]);
  });
  it("id události je deterministické a z povolených znaků", () => {
    expect(googleIdForTask(TASK_ID)).toMatch(/^opsys[0-9a-f]{32}$/);
    expect(googleIdForTask(TASK_ID)).toBe(googleIdForTask(TASK_ID));
  });
  it("čas události zpět do úkolu: datum, čas a délka v pražském čase", () => {
    expect(
      timesToTask({
        startsAt: new Date("2026-10-15T07:30:00Z"),
        endsAt: new Date("2026-10-15T09:00:00Z"),
        allDay: false,
      }),
    ).toEqual({ dueDate: "2026-10-15", dueTime: "09:30", durationMin: 90, allDay: false });
    expect(
      timesToTask({
        startsAt: new Date("2026-10-14T22:00:00Z"),
        endsAt: new Date("2026-10-15T22:00:00Z"),
        allDay: true,
      }),
    ).toEqual({ dueDate: "2026-10-15", dueTime: null, durationMin: null, allDay: true });
  });
  it("zápis, který by nic nezměnil, se pozná", () => {
    const g = taskToGoogle(task());
    const same = inputToFields(g);
    expect(sameWritten(same, { ...same })).toBe(true);
    expect(
      sameWritten(same, { ...same, startsAt: new Date(same.startsAt.getTime() + 60_000) }),
    ).toBe(false);
    expect(sameWritten(same, { ...same, title: "Jiný" })).toBe(false);
    expect(sameWritten(same, { ...same, visibility: "private" })).toBe(false);
    expect(
      sameWritten({ ...same, visibility: "private" }, { ...same, visibility: "confidential" }),
    ).toBe(true);
  });
});

describe("konflikt: novější změna vyhrává", () => {
  const t = (iso: string) => new Date(iso);
  it("bez čekající změny z OPSYS vyhrává Google", () => {
    expect(
      resolveConflict({ localQueuedAt: null, remoteUpdatedAt: t("2026-10-15T10:00:00Z") }),
    ).toBe("remote");
  });
  it("novější v Googlu přebije čekající zápis", () => {
    expect(
      resolveConflict({
        localQueuedAt: t("2026-10-15T10:00:00Z"),
        remoteUpdatedAt: t("2026-10-15T10:00:05Z"),
      }),
    ).toBe("remote");
  });
  it("novější v OPSYS zůstane, při shodě i bez času z Googlu vyhrává OPSYS", () => {
    expect(
      resolveConflict({
        localQueuedAt: t("2026-10-15T10:00:10Z"),
        remoteUpdatedAt: t("2026-10-15T10:00:05Z"),
      }),
    ).toBe("local");
    expect(
      resolveConflict({
        localQueuedAt: t("2026-10-15T10:00:05Z"),
        remoteUpdatedAt: t("2026-10-15T10:00:05Z"),
      }),
    ).toBe("local");
    expect(
      resolveConflict({ localQueuedAt: t("2026-10-15T10:00:05Z"), remoteUpdatedAt: null }),
    ).toBe("local");
  });
});
