import { describe, expect, it } from "vitest";
import {
  conflictFixes,
  dependencyConflicts,
  scheduleSummary,
  endAfter,
  jobProgress,
  lengthInWorkdays,
  phaseDelay,
  shiftDependents,
  statusFromProgress,
  toWorkday,
  wouldCycle,
  type PhaseLike,
} from "./schedule";

const phase = (
  id: string,
  startDate: string,
  endDate: string,
  extra: Partial<PhaseLike> = {},
): PhaseLike => ({
  id,
  startDate,
  endDate,
  progress: 0,
  status: "planned",
  ...extra,
});

describe("harmonogram v pracovních dnech", () => {
  it("délka fáze nepočítá víkendy ani svátky (28. 10. 2026 je středa a svátek)", () => {
    expect(lengthInWorkdays("2026-10-26", "2026-10-30")).toBe(4);
    expect(lengthInWorkdays("2026-10-10", "2026-10-11")).toBe(1); // víkend → alespoň 1
    expect(toWorkday("2026-10-10")).toBe("2026-10-12");
    expect(endAfter("2026-10-09", 3)).toBe("2026-10-13"); // pá, po, út
    expect(endAfter("2026-10-27", 2)).toBe("2026-10-29"); // přes svátek
    expect(endAfter("2026-10-12", 1)).toBe("2026-10-12");
  });

  it("návaznost: následník začne první pracovní den po předchůdci a zachová délku; předchůdce se nehýbe", () => {
    const phases = [
      phase("a", "2026-10-05", "2026-10-09"),
      phase("b", "2026-10-07", "2026-10-09", { dependsOnId: "a" }), // 3 pracovní dny
      phase("c", "2026-10-12", "2026-10-13", { dependsOnId: "b" }),
    ];
    const moved = shiftDependents(phases, "a");
    const byId = Object.fromEntries(moved.map((p) => [p.id, p]));
    expect(byId.b).toMatchObject({ startDate: "2026-10-12", endDate: "2026-10-14" });
    // c začínal před novým koncem b → také se posune, 2 dny
    expect(byId.c).toMatchObject({ startDate: "2026-10-15", endDate: "2026-10-16" });
    expect(moved.find((p) => p.id === "a")).toBeUndefined();
  });

  it("následník, který už začíná po předchůdci, se neposouvá; milník zůstane jednodenní", () => {
    const phases = [
      phase("a", "2026-10-05", "2026-10-06"),
      phase("b", "2026-10-12", "2026-10-14", { dependsOnId: "a" }),
      phase("m", "2026-10-05", "2026-10-05", { dependsOnId: "a", milestone: true }),
    ];
    const moved = shiftDependents(phases, "a");
    expect(moved.map((p) => p.id)).toEqual(["m"]);
    expect(moved[0]).toMatchObject({ startDate: "2026-10-07", endDate: "2026-10-07" });
  });

  it("kruh v návaznostech se pozná", () => {
    const phases = [
      { id: "a", dependsOnId: null },
      { id: "b", dependsOnId: "a" },
      { id: "c", dependsOnId: "b" },
    ];
    expect(wouldCycle(phases, "a", "c")).toBe(true);
    expect(wouldCycle(phases, "a", "a")).toBe(true);
    expect(wouldCycle(phases, "c", "a")).toBe(false);
    expect(wouldCycle(phases, "b", null)).toBe(false);
    expect(wouldCycle(phases, null, "c")).toBe(false); // nová fáze
  });

  it("průběh zakázky je vážený délkou fází; stav plyne z průběhu", () => {
    const p = [
      phase("a", "2026-10-05", "2026-10-06", { progress: 100, status: "done" }), // 2 dny
      phase("b", "2026-10-07", "2026-10-09", { progress: 0 }), // 3 dny
    ];
    expect(jobProgress(p)).toBe(40);
    expect(jobProgress([])).toBe(0);
    expect([0, 1, 99, 100].map(statusFromProgress)).toEqual([
      "planned",
      "in_progress",
      "in_progress",
      "done",
    ]);
  });

  it("zpoždění: hotová pozdě, přeplánovaná, běžící po termínu; včas = 0", () => {
    const onTime = phase("a", "2026-10-05", "2026-10-09", { progress: 50, status: "in_progress" });
    expect(phaseDelay(onTime, "2026-10-08")).toBe(0);
    expect(phaseDelay(onTime, "2026-10-14")).toBe(3); // po 9. 10.: po, út, st
    const moved = phase("b", "2026-10-12", "2026-10-16", { baselineEnd: "2026-10-09" });
    expect(phaseDelay(moved, "2026-10-01")).toBe(5);
    const doneLate = phase("c", "2026-10-05", "2026-10-09", {
      status: "done",
      progress: 100,
      actualEnd: "2026-10-13",
    });
    expect(phaseDelay(doneLate, "2026-12-01")).toBe(2);
    const doneEarly = phase("d", "2026-10-05", "2026-10-09", {
      status: "done",
      progress: 100,
      actualEnd: "2026-10-08",
    });
    expect(phaseDelay(doneEarly, "2026-12-01")).toBe(0);
  });
});

describe("kontrola návazností a souhrn", () => {
  it("najde fázi, která začíná před koncem předchůdce, a navrhne posun jen pro začátek řetězu", () => {
    const phases = [
      phase("a", "2026-10-05", "2026-10-09"),
      phase("b", "2026-10-07", "2026-10-09", { dependsOnId: "a" }),
      phase("c", "2026-10-08", "2026-10-09", { dependsOnId: "b" }),
      phase("d", "2026-10-12", "2026-10-13", { dependsOnId: "a" }),
    ];
    expect(dependencyConflicts(phases).map((p) => p.id)).toEqual(["b", "c"]);
    expect(conflictFixes(phases)).toEqual([
      { id: "b", startDate: "2026-10-12", endDate: "2026-10-14" },
    ]);
  });

  it("hotová fáze ani fáze bez předchůdce nejsou konflikt", () => {
    const phases = [
      phase("a", "2026-10-05", "2026-10-09"),
      phase("b", "2026-10-07", "2026-10-09", { dependsOnId: "a", status: "done" }),
    ];
    expect(dependencyConflicts(phases)).toEqual([]);
  });

  it("souhrn spočítá zbývající dny, zpožděné fáze a nejbližší milník", () => {
    const phases = [
      { ...phase("a", "2026-10-05", "2026-10-07", { status: "done", progress: 100 }), delay: 0 },
      { ...phase("b", "2026-10-08", "2026-10-16", { progress: 20 }), delay: 2 },
      { ...phase("m", "2026-10-16", "2026-10-16", { milestone: true }), delay: 0 },
    ];
    const s = scheduleSummary(phases, "2026-10-08");
    expect(s.done).toBe(1);
    expect(s.late.map((p) => p.id)).toEqual(["b"]);
    expect(s.start).toBe("2026-10-05");
    expect(s.end).toBe("2026-10-16");
    expect(s.remaining).toBe(6);
    expect(s.overdue).toBe(0);
    expect(s.nextMilestone?.id).toBe("m");
  });
});
