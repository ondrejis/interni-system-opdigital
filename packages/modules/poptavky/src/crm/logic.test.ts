import { describe, expect, it } from "vitest";
import {
  activityState,
  clampPct,
  columnSummary,
  daysInStage,
  daysSince,
  effectiveProbabilityPct,
  isLostDeal,
  isOpenDeal,
  isRotting,
  isWonDeal,
  pragueDay,
  weightedValueMinor,
} from "./logic";

// 13. 10. 2026 je pražské letní období (UTC+2): 12:00 místního času = 10:00 UTC
const NOW = new Date("2026-10-13T10:00:00Z");

describe("vážená hodnota", () => {
  it("násobí hodnotu pravděpodobností a zaokrouhlí na haléř", () => {
    expect(weightedValueMinor(1_000_000, 50)).toBe(500_000);
    expect(weightedValueMinor(1_000_001, 50)).toBe(500_001);
    expect(weightedValueMinor(333, 33)).toBe(110);
    expect(weightedValueMinor(1_000_000, 0)).toBe(0);
    expect(weightedValueMinor(1_000_000, 100)).toBe(1_000_000);
  });

  it("pravděpodobnost mimo 0–100 se ořízne, nečíselná hodnota dává nulu", () => {
    expect(weightedValueMinor(1000, 150)).toBe(1000);
    expect(weightedValueMinor(1000, -5)).toBe(0);
    expect(weightedValueMinor(1000, Number.NaN)).toBe(0);
    expect(weightedValueMinor(Number.NaN, 50)).toBe(0);
    expect(clampPct(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("platná pravděpodobnost", () => {
  it("ruční přepsání na zakázce má přednost, i nulové", () => {
    expect(
      effectiveProbabilityPct({ phase: "offer", crmProbabilityPct: 90 }, { probabilityPct: 50 }),
    ).toBe(90);
    expect(
      effectiveProbabilityPct({ phase: "offer", crmProbabilityPct: 0 }, { probabilityPct: 50 }),
    ).toBe(0);
  });

  it("jinak platí pravděpodobnost stavu", () => {
    expect(
      effectiveProbabilityPct({ phase: "offer", crmProbabilityPct: null }, { probabilityPct: 65 }),
    ).toBe(65);
    expect(effectiveProbabilityPct({ phase: "inquiry" }, { probabilityPct: 10 })).toBe(10);
  });

  it("stav bez pravděpodobnosti: otevřený obchod 0, vyhraný 100, prohraný vždy 0", () => {
    expect(effectiveProbabilityPct({ phase: "inquiry" }, { probabilityPct: null })).toBe(0);
    expect(effectiveProbabilityPct({ phase: "offer" }, null)).toBe(0);
    expect(effectiveProbabilityPct({ phase: "preparation" }, { probabilityPct: null })).toBe(100);
    expect(effectiveProbabilityPct({ phase: "execution" }, undefined)).toBe(100);
    expect(effectiveProbabilityPct({ phase: "lost" }, { probabilityPct: 80 })).toBe(0);
  });

  it("rozlišuje otevřený, vyhraný a prohraný obchod podle fáze", () => {
    expect(isOpenDeal("inquiry") && isOpenDeal("offer")).toBe(true);
    expect(isOpenDeal("preparation")).toBe(false);
    expect(isWonDeal("closed") && isWonDeal("preparation")).toBe(true);
    expect(isWonDeal("paused") || isWonDeal("lost")).toBe(false);
    expect(isLostDeal("lost")).toBe(true);
  });
});

describe("stav další aktivity", () => {
  it("bez otevřených aktivit nebo bez termínu nic", () => {
    expect(activityState(null, 0, NOW)).toBe("none");
    expect(activityState("2026-10-14T08:00:00Z", 0, NOW)).toBe("none");
    expect(activityState(null, 3, NOW)).toBe("none");
    expect(activityState(undefined, 1, NOW)).toBe("none");
    expect(activityState("nesmysl", 1, NOW)).toBe("none");
  });

  it("včerejší nebo starší aktivita je po termínu, zítřejší v budoucnu", () => {
    expect(activityState("2026-10-12T20:00:00Z", 1, NOW)).toBe("overdue");
    expect(activityState(new Date("2026-09-01T08:00:00Z"), 2, NOW)).toBe("overdue");
    expect(activityState("2026-10-14T08:00:00Z", 1, NOW)).toBe("future");
    expect(activityState(new Date("2026-12-01T08:00:00Z"), 1, NOW)).toBe("future");
  });

  it("dnešní aktivita je dnes, dokud nepřejde její čas; potom je po termínu", () => {
    expect(activityState("2026-10-13T15:00:00Z", 1, NOW)).toBe("today");
    expect(activityState("2026-10-13T07:00:00Z", 1, NOW)).toBe("overdue");
  });

  it("aktivita na celý den (půlnoc pražského času) je dnes po celý den", () => {
    // půlnoc 13. 10. v Praze = 12. 10. 22:00 UTC
    expect(activityState("2026-10-12T22:00:00Z", 1, NOW)).toBe("today");
    expect(activityState("2026-10-12T22:00:00Z", 1, new Date("2026-10-13T20:30:00Z"))).toBe(
      "today",
    );
  });

  it("den se určuje v pražském čase, ne v UTC", () => {
    // 23:30 UTC 12. 10. je v Praze už 13. 10. 01:30: dnes (a už po termínu v 10:00 UTC)
    expect(pragueDay("2026-10-12T23:30:00Z")).toBe("2026-10-13");
    expect(activityState("2026-10-12T23:30:00Z", 1, NOW)).toBe("overdue");
    // pozdě večer 13. 10. místního času (22:30 UTC = 00:30 14. 10.) je už zítra
    expect(activityState("2026-10-13T22:30:00Z", 1, NOW)).toBe("future");
  });

  it("přes přechod na zimní čas zůstává půlnoc půlnocí", () => {
    // 26. 10. 2026 platí už zimní čas (UTC+1): půlnoc je 25. 10. 23:00 UTC
    const monday = new Date("2026-10-26T11:00:00Z");
    expect(activityState("2026-10-25T23:00:00Z", 1, monday)).toBe("today");
  });
});

describe("dny ve stavu", () => {
  it("počítá kalendářní dny v pražském čase", () => {
    expect(daysInStage("2026-10-13T05:00:00Z", NOW)).toBe(0);
    expect(daysInStage("2026-10-10T05:00:00Z", NOW)).toBe(3);
    // 12. 10. 22:30 UTC je v Praze už 13. 10.: nula dní
    expect(daysSince("2026-10-12T22:30:00Z", NOW)).toBe(0);
  });

  it("chybějící nebo budoucí datum je nula", () => {
    expect(daysInStage(null, NOW)).toBe(0);
    expect(daysInStage(undefined, NOW)).toBe(0);
    expect(daysInStage("2026-11-01T00:00:00Z", NOW)).toBe(0);
    expect(daysInStage("nesmysl", NOW)).toBe(0);
  });
});

describe("hnití", () => {
  const base = { rottingDays: 5 };

  it("stav bez limitu nehnije", () => {
    expect(isRotting({ stageEnteredAt: "2020-01-01T00:00:00Z", rottingDays: null }, NOW)).toBe(
      false,
    );
    expect(isRotting({ stageEnteredAt: "2020-01-01T00:00:00Z", rottingDays: 0 }, NOW)).toBe(false);
    expect(isRotting({ stageEnteredAt: "2020-01-01T00:00:00Z" }, NOW)).toBe(false);
  });

  it("bez jediného údaje o čase nehnije", () => {
    expect(isRotting({ ...base }, NOW)).toBe(false);
    expect(isRotting({ ...base, stageEnteredAt: null, lastActivityAt: null }, NOW)).toBe(false);
  });

  it("hnije od okamžiku, kdy od posledního pohybu uplyne limit dnů", () => {
    expect(isRotting({ ...base, stageEnteredAt: "2026-10-09T08:00:00Z" }, NOW)).toBe(false); // 4 dny
    expect(isRotting({ ...base, stageEnteredAt: "2026-10-08T08:00:00Z" }, NOW)).toBe(true); // 5 dní
    expect(isRotting({ ...base, stageEnteredAt: "2026-09-01T08:00:00Z" }, NOW)).toBe(true);
  });

  it("poslední aktivita hnití odloží, starší aktivita než vstup do stavu ne", () => {
    const entered = "2026-10-01T08:00:00Z";
    expect(isRotting({ ...base, stageEnteredAt: entered }, NOW)).toBe(true);
    expect(
      isRotting({ ...base, stageEnteredAt: entered, lastActivityAt: "2026-10-12T09:00:00Z" }, NOW),
    ).toBe(false);
    expect(
      isRotting({ ...base, stageEnteredAt: entered, lastActivityAt: "2026-09-20T09:00:00Z" }, NOW),
    ).toBe(true);
    expect(isRotting({ ...base, lastActivityAt: "2026-10-12T09:00:00Z" }, NOW)).toBe(false);
  });
});

describe("souhrn sloupce", () => {
  it("sečte počet, hodnoty i vážené hodnoty (každá zakázka zaokrouhlená zvlášť)", () => {
    expect(
      columnSummary([
        { valueMinor: 1_000_000, probabilityPct: 50 },
        { valueMinor: 333, probabilityPct: 33 },
        { valueMinor: 200_000, probabilityPct: 0 },
      ]),
    ).toEqual({ count: 3, totalMinor: 1_200_333, weightedMinor: 500_110 });
  });

  it("prázdný sloupec má samé nuly; nečíselné hodnoty se ignorují", () => {
    expect(columnSummary([])).toEqual({ count: 0, totalMinor: 0, weightedMinor: 0 });
    expect(columnSummary([{ valueMinor: Number.NaN, probabilityPct: 50 }])).toEqual({
      count: 1,
      totalMinor: 0,
      weightedMinor: 0,
    });
  });
});
