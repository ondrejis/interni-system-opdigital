import { describe, expect, it } from "vitest";
import {
  activityState,
  columnSummary,
  dealHighlight,
  daysSince,
  effectiveProbabilityPct,
  isRotting,
  isUnopenedLead,
  pragueNoon,
  storedWeightedMinor,
  weightedValueMinor,
} from "./logic";

// 2026-10-14 12:00 pražského času (letní čas skončil 25. 10.)
const NOW = new Date("2026-10-14T10:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe("vážená hodnota", () => {
  it("hodnota × pravděpodobnost, zaokrouhleno na haléř, pravděpodobnost mimo rozsah se ořízne", () => {
    expect(weightedValueMinor(50_000_00, 60)).toBe(30_000_00);
    expect(weightedValueMinor(333, 10)).toBe(33);
    expect(weightedValueMinor(1000, 150)).toBe(1000);
    expect(weightedValueMinor(1000, -5)).toBe(0);
    expect(weightedValueMinor(Number.NaN, 50)).toBe(0);
  });

  it("výsledek určuje pravděpodobnost: vyhráno 100 %, prohráno 0 %, otevřený podle fáze", () => {
    expect(effectiveProbabilityPct("won", 20)).toBe(100);
    expect(effectiveProbabilityPct("lost", 80)).toBe(0);
    expect(effectiveProbabilityPct("open", 40)).toBe(40);
    expect(effectiveProbabilityPct("open", null)).toBe(0);
    expect(storedWeightedMinor(null, "open", 40)).toBeNull();
    expect(storedWeightedMinor(10_000, "open", 40)).toBe(4_000);
    expect(storedWeightedMinor(10_000, "won", null)).toBe(10_000);
    expect(storedWeightedMinor(10_000, "lost", 80)).toBe(0);
  });
});

describe("souhrn sloupce", () => {
  it("počet, součet a vážený součet (každý obchod zaokrouhlený zvlášť); obchod bez hodnoty se jen počítá", () => {
    expect(
      columnSummary([
        { valueMinor: 100_00, probabilityPct: 40 },
        { valueMinor: 50_00, probabilityPct: 40 },
        { valueMinor: null, probabilityPct: 40 },
      ]),
    ).toEqual({ count: 3, totalMinor: 150_00, weightedMinor: 60_00 });
    expect(columnSummary([])).toEqual({ count: 0, totalMinor: 0, weightedMinor: 0 });
  });
});

describe("další aktivita", () => {
  it("bez termínu none, včera po termínu, zítra budoucí, dnes", () => {
    expect(activityState(null, NOW)).toBe("none");
    expect(activityState(daysAgo(1), NOW)).toBe("overdue");
    expect(activityState(new Date(NOW.getTime() + 86_400_000 * 2), NOW)).toBe("future");
    expect(activityState(new Date(NOW.getTime() + 3_600_000), NOW)).toBe("today");
    expect(activityState(new Date(NOW.getTime() - 3_600_000), NOW)).toBe("overdue");
  });

  it("aktivita na celý den (půlnoc pražského času) je dnes po celý den", () => {
    expect(activityState(new Date("2026-10-13T22:00:00Z"), NOW)).toBe("today");
  });
});

describe("hnití podle fáze", () => {
  it("hnije po uplynutí prahu fáze od pozdějšího z: vstup do fáze, poslední aktivita", () => {
    const base = { stageEnteredAt: daysAgo(6), lastActivityAt: null, rottingDays: 5 };
    expect(isRotting(base, NOW)).toBe(true);
    expect(isRotting({ ...base, rottingDays: 7 }, NOW)).toBe(false);
    expect(isRotting({ ...base, lastActivityAt: daysAgo(1) }, NOW)).toBe(false);
    expect(isRotting({ ...base, lastActivityAt: daysAgo(30) }, NOW)).toBe(true);
  });

  it("fáze bez prahu nehnije, bez časových údajů také ne", () => {
    expect(isRotting({ stageEnteredAt: daysAgo(99), rottingDays: null }, NOW)).toBe(false);
    expect(isRotting({ stageEnteredAt: daysAgo(99), rottingDays: 0 }, NOW)).toBe(false);
    expect(isRotting({ rottingDays: 5 }, NOW)).toBe(false);
  });

  it("dny se počítají v kalendářních dnech pražského času", () => {
    expect(daysSince(daysAgo(3), NOW)).toBe(3);
    expect(daysSince(new Date("2026-10-13T22:30:00Z"), NOW)).toBe(0); // 14. 10. 00:30 pražského času
    expect(daysSince(new Date(NOW.getTime() + 86_400_000), NOW)).toBe(0);
  });
});

describe("zvýraznění obchodu", () => {
  const open = {
    result: "open" as const,
    stageEnteredAt: daysAgo(2),
    nextActivityAt: null,
    lastActivityAt: null,
    rottingDays: 1,
  };

  it("otevřený obchod bez další aktivity má výstrahu a po prahu fáze je červený", () => {
    const h = dealHighlight(open, NOW);
    expect(h).toMatchObject({
      noNextActivity: true,
      rotting: true,
      activityState: "none",
      daysInStage: 2,
    });
  });

  it("naplánovaná aktivita výstrahu zruší, hnití zůstává podle prahu", () => {
    const h = dealHighlight(
      { ...open, nextActivityAt: new Date(NOW.getTime() + 86_400_000 * 2) },
      NOW,
    );
    expect(h).toMatchObject({ noNextActivity: false, activityState: "future", rotting: true });
    expect(dealHighlight({ ...open, rottingDays: 5 }, NOW).rotting).toBe(false);
  });

  it("zavřený obchod se nezvýrazňuje", () => {
    for (const result of ["won", "lost"] as const)
      expect(dealHighlight({ ...open, result }, NOW)).toMatchObject({
        noNextActivity: false,
        rotting: false,
        activityState: "none",
      });
  });

  it("nový Meta lead je neotevřený, dokud ho někdo neotevře", () => {
    expect(isUnopenedLead({ source: "meta", firstOpenedAt: null, result: "open" })).toBe(true);
    expect(isUnopenedLead({ source: "meta", firstOpenedAt: NOW, result: "open" })).toBe(false);
    expect(isUnopenedLead({ source: "manual", firstOpenedAt: null, result: "open" })).toBe(false);
    expect(isUnopenedLead({ source: "meta", firstOpenedAt: null, result: "lost" })).toBe(false);
    expect(dealHighlight({ ...open, source: "meta", firstOpenedAt: null }, NOW).unopenedLead).toBe(
      true,
    );
  });
});

describe("pragueNoon", () => {
  it("poledne pražského dne v letním i zimním čase", () => {
    expect(pragueNoon("2026-07-01").toISOString()).toBe("2026-07-01T10:00:00.000Z");
    expect(pragueNoon("2026-12-01").toISOString()).toBe("2026-12-01T11:00:00.000Z");
  });
});
