import { describe, expect, it } from "vitest";
import type { CalendarItemDto } from "../contract";
import { upcomingListItems } from "./widget";

const it_ = (o: Partial<CalendarItemDto> & { start: string; end: string }): CalendarItemDto =>
  ({
    id: o.id ?? o.start,
    kind: "event",
    layer: null,
    title: "Schůzka",
    allDay: false,
    own: true,
    owner: null,
    location: null,
    ...o,
  }) as CalendarItemDto;

const now = { date: "2026-10-14", time: "12:00" };

describe("nadcházející schůzky pro Přehled", () => {
  it("jen dnešní nedokončené a zítřejší, seřazené, s odznakem Dnes/Zítra", () => {
    const list = upcomingListItems(
      [
        it_({ id: "pozde", title: "Pozítří", start: "2026-10-16T09:00", end: "2026-10-16T10:00" }),
        it_({ id: "zitra", title: "Zítra", start: "2026-10-15T09:00", end: "2026-10-15T10:00" }),
        it_({ id: "skoncila", title: "Ráno", start: "2026-10-14T08:00", end: "2026-10-14T09:00" }),
        it_({ id: "dnes", title: "Odpoledne", start: "2026-10-14T15:00", end: "2026-10-14T16:00" }),
        it_({
          id: "celodenni",
          title: "Celý den",
          start: "2026-10-14",
          end: "2026-10-14",
          allDay: true,
        }),
      ],
      now,
      10,
    );
    expect(list.map((x) => x.id)).toEqual(["dnes", "zitra"]);
    expect(list.map((x) => x.badge)).toEqual(["Dnes", "Zítra"]);
  });
  it("cizí soukromá událost je jen „Obsazeno“: bez názvu, místa a odkazu", () => {
    const [x] = upcomingListItems(
      [
        it_({
          kind: "busy",
          own: false,
          owner: "Patrik",
          title: "Obsazeno",
          location: "TAJNÉ MÍSTO",
          start: "2026-10-14T14:00",
          end: "2026-10-14T15:00",
        }),
      ],
      now,
      10,
    );
    expect(x!.title).toBe("Obsazeno");
    expect(x!.href).toBeUndefined();
    expect(JSON.stringify(x)).not.toContain("TAJNÉ");
  });
  it("respektuje limit", () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      it_({ id: `e${i}`, start: `2026-10-14T1${i}:00`, end: `2026-10-14T1${i}:30` }),
    );
    expect(upcomingListItems(many, now, 3)).toHaveLength(3);
  });
});
