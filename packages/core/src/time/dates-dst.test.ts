import { describe, expect, it } from "vitest";
import {
  addDaysIso,
  addMonthsIso,
  addWorkdays,
  diffDaysIso,
  eachDayIso,
  localParts,
  todayIso,
  zonedToUtc,
} from "./dates";

/** Datumy přes oba přechody letního času (29. 3. a 25. 10. 2026) se počítají po kalendářních dnech, ne po 24 hodinách. */
describe("datum přes přechod letního času", () => {
  it("počet dnů a výčet dnů má vždy celé dny", () => {
    expect(diffDaysIso("2026-03-28", "2026-03-30")).toBe(2);
    expect(diffDaysIso("2026-10-24", "2026-10-26")).toBe(2);
    expect(eachDayIso("2026-03-27", "2026-03-31")).toEqual([
      "2026-03-27",
      "2026-03-28",
      "2026-03-29",
      "2026-03-30",
      "2026-03-31",
    ]);
    expect(eachDayIso("2026-10-24", "2026-10-26")).toHaveLength(3);
    expect(addDaysIso("2026-10-24", 2)).toBe("2026-10-26");
    expect(addDaysIso("2026-10-26", -2)).toBe("2026-10-24");
    expect(addMonthsIso("2026-02-28", 1)).toBe("2026-03-28");
  });

  it("pracovní dny přeskočí víkend s přechodem na letní čas", () => {
    // pátek 27. 3. + 1 pracovní den = pondělí 30. 3. (neděle 29. 3. má 23 hodin)
    expect(addWorkdays("2026-03-27", 1)).toBe("2026-03-30");
  });

  it("dnešní datum v Praze se přepíná o půlnoci místního času, ne UTC", () => {
    // 28. 3. 2026 23:30 UTC je už 29. 3. 00:30 v Praze (zimní čas, UTC+1)
    expect(todayIso("Europe/Prague", new Date("2026-03-28T23:30:00Z"))).toBe("2026-03-29");
    // 24. 10. 2026 22:30 UTC je 25. 10. 00:30 v Praze (ještě letní čas, UTC+2)
    expect(todayIso("Europe/Prague", new Date("2026-10-24T22:30:00Z"))).toBe("2026-10-25");
  });

  it("hodina, která se při přechodu na zimní čas opakuje, jde převést zpět", () => {
    const t = zonedToUtc("2026-10-25", "02:30");
    expect(localParts(t).date).toBe("2026-10-25");
    expect(localParts(t).time).toBe("02:30");
  });
});
