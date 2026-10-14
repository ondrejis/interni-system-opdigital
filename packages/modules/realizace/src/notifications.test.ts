import { describe, expect, it } from "vitest";
import { validateEventDefs } from "@rebar/core/notifications";
import { REALIZACE_NOTIFICATIONS } from "./notifications";
import { nextWorkday, previousWorkday } from "./scheduled";

describe("události upozornění modulu Realizace", () => {
  it("katalog je platný (klíče, parametry šablon, příjemci)", () => {
    expect(validateEventDefs(REALIZACE_NOTIFICATIONS)).toEqual([]);
  });

  it("zachovává původní klíče a plánované události jsou označené", () => {
    const keys = REALIZACE_NOTIFICATIONS.map((e) => e.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "job.schedule",
        "job.diary",
        "job.handover",
        "defect.new",
        "defect.assigned",
      ]),
    );
    expect(
      REALIZACE_NOTIFICATIONS.filter((e) => e.scheduled)
        .map((e) => e.key)
        .sort(),
    ).toEqual(
      [
        "realizace.diary_missing",
        "realizace.phase_deadline",
        "realizace.phase_overdue",
        "realizace.phase_starts",
        "realizace.today",
      ].sort(),
    );
    // naléhavé je jen zpoždění fáze
    expect(
      REALIZACE_NOTIFICATIONS.filter((e) => e.severity === "urgent").map((e) => e.key),
    ).toEqual(["realizace.phase_overdue"]);
  });

  it("změny harmonogramu se slučují, aby tažení v Ganttu nevyrobilo bouřku upozornění", () => {
    const schedule = REALIZACE_NOTIFICATIONS.find((e) => e.key === "job.schedule")!;
    expect(schedule.mergeWindowSeconds).toBeGreaterThanOrEqual(600);
    expect(schedule.debounceSeconds).toBeGreaterThan(0);
  });
});

describe("pracovní dny kolem dne", () => {
  it("předchozí a následující pracovní den přeskočí víkend i svátek", () => {
    expect(previousWorkday("2026-10-12")).toBe("2026-10-09"); // pondělí → pátek
    expect(nextWorkday("2026-10-09")).toBe("2026-10-12"); // pátek → pondělí
    expect(nextWorkday("2026-10-27")).toBe("2026-10-29"); // 28. 10. je státní svátek
    expect(previousWorkday("2026-10-29")).toBe("2026-10-27");
  });
});
