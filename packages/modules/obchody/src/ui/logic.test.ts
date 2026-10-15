import { describe, expect, it } from "vitest";
import type { StageDescriptor } from "@rebar/core/shared";
import {
  boardFilters,
  columnTotals,
  highlightOfRow,
  ownerFromQuery,
  pluralDeals,
  stageDays,
  stripMode,
  viewFromQuery,
} from "./logic";

const stage = (rottingDays: number | null): StageDescriptor => ({
  id: "s1",
  name: "Kontaktováno",
  color: "blue",
  kind: "open",
  probabilityPct: 20,
  rottingDays,
});

describe("logika UI obchodů", () => {
  it("zobrazení a vlastník z adresy", () => {
    expect(viewFromQuery("seznam")).toBe("seznam");
    expect(viewFromQuery("nic")).toBe("board");
    expect(ownerFromQuery(undefined)).toBe("all");
    expect(ownerFromQuery("me")).toBe("me");
  });

  it("filtr boardu: jen otevřené a případně vlastník", () => {
    expect(boardFilters("all").conditions).toHaveLength(1);
    const mine = boardFilters("me").conditions;
    expect(mine).toHaveLength(2);
    expect(mine[1]).toMatchObject({ attr: "owner", op: "is_me" });
    expect(boardFilters("u1").conditions[1]).toMatchObject({ op: "is", value: "u1" });
  });

  it("souhrn sloupce z agregací", () => {
    expect(columnTotals(3, { value: 100, weighted: 40 })).toEqual({
      count: 3,
      totalMinor: 100,
      weightedMinor: 40,
    });
    expect(columnTotals(3, undefined)).toBeNull();
  });

  it("zvýraznění: bez aktivity, hnití a neotevřený lead", () => {
    const now = new Date("2026-10-15T10:00:00+02:00");
    const base = {
      status: "s1",
      result: "open",
      stageEnteredAt: "2026-10-01T08:00:00+02:00",
      nextActivityAt: null,
      lastActivityAt: null,
      source: "meta",
      firstOpenedAt: null,
    };
    const h = highlightOfRow(base as never, [stage(5)], now);
    expect(h.noNextActivity).toBe(true);
    expect(h.rotting).toBe(true);
    expect(h.unopenedLead).toBe(true);
    const calm = highlightOfRow(
      { ...base, source: "manual", nextActivityAt: "2026-10-20T10:00:00+02:00" } as never,
      [stage(30)],
      now,
    );
    expect(calm.noNextActivity).toBe(false);
    expect(calm.rotting).toBe(false);
    expect(calm.unopenedLead).toBe(false);
  });

  it("češtiny, režim pásu a dny ve fázích", () => {
    expect([1, 3, 7].map(pluralDeals)).toEqual(["obchod", "obchody", "obchodů"]);
    expect(stripMode("won")).toBe("won");
    expect(stripMode("open")).toBe("open");
    expect(stageDays([{ toStageId: "a", days: 2 }, { toStageId: "a", days: 3 }])).toEqual({ a: 5 });
  });
});
