import { describe, expect, it } from "vitest";
import { zonedToUtc } from "@rebar/core/time";
import {
  activityEnd,
  dayOf,
  dueFromInput,
  dueState,
  dueToInput,
  filterTimeline,
  formatDue,
  formatDuration,
  normalizeDue,
  rangeBounds,
  snoozeTarget,
  suggestNextDue,
} from "./logic";
import type { TimelineEntry } from "./types";

/** Středa 14. 10. 2026, 10:00 pražského času (letní čas, UTC+2). */
const NOW = zonedToUtc("2026-10-14", "10:00");
const at = (date: string, time = "00:00") => zonedToUtc(date, time);

describe("stav aktivity vůči dnešku", () => {
  it("hotová, bez termínu, budoucí, dnes a po termínu", () => {
    expect(dueState({ dueAt: at("2026-10-10"), allDay: true, doneAt: NOW }, NOW)).toBe("done");
    expect(dueState({ dueAt: null, allDay: false }, NOW)).toBe("nodate");
    expect(dueState({ dueAt: at("2026-10-15", "09:00"), allDay: false }, NOW)).toBe("future");
    expect(dueState({ dueAt: at("2026-10-13", "23:00"), allDay: false }, NOW)).toBe("overdue");
    expect(dueState({ dueAt: at("2026-10-14", "15:00"), allDay: false }, NOW)).toBe("today");
  });

  it("časová aktivita dnes je po termínu, jakmile čas uplyne; celodenní až od dalšího dne", () => {
    expect(dueState({ dueAt: at("2026-10-14", "09:00"), allDay: false }, NOW)).toBe("overdue");
    expect(dueState({ dueAt: at("2026-10-14"), allDay: true }, NOW)).toBe("today");
    expect(dueState({ dueAt: at("2026-10-13"), allDay: true }, NOW)).toBe("overdue");
  });

  it("v den změny času se den nerozjede (půlnoc pražského času)", () => {
    // neděle 25. 10. 2026 končí letní čas: den má 25 hodin, celodenní aktivita zůstává „dnes“ celý den
    const lateSunday = zonedToUtc("2026-10-25", "23:30");
    expect(dueState({ dueAt: at("2026-10-25"), allDay: true }, lateSunday)).toBe("today");
    expect(dueState({ dueAt: at("2026-10-25"), allDay: true }, at("2026-10-26", "00:10"))).toBe(
      "overdue",
    );
  });
});

describe("normalizace termínu a konec aktivity", () => {
  it("celodenní se uloží na půlnoc pražského času toho dne", () => {
    const n = normalizeDue(at("2026-10-14", "15:30"), true);
    expect(n.toISOString()).toBe(at("2026-10-14").toISOString());
    expect(dayOf(n)).toBe("2026-10-14");
  });

  it("časová beze změny; konec = začátek + délka (výchozí 30 min), celodenní do půlnoci dalšího dne", () => {
    const start = at("2026-10-14", "09:00");
    expect(normalizeDue(start, false)).toBe(start);
    expect(activityEnd(start, false, 90).getTime() - start.getTime()).toBe(90 * 60_000);
    expect(activityEnd(start, false, null).getTime() - start.getTime()).toBe(30 * 60_000);
    expect(activityEnd(at("2026-10-14"), true, null).toISOString()).toBe(
      at("2026-10-15").toISOString(),
    );
  });
});

describe("návrh další aktivity a odložení", () => {
  it("nejbližší pracovní den po dokončení ve stejnou hodinu", () => {
    const next = suggestNextDue({ dueAt: at("2026-10-14", "09:30"), allDay: false }, NOW);
    expect(next.toISOString()).toBe(at("2026-10-15", "09:30").toISOString());
  });

  it("přes víkend a státní svátek (pátek 16. 10. → pondělí 19. 10.; 28. 10. je svátek)", () => {
    expect(
      suggestNextDue(
        { dueAt: at("2026-10-16", "10:00"), allDay: false },
        at("2026-10-16", "12:00"),
      ),
    ).toEqual(at("2026-10-19", "10:00"));
    expect(
      suggestNextDue({ dueAt: at("2026-10-27"), allDay: true }, at("2026-10-27", "08:00")),
    ).toEqual(at("2026-10-29"));
  });

  it("aktivita z budoucnosti dokončená dřív: další je po jejím termínu; bez termínu 9:00", () => {
    expect(suggestNextDue({ dueAt: at("2026-10-20", "14:00"), allDay: false }, NOW)).toEqual(
      at("2026-10-21", "14:00"),
    );
    expect(suggestNextDue({ dueAt: null, allDay: false }, NOW)).toEqual(at("2026-10-15", "09:00"));
  });

  it("odložení o dny od dneška se stejnou hodinou", () => {
    expect(snoozeTarget({ dueAt: at("2026-10-01", "08:15"), allDay: false }, 1, NOW)).toEqual(
      at("2026-10-15", "08:15"),
    );
    expect(snoozeTarget({ dueAt: at("2026-10-01"), allDay: true }, 7, NOW)).toEqual(
      at("2026-10-21"),
    );
  });
});

describe("rychlé časové filtry", () => {
  it("dnes, zítra, tento a příští týden (pondělí až neděle)", () => {
    expect(rangeBounds("today", NOW)).toMatchObject({ fromDay: "2026-10-14", toDay: "2026-10-14" });
    expect(rangeBounds("tomorrow", NOW)).toMatchObject({
      fromDay: "2026-10-15",
      toDay: "2026-10-15",
    });
    expect(rangeBounds("week", NOW)).toMatchObject({ fromDay: "2026-10-12", toDay: "2026-10-18" });
    expect(rangeBounds("nextWeek", NOW)).toMatchObject({
      fromDay: "2026-10-19",
      toDay: "2026-10-25",
    });
    expect(rangeBounds("open", NOW)).toMatchObject({ done: false, overdue: false });
    expect(rangeBounds("overdue", NOW)).toMatchObject({ done: false, overdue: true });
    expect(rangeBounds("done", NOW).done).toBe(true);
  });
});

describe("zobrazení termínu a pole formuláře", () => {
  it("dnes, zítra, včera, den v týdnu, datum", () => {
    expect(formatDue(at("2026-10-14", "14:30"), false, NOW)).toBe("Dnes 14:30");
    expect(formatDue(at("2026-10-15"), true, NOW)).toBe("Zítra");
    expect(formatDue(at("2026-10-13", "09:00"), false, NOW)).toBe("Včera 9:00");
    expect(formatDue(at("2026-10-16", "09:00"), false, NOW)).toBe("Pá 9:00");
    expect(formatDue(at("2026-11-03"), true, NOW)).toBe("3. 11.");
    expect(formatDue(at("2027-01-05"), true, NOW)).toBe("5. 1. 2027");
    expect(formatDue(null, false, NOW)).toBe("Bez termínu");
  });

  it("datum a čas z formuláře a zpět (pražský čas)", () => {
    const iso = dueFromInput("2026-10-14", "14:30", false);
    expect(iso).toBe(at("2026-10-14", "14:30").toISOString());
    expect(dueToInput(iso, false)).toEqual({ date: "2026-10-14", time: "14:30" });
    expect(dueFromInput("2026-10-14", "14:30", true)).toBe(at("2026-10-14").toISOString());
    expect(dueToInput(at("2026-10-14"), true)).toEqual({ date: "2026-10-14", time: "" });
    expect(formatDuration(90)).toBe("1 h 30 min");
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(null)).toBe("");
  });
});

describe("filtry časové osy", () => {
  const entries = [
    { kind: "activity" },
    { kind: "note" },
    { kind: "comment" },
    { kind: "file" },
    { kind: "audit" },
  ] as unknown as TimelineEntry[];
  it("komentáře patří k poznámkám", () => {
    expect(filterTimeline(entries, "all")).toHaveLength(5);
    expect(filterTimeline(entries, "note").map((e) => e.kind)).toEqual(["note", "comment"]);
    expect(filterTimeline(entries, "audit").map((e) => e.kind)).toEqual(["audit"]);
    expect(filterTimeline(entries, "file").map((e) => e.kind)).toEqual(["file"]);
    expect(filterTimeline(entries, "activity").map((e) => e.kind)).toEqual(["activity"]);
  });
});
