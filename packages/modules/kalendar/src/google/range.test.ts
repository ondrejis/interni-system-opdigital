import { describe, expect, it } from "vitest";
import { BUSY_TITLE } from "../contract";
import { pollDue } from "./sync";
import { projectEvent, type Row, type Viewer } from "./range";

const PATRIK = "00000000-0000-4000-8000-0000000000a1";
const ONDREJ = "00000000-0000-4000-8000-0000000000a2";

const row = (over: Partial<Row["event"]> = {}, owner = PATRIK): Row => ({
  ownerId: owner,
  ownerName: owner === PATRIK ? "Patrik" : "Ondřej",
  calendar: {
    id: "cal1",
    name: "Patrik",
    color: "#4285f4",
    accessRole: "owner",
  } as Row["calendar"],
  event: {
    id: "ev1",
    calendarId: "cal1",
    googleId: "g1",
    title: "Zubař - tajné",
    startsAt: new Date("2026-10-15T07:00:00Z"),
    endsAt: new Date("2026-10-15T08:00:00Z"),
    allDay: false,
    place: "Ordinace",
    meetUrl: null,
    description: "Citlivý popis",
    attendees: [{ email: "x@y.cz" }],
    isGooglePrivate: false,
    taskId: null,
    dealId: "deal1",
    companyId: null,
    personId: null,
    recurringEventId: null,
    source: "google",
    htmlLink: "https://calendar.google.com/e/1",
    ...over,
  } as Row["event"],
});

const viewer = (userId: string, over: Partial<Viewer> = {}): Viewer => ({
  userId,
  canWrite: true,
  writeAll: true,
  canSeePrivate: userId === ONDREJ,
  ...over,
});
const none = { deal: {}, company: {}, person: {} };

describe("Obsazeno (projekce události pro diváka)", () => {
  it("cizí soukromá událost ukáže jen čas a „Obsazeno“, nic z obsahu", () => {
    const i = projectEvent(row({ isGooglePrivate: true }), viewer(ONDREJ), {
      taskPrivate: false,
      titles: { ...none, deal: { deal1: "Obchod X" } },
    });
    expect(i.kind).toBe("busy");
    expect(i.title).toBe(BUSY_TITLE);
    expect(JSON.stringify(i)).not.toMatch(
      /Zubař|Ordinace|Citlivý|x@y\.cz|Obchod X|deal1|calendar\.google/,
    );
    expect(i.eventId).toBeNull();
    expect(i.canEdit).toBe(false);
    expect(i.start).toBe("2026-10-15T09:00");
    expect(i.end).toBe("2026-10-15T10:00");
  });
  it("vlastní soukromá událost vidí majitel celou", () => {
    const i = projectEvent(row({ isGooglePrivate: true }), viewer(PATRIK), {
      taskPrivate: false,
      titles: none,
    });
    expect(i.kind).toBe("event");
    expect(i.title).toBe("Zubař - tajné");
    expect(i.own).toBe(true);
    expect(i.description).toBe("Citlivý popis");
  });
  it("cizí událost navázaná na soukromý úkol je pro diváka bez práva na soukromé „Obsazeno“", () => {
    const partner = viewer(PATRIK, { canSeePrivate: false });
    const i = projectEvent(row({ taskId: "t1" }, ONDREJ), partner, {
      taskPrivate: true,
      titles: none,
    });
    expect(i.kind).toBe("busy");
    const owner = projectEvent(row({ taskId: "t1" }, PATRIK), viewer(ONDREJ), {
      taskPrivate: true,
      titles: none,
    });
    expect(owner.kind).toBe("event");
  });
  it("cizí běžná událost má název a místo, ale ne popis; vazba jen na záznam, který divák vidí", () => {
    const hidden = projectEvent(row(), viewer(ONDREJ), { taskPrivate: false, titles: none });
    expect(hidden.title).toBe("Zubař - tajné");
    expect(hidden.description).toBeNull();
    expect(hidden.deal).toBeNull();
    const seen = projectEvent(row(), viewer(ONDREJ), {
      taskPrivate: false,
      titles: { ...none, deal: { deal1: "Web Novák" } },
    });
    expect(seen.deal).toEqual({ id: "deal1", title: "Web Novák" });
  });
  it("celodenní událost má konec jako poslední den včetně", () => {
    const i = projectEvent(
      row(
        {
          allDay: true,
          startsAt: new Date("2026-10-14T22:00:00Z"),
          endsAt: new Date("2026-10-16T22:00:00Z"),
        },
        PATRIK,
      ),
      viewer(PATRIK),
      { taskPrivate: false, titles: none },
    );
    expect([i.start, i.end]).toEqual(["2026-10-15", "2026-10-16"]);
  });
  it("kalendář jen pro čtení nejde upravovat", () => {
    const r = row();
    r.calendar = { ...r.calendar, accessRole: "reader" };
    expect(projectEvent(r, viewer(PATRIK), { taskPrivate: false, titles: none }).canEdit).toBe(
      false,
    );
  });
});

describe("záložní čtení (polling)", () => {
  const now = new Date("2026-10-15T10:00:00Z");
  it("bez push kanálu se čte každou minutu, s živým kanálem jednou za 5 minut", () => {
    const last = new Date(now.getTime() - 90_000);
    expect(pollDue({ lastSyncAt: last, watchChannelId: null, watchExpiresAt: null }, now)).toBe(
      true,
    );
    expect(
      pollDue(
        {
          lastSyncAt: last,
          watchChannelId: "c",
          watchExpiresAt: new Date(now.getTime() + 3600_000),
        },
        now,
      ),
    ).toBe(false);
    expect(
      pollDue(
        {
          lastSyncAt: new Date(now.getTime() - 300_000),
          watchChannelId: "c",
          watchExpiresAt: new Date(now.getTime() + 3600_000),
        },
        now,
      ),
    ).toBe(true);
    // vypršelý kanál = jako bez kanálu
    expect(
      pollDue(
        { lastSyncAt: last, watchChannelId: "c", watchExpiresAt: new Date(now.getTime() - 1) },
        now,
      ),
    ).toBe(true);
    expect(pollDue({ lastSyncAt: null, watchChannelId: null, watchExpiresAt: null }, now)).toBe(
      true,
    );
  });
});
