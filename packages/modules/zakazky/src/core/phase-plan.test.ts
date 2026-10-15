import { describe, expect, it } from "vitest";
import {
  firstOpenPhase,
  isLastPhase,
  planPhaseChange,
  planPhaseComplete,
  type PhaseLite,
} from "./phase-plan";

const P = (
  n: number,
  status: PhaseLite["status"] = "not_started",
  role: PhaseLite["role"] = null,
): PhaseLite => ({
  id: `p${n}`,
  position: n,
  status,
  role,
});

// záměrně promíchané pořadí v poli: řadí se podle `position`
const phases = (list: PhaseLite[]) => [...list].reverse();

describe("pořadí fází při kliku na pás (R-38)", () => {
  it("dopředu: dřívější nehotové fáze se dokončí, cílová je aktuální", () => {
    const plan = planPhaseChange(phases([P(0, "in_progress"), P(1), P(2), P(3)]), "p2")!;
    expect(plan.completing.map((p) => p.id)).toEqual(["p0", "p1"]);
    expect(plan.reopening).toEqual([]);
    expect(plan.target.id).toBe("p2");
  });

  it("hotové a přeskočené fáze se znovu nedokončují", () => {
    const plan = planPhaseChange([P(0, "done"), P(1, "skipped"), P(2, "in_progress"), P(3)], "p3")!;
    expect(plan.completing.map((p) => p.id)).toEqual(["p2"]);
  });

  it("zpět: pozdější hotové a rozpracované fáze se vrátí do Nezahájená, přeskočené zůstanou", () => {
    const plan = planPhaseChange(
      [P(0, "done"), P(1, "done"), P(2, "in_progress"), P(3, "skipped"), P(4, "not_started")],
      "p1",
    )!;
    expect(plan.completing).toEqual([]);
    expect(plan.reopening.map((p) => p.id)).toEqual(["p2"]);
  });

  it("zpět přes hotové: pozdější hotové se vrátí a cílová hotová fáze zůstane k otevření", () => {
    const plan = planPhaseChange([P(0, "done"), P(1, "done"), P(2, "done")], "p0")!;
    expect(plan.reopening.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(plan.completing).toEqual([]);
    expect(plan.target.status).toBe("done");
  });

  it("neznámá fáze = null", () => {
    expect(planPhaseChange([P(0)], "nope")).toBeNull();
    expect(planPhaseComplete([P(0)], "nope")).toBeNull();
  });
});

describe("dokončení fáze", () => {
  it("dokončí cílovou i dřívější nehotové a další nehotová se stane aktuální", () => {
    const plan = planPhaseComplete(
      phases([P(0, "done"), P(1, "in_progress"), P(2), P(3), P(4)]),
      "p2",
    )!;
    expect(plan.completing.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(plan.next?.id).toBe("p3");
  });

  it("přeskočená fáze za cílovou se přeskočí i jako další", () => {
    const plan = planPhaseComplete([P(0, "in_progress"), P(1, "skipped"), P(2)], "p0")!;
    expect(plan.next?.id).toBe("p2");
  });

  it("poslední fáze: žádná další", () => {
    const plan = planPhaseComplete([P(0, "done"), P(1, "in_progress")], "p1")!;
    expect(plan.completing.map((p) => p.id)).toEqual(["p1"]);
    expect(plan.next).toBeNull();
  });
});

describe("pomocné funkce", () => {
  it("isLastPhase ignoruje přeskočené fáze za ní", () => {
    const list = [P(0), P(1), P(2, "skipped")];
    expect(isLastPhase(list, "p1")).toBe(true);
    expect(isLastPhase(list, "p0")).toBe(false);
    expect(isLastPhase(list, "nope")).toBe(false);
  });

  it("firstOpenPhase vrátí první nehotovou a nepřeskočenou", () => {
    expect(firstOpenPhase([P(0, "done"), P(1, "skipped"), P(2), P(3)])?.id).toBe("p2");
    expect(firstOpenPhase([P(0, "done")])).toBeNull();
    expect(firstOpenPhase([])).toBeNull();
  });
});
