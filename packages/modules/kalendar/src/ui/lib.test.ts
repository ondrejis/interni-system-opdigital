import { describe, expect, it } from "vitest";
import { CALENDAR_TIME_ZONE as CONTRACT_TZ, WORK_HOURS } from "../contract";
import {
  clock,
  collides,
  layerOf,
  layoutDay,
  localToInstant,
  minutesOf,
  moveAllDay,
  moveInstants,
  nextFullHour,
  parseEmails,
  resizeInstants,
  segmentFor,
  selectionRange,
  snap,
  visibleItems,
  whenLabel,
  wallMinutes,
  LAYER_MINE,
  LAYER_OTHERS,
  CALENDAR_TIME_ZONE,
  WORK_FROM_MIN,
  WORK_TO_MIN,
  type Item,
} from "./lib";

const item = (over: Partial<Item> & { start: string; end: string }): Item => ({
  id: over.id ?? over.start,
  kind: "event",
  layer: null,
  title: over.title ?? "Schůzka",
  allDay: false,
  startsAt: null,
  endsAt: null,
  color: "blue",
  href: null,
  eventId: over.id ?? "e",
  taskId: null,
  location: null,
  meetUrl: null,
  description: null,
  calendarId: null,
  calendarName: null,
  owner: null,
  ownerId: null,
  own: true,
  attendees: [],
  recurring: false,
  canEdit: true,
  source: "google",
  deal: null,
  company: null,
  person: null,
  htmlLink: null,
  ...over,
});

describe("segmenty a kolize", () => {
  it("událost přes půlnoc se v každém dni ořízne", () => {
    const e = item({ start: "2026-10-14T22:00", end: "2026-10-15T01:30" });
    expect(segmentFor(e, "2026-10-14")).toMatchObject({ startMin: 1320, endMin: 1440 });
    expect(segmentFor(e, "2026-10-15")).toMatchObject({ startMin: 0, endMin: 90 });
    expect(segmentFor(e, "2026-10-16")).toBeNull();
  });
  it("konec přesně o půlnoci patří předchozímu dni", () => {
    const e = item({ start: "2026-10-14T22:00", end: "2026-10-15T00:00" });
    expect(segmentFor(e, "2026-10-14")).toMatchObject({ endMin: 1440 });
    expect(segmentFor(e, "2026-10-15")).toBeNull();
  });
  it("celodenní a svátky do mřížky nepatří", () => {
    expect(
      segmentFor(item({ start: "2026-10-14", end: "2026-10-14", allDay: true }), "2026-10-14"),
    ).toBeNull();
    expect(
      segmentFor(item({ start: "2026-10-14", end: "2026-10-14", kind: "holiday" }), "2026-10-14"),
    ).toBeNull();
  });
  it("překrývající se události stojí vedle sebe, ostatní zabírají celou šířku", () => {
    const seg = (s: string, e: string, id: string) =>
      segmentFor(item({ id, start: `2026-10-14T${s}`, end: `2026-10-14T${e}` }), "2026-10-14")!;
    const placed = layoutDay([
      seg("09:00", "10:00", "a"),
      seg("09:30", "10:30", "b"),
      seg("10:00", "11:00", "c"), // začíná, až skončí a, ale překrývá b
      seg("13:00", "14:00", "d"),
    ]);
    const by = Object.fromEntries(placed.map((p) => [p.item.id, p]));
    expect(by.a).toMatchObject({ col: 0, cols: 2 });
    expect(by.b).toMatchObject({ col: 1, cols: 2 });
    expect(by.c).toMatchObject({ col: 0, cols: 2 });
    expect(by.d).toMatchObject({ col: 0, cols: 1 });
  });
  it("tři současné události mají tři sloupce; krátká událost se pro kolizi bere s minimální výškou", () => {
    const seg = (s: string, e: string, id: string) =>
      segmentFor(item({ id, start: `2026-10-14T${s}`, end: `2026-10-14T${e}` }), "2026-10-14")!;
    const placed = layoutDay([
      seg("09:00", "10:00", "a"),
      seg("09:00", "10:00", "b"),
      seg("09:10", "09:20", "c"),
    ]);
    expect(new Set(placed.map((p) => p.cols))).toEqual(new Set([3]));
    expect(collides(seg("09:00", "09:05", "x"), seg("09:10", "09:15", "y"))).toBe(true);
    expect(collides(seg("09:00", "10:00", "x"), seg("10:00", "11:00", "y"))).toBe(false);
  });
});

describe("tažení: přichytávání a výběr", () => {
  it("přichytí na 15 minut", () => {
    expect(snap(7)).toBe(0);
    expect(snap(8)).toBe(15);
    expect(snap(547)).toBe(540);
  });
  it("výběr tažením se seřadí a má minimální délku; prosté kliknutí dá hodinu", () => {
    expect(selectionRange(600, 540)).toEqual({ startMin: 540, endMin: 600 });
    expect(selectionRange(600, 604)).toEqual({ startMin: 600, endMin: 615 });
    expect(selectionRange(600, 600)).toEqual({ startMin: 600, endMin: 660 });
    expect(selectionRange(1430, 1440)).toEqual({ startMin: 1425, endMin: 1440 });
  });
  it("nová schůzka začíná v nejbližší celou hodinu v pracovní době", () => {
    expect(nextFullHour(5 * 60)).toBe(8 * 60);
    expect(nextFullHour(10 * 60 + 5)).toBe(11 * 60);
    expect(nextFullHour(23 * 60)).toBe(17 * 60);
  });
});

describe("převody času a letní čas (Europe/Prague)", () => {
  it("místní čas → okamžik: zima +1, léto +2", () => {
    expect(localToInstant("2026-01-15", 9 * 60)).toBe("2026-01-15T08:00:00.000Z");
    expect(localToInstant("2026-07-15", 9 * 60)).toBe("2026-07-15T07:00:00.000Z");
  });
  it("minuty přes půlnoc se přenesou do dalšího dne", () => {
    expect(localToInstant("2026-01-15", 1440 + 30)).toBe(localToInstant("2026-01-16", 30));
    expect(localToInstant("2026-01-15", -30)).toBe(localToInstant("2026-01-14", 1410));
  });
  it("přesun přes jarní změnu času zachová nástěnné hodiny i délku", () => {
    // 28. 3. 2026 22:00–23:00 → 29. 3. (přechod na letní čas v 2:00) 22:00
    const e = item({ start: "2026-03-28T22:00", end: "2026-03-28T23:00" });
    const m = moveInstants(e, "2026-03-29", 22 * 60);
    expect(m.startsAt).toBe("2026-03-29T20:00:00.000Z"); // 22:00 CEST
    expect(m.endsAt).toBe("2026-03-29T21:00:00.000Z");
  });
  it("přesun přes podzimní změnu času (25. 10. 2026)", () => {
    const e = item({ start: "2026-10-24T10:00", end: "2026-10-24T11:30" });
    const m = moveInstants(e, "2026-10-25", 10 * 60);
    expect(m.startsAt).toBe("2026-10-25T09:00:00.000Z"); // 10:00 CET
    expect(m.endsAt).toBe("2026-10-25T10:30:00.000Z");
    expect(wallMinutes(e.start, e.end)).toBe(90);
  });
  it("neexistující hodina jarního skoku nespadne a zůstane v okolí skoku", () => {
    const t = Date.parse(localToInstant("2026-03-29", 2 * 60 + 30));
    expect(t).toBeGreaterThanOrEqual(Date.parse("2026-03-29T00:00:00Z"));
    expect(t).toBeLessThanOrEqual(Date.parse("2026-03-29T01:30:00Z"));
  });
  it("změna délky: nejméně 15 minut, začátek zůstává", () => {
    const e = item({ start: "2026-01-15T09:00", end: "2026-01-15T10:00" });
    expect(resizeInstants(e, 11 * 60 + 30)).toEqual({
      startsAt: "2026-01-15T08:00:00.000Z",
      endsAt: "2026-01-15T10:30:00.000Z",
    });
    expect(resizeInstants(e, 9 * 60).endsAt).toBe("2026-01-15T08:15:00.000Z");
  });
  it("celodenní přesun o dny: půlnoc po posledním dni", () => {
    const e = item({ start: "2026-01-15", end: "2026-01-16", allDay: true });
    expect(moveAllDay(e, 2)).toEqual({
      startsAt: "2026-01-16T23:00:00.000Z",
      endsAt: "2026-01-18T23:00:00.000Z",
    });
  });
  it("minutesOf a whenLabel", () => {
    expect(minutesOf("2026-10-14T14:30")).toBe(870);
    expect(minutesOf("2026-10-14")).toBe(0);
    expect(whenLabel({ start: "2026-10-14T14:00", end: "2026-10-14T15:30", allDay: false })).toBe(
      "st 14. 10. 14:00–15:30",
    );
    expect(whenLabel({ start: "2026-10-14", end: "2026-10-15", allDay: true })).toBe(
      "st 14. 10. – čt 15. 10. (celý den)",
    );
  });
});

describe("vrstvy", () => {
  it("vlastní události, cizí a obsazeno, vrstvy modulů, svátky", () => {
    expect(layerOf({ kind: "event", own: true, layer: null })).toBe(LAYER_MINE);
    expect(layerOf({ kind: "event", own: false, layer: null })).toBe(LAYER_OTHERS);
    expect(layerOf({ kind: "busy", own: false, layer: null })).toBe(LAYER_OTHERS);
    expect(layerOf({ kind: "layer", own: false, layer: "ukoly" })).toBe("ukoly");
    expect(layerOf({ kind: "holiday", own: false, layer: "holiday" })).toBeNull();
  });
  it("vypnutá vrstva položky schová, svátky ne", () => {
    const items = [
      item({ id: "1", start: "2026-10-14T09:00", end: "2026-10-14T10:00" }),
      item({
        id: "2",
        start: "2026-10-14T09:00",
        end: "2026-10-14T10:00",
        kind: "busy",
        own: false,
      }),
      item({ id: "3", start: "2026-10-14", end: "2026-10-14", kind: "holiday", layer: "holiday" }),
      item({
        id: "4",
        start: "2026-10-14",
        end: "2026-10-14",
        kind: "layer",
        layer: "ukoly",
        allDay: true,
      }),
    ];
    expect(visibleItems(items, [LAYER_OTHERS, "ukoly"]).map((i) => i.id)).toEqual(["1", "3"]);
    expect(visibleItems(items, []).length).toBe(4);
  });
});

describe("e-maily účastníků", () => {
  it("rozdělí, zmenší, odstraní duplicity a oddělí neplatné", () => {
    expect(parseEmails("Jan@Firma.cz, petr@x.cz; jan@firma.cz  <eva@x.cz>\nchyba")).toEqual({
      valid: ["jan@firma.cz", "petr@x.cz", "eva@x.cz"],
      invalid: ["chyba"],
    });
    expect(parseEmails("")).toEqual({ valid: [], invalid: [] });
  });
});

describe("shoda s kontraktem", () => {
  it("časová zóna a pracovní doba odpovídají kontraktu", () => {
    expect(CALENDAR_TIME_ZONE).toBe(CONTRACT_TZ);
    expect(clock(WORK_FROM_MIN)).toBe(WORK_HOURS.from);
    expect(clock(WORK_TO_MIN)).toBe(WORK_HOURS.to);
  });
});
