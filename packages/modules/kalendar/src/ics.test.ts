import { describe, expect, it } from "vitest";
import { localParts, zonedToUtc } from "@rebar/core/time";
import { buildIcs, expandIcs, icsFold, icsText, parseIcs, type IcsExportEvent } from "./ics";

const ev = (over: Partial<IcsExportEvent> = {}): IcsExportEvent => ({
  uid: "e1@test",
  title: "Schůzka, s klientem; důležitá",
  startsAt: zonedToUtc("2026-10-05", "08:00"),
  endsAt: zonedToUtc("2026-10-05", "09:30"),
  allDay: false,
  recurrence: null,
  recurrenceUntil: null,
  reminderMinutes: null,
  updatedAt: new Date("2026-10-01T10:00:00Z"),
  ...over,
});

describe("export", () => {
  it("sestaví platný kalendář se zónou, escapováním a CRLF", () => {
    const ics = buildIcs(
      [ev({ location: "Plzeň, Hlavní 1", description: "Řádek 1\nŘádek 2" })],
      "Můj kalendář",
    );
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("BEGIN:VTIMEZONE\r\nTZID:Europe/Prague");
    expect(ics).toContain("DTSTART;TZID=Europe/Prague:20261005T080000");
    expect(ics).toContain("DTEND;TZID=Europe/Prague:20261005T093000");
    expect(ics).toContain("SUMMARY:Schůzka\\, s klientem\\; důležitá");
    expect(ics).toContain("LOCATION:Plzeň\\, Hlavní 1");
    expect(ics).toContain("DESCRIPTION:Řádek 1\\nŘádek 2");
    expect(ics).toContain("DTSTAMP:20261001T100000Z");
    expect(ics).not.toMatch(/[^\r]\n/);
  });

  it("celodenní událost jako DATE, opakování s UNTIL a připomenutí", () => {
    const ics = buildIcs(
      [
        ev({
          allDay: true,
          startsAt: zonedToUtc("2026-10-05", "00:00"),
          endsAt: zonedToUtc("2026-10-07", "00:00"),
          recurrence: "weekly",
          recurrenceUntil: "2026-12-31",
          reminderMinutes: 60,
        }),
      ],
      "x",
    );
    expect(ics).toContain("DTSTART;VALUE=DATE:20261005");
    expect(ics).toContain("DTEND;VALUE=DATE:20261007");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;UNTIL=20261231");
    expect(ics).toContain("TRIGGER:-PT60M");
    const timed = buildIcs([ev({ recurrence: "weekdays", recurrenceUntil: "2026-10-30" })], "x");
    expect(timed).toContain(
      "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;UNTIL=20261030T213900Z".slice(0, 55),
    );
    expect(timed).toMatch(/UNTIL=20261030T2[12]5900Z/);
  });

  it("dlouhé řádky se zalamují po 75 bajtech a nerozdělí znak", () => {
    const folded = icsFold(`SUMMARY:${"č".repeat(80)}`);
    for (const l of folded.split("\r\n"))
      expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe(`SUMMARY:${"č".repeat(80)}`);
    expect(icsText("a\\b")).toBe("a\\\\b");
  });

  it("export se dá znovu přečíst parserem", () => {
    const [back] = parseIcs(buildIcs([ev({ recurrence: "weekly" })], "x"));
    expect(back).toMatchObject({
      uid: "e1@test",
      title: "Schůzka, s klientem; důležitá",
      allDay: false,
    });
    expect(back!.start.toISOString()).toBe(zonedToUtc("2026-10-05", "08:00").toISOString());
    expect(back!.rrule).toBe("FREQ=WEEKLY");
  });
});

describe("import", () => {
  const wrap = (body: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR\r\n`;

  it("čte časy v UTC, v zóně i plovoucí a celodenní události", () => {
    const events = parseIcs(
      wrap(
        [
          "BEGIN:VEVENT\r\nUID:a\r\nDTSTART:20261005T060000Z\r\nDTEND:20261005T070000Z\r\nSUMMARY:UTC\r\nEND:VEVENT",
          "BEGIN:VEVENT\r\nUID:b\r\nDTSTART;TZID=Europe/Berlin:20261005T080000\r\nSUMMARY:Berlin\r\nEND:VEVENT",
          "BEGIN:VEVENT\r\nUID:c\r\nDTSTART:20261005T080000\r\nSUMMARY:Plovoucí\r\nEND:VEVENT",
          "BEGIN:VEVENT\r\nUID:d\r\nDTSTART;VALUE=DATE:20261005\r\nDTEND;VALUE=DATE:20261007\r\nSUMMARY:Celý\\, den\r\nEND:VEVENT",
        ].join("\r\n"),
      ),
    );
    const by = Object.fromEntries(events.map((e) => [e.uid, e]));
    expect(by.a!.start.toISOString()).toBe("2026-10-05T06:00:00.000Z");
    expect(by.b!.start.toISOString()).toBe("2026-10-05T06:00:00.000Z"); // Berlín = Praha
    expect(by.b!.end.getTime() - by.b!.start.getTime()).toBe(3_600_000); // bez konce hodina
    expect(by.c!.start.toISOString()).toBe(zonedToUtc("2026-10-05", "08:00").toISOString());
    expect(by.d).toMatchObject({ allDay: true, title: "Celý, den" });
    expect(localParts(by.d!.end).date).toBe("2026-10-07");
  });

  it("neznámou zónu bere jako Prahu, zrušené události a výjimky ignoruje", () => {
    const events = parseIcs(
      wrap(
        [
          "BEGIN:VEVENT\r\nUID:x\r\nDTSTART;TZID=Neexistuje/Zona:20261005T080000\r\nSUMMARY:Zóna\r\nEND:VEVENT",
          "BEGIN:VEVENT\r\nUID:y\r\nDTSTART:20261005T080000Z\r\nSTATUS:CANCELLED\r\nEND:VEVENT",
          "BEGIN:VEVENT\r\nUID:z\r\nRECURRENCE-ID:20261012T080000Z\r\nDTSTART:20261012T090000Z\r\nEND:VEVENT",
          "BEGIN:VEVENT\r\nUID:w\r\nSUMMARY:Bez začátku\r\nEND:VEVENT",
        ].join("\r\n"),
      ),
    );
    expect(events.map((e) => e.uid)).toEqual(["x"]);
    expect(events[0]!.start.toISOString()).toBe(zonedToUtc("2026-10-05", "08:00").toISOString());
  });

  it("zalomené řádky se spojí", () => {
    const [e] = parseIcs(
      wrap(
        "BEGIN:VEVENT\r\nUID:f\r\nDTSTART:20261005T060000Z\r\nSUMMARY:Dlouhý\r\n  název\r\nEND:VEVENT",
      ),
    );
    expect(e!.title).toBe("Dlouhý název");
  });
});

describe("rozbalení opakování z importu", () => {
  const first = (rrule: string | null, extra: Partial<Parameters<typeof expandIcs>[0]> = {}) => ({
    uid: "r",
    title: "R",
    start: zonedToUtc("2026-10-05", "08:00"),
    end: zonedToUtc("2026-10-05", "09:00"),
    allDay: false,
    rrule,
    exdates: [],
    ...extra,
  });
  const dates = (o: { start: Date }[]) => o.map((x) => localParts(x.start).date);

  it("bez pravidla jeden výskyt v okně", () => {
    expect(expandIcs(first(null), "2026-10-01", "2026-10-31")).toHaveLength(1);
    expect(expandIcs(first(null), "2026-11-01", "2026-11-30")).toEqual([]);
  });

  it("denně s intervalem, COUNT a UNTIL", () => {
    expect(
      dates(expandIcs(first("FREQ=DAILY;INTERVAL=2;COUNT=3"), "2026-10-01", "2026-12-31")),
    ).toEqual(["2026-10-05", "2026-10-07", "2026-10-09"]);
    expect(
      dates(expandIcs(first("FREQ=DAILY;UNTIL=20261007T235959Z"), "2026-10-01", "2026-12-31")),
    ).toEqual(["2026-10-05", "2026-10-06", "2026-10-07"]);
  });

  it("týdně s BYDAY a každé dva týdny", () => {
    expect(
      dates(expandIcs(first("FREQ=WEEKLY;BYDAY=MO,WE,FR"), "2026-10-05", "2026-10-11")),
    ).toEqual(["2026-10-05", "2026-10-07", "2026-10-09"]);
    expect(dates(expandIcs(first("FREQ=WEEKLY;INTERVAL=2"), "2026-10-01", "2026-11-15"))).toEqual([
      "2026-10-05",
      "2026-10-19",
      "2026-11-02",
    ]);
  });

  it("měsíčně a ročně; EXDATE výskyt vynechá a COUNT ho započítá", () => {
    expect(dates(expandIcs(first("FREQ=MONTHLY;COUNT=3"), "2026-10-01", "2027-12-31"))).toEqual([
      "2026-10-05",
      "2026-11-05",
      "2026-12-05",
    ]);
    expect(dates(expandIcs(first("FREQ=YEARLY"), "2026-01-01", "2028-12-31"))).toEqual([
      "2026-10-05",
      "2027-10-05",
      "2028-10-05",
    ]);
    expect(
      dates(
        expandIcs(
          first("FREQ=DAILY;COUNT=3", { exdates: ["2026-10-06"] }),
          "2026-10-01",
          "2026-10-31",
        ),
      ),
    ).toEqual(["2026-10-05", "2026-10-07"]);
  });

  it("neznámá frekvence nic nevrací; po změně letního času drží hodinu", () => {
    expect(expandIcs(first("FREQ=HOURLY"), "2026-10-01", "2026-10-31")).toEqual([]);
    const out = expandIcs(
      first("FREQ=WEEKLY", {
        start: zonedToUtc("2026-03-22", "08:00"),
        end: zonedToUtc("2026-03-22", "09:00"),
      }),
      "2026-03-22",
      "2026-03-29",
    );
    expect(out.map((o) => localParts(o.start).time)).toEqual(["08:00", "08:00"]);
  });

  it("celodenní opakování", () => {
    const out = expandIcs(
      first("FREQ=WEEKLY", {
        allDay: true,
        start: zonedToUtc("2026-10-05", "00:00"),
        end: zonedToUtc("2026-10-06", "00:00"),
      }),
      "2026-10-01",
      "2026-10-20",
    );
    expect(dates(out)).toEqual(["2026-10-05", "2026-10-12", "2026-10-19"]);
  });
});
