import { describe, expect, it } from "vitest";
import {
  allOf,
  buildForecastColumns,
  currentMonth,
  dealAttentionKind,
  isMonthKey,
  monthLabel,
  monthSpan,
  ownerCondition,
  shiftMonth,
  sumColumns,
  windowRange,
  type ForecastDeal,
} from "./logic";

const deal = (id: string, extra: Partial<ForecastDeal> = {}): ForecastDeal => ({
  id,
  number: id,
  title: `Zakázka ${id}`,
  companyName: null,
  stageId: "s1",
  phase: "offer",
  closeDate: "2026-10-20",
  valueMinor: 100_000_00,
  weightedMinor: 50_000_00,
  probabilityPct: 50,
  managerId: null,
  managerName: null,
  rotting: false,
  won: false,
  stageEnteredAt: null,
  lastActivityAt: null,
  nextActivityAt: null,
  openActivities: 0,
  ...extra,
});

describe("měsíce", () => {
  it("posouvá přes přelom roku a zpět", () => {
    expect(shiftMonth("2026-11", 2)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(monthSpan("2026-11", 4)).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
  });

  it("rozpozná klíč měsíce", () => {
    expect(isMonthKey("2026-10")).toBe(true);
    expect(isMonthKey("2026-13")).toBe(false);
    expect(isMonthKey("2026-1")).toBe(false);
    expect(isMonthKey(undefined)).toBe(false);
  });

  it("okno dotazu sahá od prvního dne prvního po poslední den posledního měsíce", () => {
    expect(windowRange("2026-02", 2)).toEqual({ from: "2026-02-01", to: "2026-03-31" });
    expect(windowRange("2028-02", 1)).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });

  it("popisek je česky a aktuální měsíc se bere v pražském čase", () => {
    expect(monthLabel("2026-10")).toBe("říjen 2026");
    // 30. 9. 22:30 UTC je v Praze už 1. 10.
    expect(currentMonth(new Date("2026-09-30T22:30:00Z"))).toBe("2026-10");
    expect(currentMonth(new Date("2026-09-30T20:30:00Z"))).toBe("2026-09");
  });
});

describe("buildForecastColumns", () => {
  const opts = { from: "2026-10", months: 3, money: true };
  const cols = (deals: ForecastDeal[], o = opts) =>
    Object.fromEntries(buildForecastColumns(deals, o).map((c) => [c.key, c]));

  it("vrací sloupec dřívější, měsíce okna a sloupec bez data v tomto pořadí", () => {
    expect(buildForecastColumns([], opts).map((c) => c.key)).toEqual([
      "earlier",
      "2026-10",
      "2026-11",
      "2026-12",
      "none",
    ]);
  });

  it("řadí otevřené obchody podle předpokládaného uzavření do měsíců, dřívější a bez data zvlášť", () => {
    const c = cols([
      deal("a", { closeDate: "2026-10-31" }),
      deal("b", { closeDate: "2026-11-01" }),
      deal("c", { closeDate: "2026-09-15" }),
      deal("d", { closeDate: null }),
      deal("e", { closeDate: "2027-03-01" }), // za oknem: nezobrazí se nikde
    ]);
    expect(c["2026-10"]!.deals.map((d) => d.id)).toEqual(["a"]);
    expect(c["2026-11"]!.deals.map((d) => d.id)).toEqual(["b"]);
    expect(c.earlier!.deals.map((d) => d.id)).toEqual(["c"]);
    expect(c.none!.deals.map((d) => d.id)).toEqual(["d"]);
    const all = Object.values(c).flatMap((x) => x.deals.map((d) => d.id));
    expect(all).not.toContain("e");
  });

  it("sečte otevřené, vyhrané, celkem a váženou hodnotu za sloupec", () => {
    const c = cols([
      deal("o1", { closeDate: "2026-10-05", valueMinor: 200_000_00, weightedMinor: 100_000_00 }),
      deal("o2", { closeDate: "2026-10-06", valueMinor: 300_000_00, weightedMinor: 60_000_00 }),
      deal("w1", {
        phase: "execution",
        won: true,
        closeDate: "2026-10-02",
        valueMinor: 400_000_00,
        weightedMinor: 400_000_00,
      }),
    ])["2026-10"]!;
    expect(c.open).toEqual({ count: 2, valueMinor: 500_000_00, weightedMinor: 160_000_00 });
    expect(c.won).toEqual({ count: 1, valueMinor: 400_000_00, weightedMinor: 400_000_00 });
    // celkem: hodnota otevřených i vyhraných, vážená = vážená otevřených + vyhrané celé
    expect(c.total).toEqual({ count: 3, valueMinor: 900_000_00, weightedMinor: 560_000_00 });
  });

  it("vyhrané obchody padají jen do měsíců okna podle data výhry, nikdy do dřívějších ani bez data", () => {
    const c = cols([
      deal("w-old", { won: true, phase: "closed", closeDate: "2026-01-10" }),
      deal("w-none", { won: true, phase: "closed", closeDate: null }),
      deal("w-ok", { won: true, phase: "closed", closeDate: "2026-12-24" }),
    ]);
    expect(c.earlier!.total.count).toBe(0);
    expect(c.none!.total.count).toBe(0);
    expect(c["2026-12"]!.won.count).toBe(1);
  });

  it("otevřené jsou před vyhranými a v rámci stejného stavu podle data a hodnoty", () => {
    const c = cols([
      deal("w", { won: true, phase: "execution", closeDate: "2026-10-01" }),
      deal("b", { closeDate: "2026-10-10", valueMinor: 1 }),
      deal("a", { closeDate: "2026-10-10", valueMinor: 9 }),
      deal("c", { closeDate: "2026-10-03" }),
    ])["2026-10"]!;
    expect(c.deals.map((d) => d.id)).toEqual(["c", "a", "b", "w"]);
  });

  it("bez oprávnění k penězům jsou částky null a počítají se jen obchody", () => {
    const c = cols(
      [
        deal("a", { valueMinor: null, weightedMinor: null }),
        deal("b", { valueMinor: null, weightedMinor: null }),
      ],
      { ...opts, money: false },
    )["2026-10"]!;
    expect(c.open).toEqual({ count: 2, valueMinor: null, weightedMinor: null });
    expect(c.total).toEqual({ count: 2, valueMinor: null, weightedMinor: null });
  });

  it("omezí počet karet sloupce, ale součty zůstanou za všechny obchody", () => {
    const many = Array.from({ length: 5 }, (_, i) => deal(`d${i}`, { valueMinor: 10_00 }));
    const c = cols(many, { ...opts, maxCards: 3 } as typeof opts)["2026-10"]!;
    expect(c.deals).toHaveLength(3);
    expect(c.hidden).toBe(2);
    expect(c.total.count).toBe(5);
    expect(c.total.valueMinor).toBe(50_00);
  });

  it("součet sloupců sečte všechny viditelné sloupce", () => {
    const columns = buildForecastColumns(
      [deal("a"), deal("b", { closeDate: "2026-11-02" }), deal("c", { closeDate: null })],
      opts,
    );
    expect(sumColumns(columns)).toEqual({
      count: 3,
      valueMinor: 300_000_00,
      weightedMinor: 150_000_00,
    });
  });
});

describe("dealAttentionKind", () => {
  const base = { overdueActivities: 0, rotting: false, openActivities: 1, expectedCloseDate: null };
  it("dodrží prioritu a každý obchod je nejvýš v jedné skupině", () => {
    const today = "2026-10-13";
    expect(
      dealAttentionKind({ ...base, overdueActivities: 2, rotting: true, openActivities: 0 }, today),
    ).toBe("overdue_activity");
    expect(dealAttentionKind({ ...base, rotting: true, openActivities: 0 }, today)).toBe("rotting");
    expect(dealAttentionKind({ ...base, openActivities: 0 }, today)).toBe("no_activity");
    expect(dealAttentionKind({ ...base, expectedCloseDate: "2026-10-12" }, today)).toBe(
      "close_passed",
    );
    expect(dealAttentionKind({ ...base, expectedCloseDate: "2026-10-13" }, today)).toBeNull();
    expect(dealAttentionKind(base, today)).toBeNull();
  });
});

describe("filtr vlastníka", () => {
  it("všichni nefiltruje, já a konkrétní uživatel ano", () => {
    expect(ownerCondition("all")).toBeNull();
    expect(ownerCondition("me")).toEqual({ attr: "manager", op: "is_me" });
    expect(ownerCondition("u-1")).toEqual({ attr: "manager", op: "is", value: "u-1" });
    expect(allOf(null, undefined)).toBeUndefined();
    expect(allOf(ownerCondition("me"))).toEqual({
      op: "and",
      conditions: [{ attr: "manager", op: "is_me" }],
    });
  });
});
