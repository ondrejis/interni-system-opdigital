import { describe, expect, it } from "vitest";
import {
  longDays,
  segmentPlace,
  segmentWeight,
  shortDays,
  stepFocusTarget,
  stepLabel,
  stepStates,
  stepTitle,
  type PipelineStage,
} from "./pipeline-stepper-logic";

const stages: PipelineStage[] = [
  { id: "new", name: "Nová poptávka", daysInStage: 2 },
  { id: "contacted", name: "Kontaktováno", daysInStage: 4 },
  { id: "offer", name: "Nabídka odeslána" },
];

describe("stepStates", () => {
  it("fáze před aktuální jsou hotové, za ní budoucí", () => {
    expect(stepStates(stages, "contacted")).toEqual(["done", "current", "future"]);
    expect(stepStates(stages, "new")).toEqual(["current", "future", "future"]);
    expect(stepStates(stages, "offer")).toEqual(["done", "done", "current"]);
  });

  it("záznam bez fáze nebo s neznámou fází nemá nic hotové", () => {
    expect(stepStates(stages, null)).toEqual(["future", "future", "future"]);
    expect(stepStates(stages, "neexistuje")).toEqual(["future", "future", "future"]);
    expect(stepStates([], "x")).toEqual([]);
  });
});

describe("dny ve fázi", () => {
  it("zkrácený zápis zahodí neplatné hodnoty", () => {
    expect(shortDays(5)).toBe("5 d");
    expect(shortDays(0)).toBe("0 d");
    expect(shortDays(3.9)).toBe("3 d");
    expect(shortDays(null)).toBeNull();
    expect(shortDays(undefined)).toBeNull();
    expect(shortDays(-1)).toBeNull();
    expect(shortDays(Number.NaN)).toBeNull();
  });

  it("česká čísla: 0 dní, 1 den, 2–4 dny, 5+ dní", () => {
    expect(longDays(0)).toBe("0 dní");
    expect(longDays(1)).toBe("1 den");
    expect(longDays(2)).toBe("2 dny");
    expect(longDays(4)).toBe("4 dny");
    expect(longDays(5)).toBe("5 dní");
    expect(longDays(21)).toBe("21 dní");
  });
});

describe("stepLabel", () => {
  it("popíše stav, dny a zámek pro čtečky", () => {
    expect(stepLabel(stages[1]!, "current")).toBe("Kontaktováno, aktuální fáze, ve fázi 4 dny");
    expect(stepLabel(stages[0]!, "done")).toBe("Nová poptávka, hotovo, ve fázi 2 dny");
    expect(stepLabel(stages[2]!, "future", "Chybí cena")).toBe(
      "Nabídka odeslána, zamčeno: Chybí cena",
    );
  });

  it("dny budoucí fáze se nehlásí", () => {
    expect(stepLabel({ id: "x", name: "X", daysInStage: 3 }, "future")).toBe("X");
  });
});

describe("stepFocusTarget", () => {
  it("šipky se u kraje zastaví", () => {
    expect(stepFocusTarget(3, 0, -1)).toBe(0);
    expect(stepFocusTarget(3, 0, 1)).toBe(1);
    expect(stepFocusTarget(3, 2, 1)).toBe(2);
    expect(stepFocusTarget(0, 0, 1)).toBe(-1);
  });
});

describe("segmentPlace", () => {
  it("první a poslední segment mají zaoblený vnější okraj, vnitřní jsou chevrony", () => {
    expect([0, 1, 2, 3].map((i) => segmentPlace(i, 4))).toEqual([
      "first",
      "middle",
      "middle",
      "last",
    ]);
    expect(segmentPlace(0, 2)).toBe("first");
    expect(segmentPlace(1, 2)).toBe("last");
  });

  it("jediný segment je celý zaoblený a prázdný pás nepadá", () => {
    expect(segmentPlace(0, 1)).toBe("single");
    expect(segmentPlace(0, 0)).toBe("single");
  });
});

describe("stepTitle", () => {
  it("název s dny u hotové a aktuální fáze, budoucí jen název", () => {
    expect(stepTitle(stages[1]!, "current")).toBe("Kontaktováno · 4 dny");
    expect(stepTitle(stages[0]!, "done")).toBe("Nová poptávka · 2 dny");
    expect(stepTitle({ id: "x", name: "X", daysInStage: 3 }, "future")).toBe("X");
    expect(stepTitle(stages[2]!, "done")).toBe("Nabídka odeslána");
  });
});

describe("segmentWeight", () => {
  it("delší název dostane víc místa, ale v omezeném rozpětí", () => {
    expect(segmentWeight("Jednání")).toBe(13);
    expect(segmentWeight("Nabídka v přípravě")).toBe(24);
    expect(segmentWeight("")).toBe(12);
    expect(segmentWeight("Velmi dlouhý název fáze, který by jinak zabral půlku pásu")).toBe(28);
  });
});
