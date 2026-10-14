import { describe, expect, it } from "vitest";
import type { StageDescriptor } from "@rebar/core/shared";
import {
  boardFilters,
  boardStages,
  columnTotals,
  dealAge,
  ownerCondition,
  ownerFromQuery,
  pluralDeals,
  problemFields,
  stageDays,
  stripMode,
  viewFromQuery,
} from "./logic";

const stage = (name: string, phase: string | null): StageDescriptor => ({
  id: name,
  name,
  color: "gray",
  kind: "open",
  phase,
});

describe("stavy nástěnky", () => {
  it("nechá jen stavy fází Poptávka a Nabídka v původním pořadí", () => {
    const all = [
      stage("Nová poptávka", "inquiry"),
      stage("Obhlídka", "inquiry"),
      stage("Nabídka odeslána", "offer"),
      stage("Příprava", "preparation"),
      stage("Prohráno", "lost"),
      stage("Nová", null),
    ];
    expect(boardStages(all).map((s) => s.name)).toEqual([
      "Nová poptávka",
      "Obhlídka",
      "Nabídka odeslána",
    ]);
  });
});

describe("filtry nástěnky", () => {
  it("vždy omezí na obchodní fáze a vyřadí archivované", () => {
    const f = boardFilters("all");
    expect(f.op).toBe("and");
    expect(f.conditions).toEqual([
      { attr: "phase", op: "is_any_of", value: ["inquiry", "offer"] },
      { attr: "crmArchivedAt", op: "empty" },
    ]);
  });

  it("přidá vlastníka: já, nebo konkrétního uživatele", () => {
    expect(ownerCondition("all")).toBeNull();
    expect(ownerCondition("me")).toEqual({ attr: "manager", op: "is_me" });
    expect(ownerCondition("u1")).toEqual({ attr: "manager", op: "is", value: "u1" });
    expect(boardFilters("me").conditions).toHaveLength(3);
  });

  it("čte pohled a vlastníka z adresy a neznámé hodnoty srovná", () => {
    expect(viewFromQuery("prognoza")).toBe("prognoza");
    expect(viewFromQuery("nesmysl")).toBe("nastenka");
    expect(viewFromQuery(undefined)).toBe("nastenka");
    expect(ownerFromQuery("me")).toBe("me");
    expect(ownerFromQuery("")).toBe("all");
    expect(ownerFromQuery(" abc ")).toBe("abc");
  });
});

describe("pás fází", () => {
  it("sečte dny ve stavu, když se zakázka do stavu vrátila", () => {
    expect(
      stageDays([
        { stageId: "a", days: 2 },
        { stageId: "b", days: 3 },
        { stageId: "a", days: 4 },
      ]),
    ).toEqual({ a: 6, b: 3 });
    expect(stageDays([])).toEqual({});
  });

  it("pozná, jak se zakázka v pásu ukáže", () => {
    expect(stripMode("inquiry")).toBe("open");
    expect(stripMode("offer")).toBe("open");
    expect(stripMode("preparation")).toBe("won");
    expect(stripMode("closed")).toBe("won");
    expect(stripMode("lost")).toBe("lost");
    expect(stripMode("paused")).toBe("other");
  });
});

describe("věty kontroly přechodu", () => {
  it("přiřadí větu o adrese stavby k poli adresa", () => {
    expect(problemFields("Doplňte adresu stavby, než zakázku převedete do nabídky.")).toEqual({
      attr: "address",
      label: "Adresa stavby",
    });
  });

  it("přiřadí větu o zákazníkovi a ignoruje neznámé věty", () => {
    expect(
      problemFields("Do nabídky zakázku nepošlete bez zákazníka. Doplňte zákazníka.").attr,
    ).toBe("company");
    expect(problemFields("Nabídka není odeslaná.")).toEqual({ attr: null, label: null });
  });
});

describe("součty sloupce a stáří", () => {
  it("vezme součet a vážený součet ze serverových agregací", () => {
    expect(columnTotals(3, { value: 500_000, crmWeighted: 250_000 })).toEqual({
      count: 3,
      totalMinor: 500_000,
      weightedMinor: 250_000,
    });
  });

  it("bez práva na ekonomiku součty nejsou", () => {
    expect(columnTotals(3, {})).toBeNull();
    expect(columnTotals(3, undefined)).toBeNull();
  });

  it("spočítá stáří zakázky a neaktivní dny od posledního pohybu", () => {
    const now = new Date("2026-10-13T10:00:00+02:00");
    expect(
      dealAge(
        {
          createdAt: "2026-10-01T08:00:00+02:00",
          lastActivityAt: "2026-10-10T08:00:00+02:00",
          stageEnteredAt: "2026-10-05T08:00:00+02:00",
        },
        now,
      ),
    ).toEqual({ ageDays: 12, inactiveDays: 3 });
    expect(dealAge({}, now)).toEqual({ ageDays: 0, inactiveDays: 0 });
  });

  it("skloňuje počet zakázek", () => {
    expect([0, 1, 2, 4, 5, 21].map(pluralDeals)).toEqual([
      "zakázek",
      "zakázka",
      "zakázky",
      "zakázky",
      "zakázek",
      "zakázek",
    ]);
  });
});
