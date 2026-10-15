import { describe, expect, it } from "vitest";
import { buildWeekGrid, dayLimitError, planCellSave, type CellEntry, type GridEntry } from "./grid";

const DAYS = [
  "2026-10-12",
  "2026-10-13",
  "2026-10-14",
  "2026-10-15",
  "2026-10-16",
  "2026-10-17",
  "2026-10-18",
];
const e = (p: Partial<GridEntry> & Pick<GridEntry, "jobId" | "date" | "minutes">): GridEntry => ({
  id: `e-${Math.random()}`,
  taskId: null,
  note: null,
  ...p,
});

describe("buildWeekGrid", () => {
  it("prázdný týden: žádné řádky, nulové součty ve všech dnech", () => {
    const g = buildWeekGrid(DAYS, []);
    expect(g.rows).toEqual([]);
    expect(g.totalMinutes).toBe(0);
    expect(Object.keys(g.dayTotals)).toEqual(DAYS);
    expect(Object.values(g.dayTotals).every((v) => v === 0)).toBe(true);
  });

  it("řádek na zakázku, buňky na den, součty řádků, dnů a celkem", () => {
    const g = buildWeekGrid(DAYS, [
      e({ jobId: "A", date: "2026-10-12", minutes: 90 }),
      e({ jobId: "A", date: "2026-10-12", minutes: 30, taskId: "T1" }),
      e({ jobId: "A", date: "2026-10-14", minutes: 60 }),
      e({ jobId: "B", date: "2026-10-12", minutes: 120 }),
    ]);
    expect(g.rows.map((r) => r.jobId)).toEqual(["A", "B"]);
    const a = g.rows[0]!;
    expect(a.cells["2026-10-12"]).toEqual({ gridMinutes: 90, taskMinutes: 30, gridEntries: 1 });
    expect(a.cells["2026-10-13"]).toEqual({ gridMinutes: 0, taskMinutes: 0, gridEntries: 0 });
    expect(a.totalMinutes).toBe(180);
    expect(g.rows[1]!.totalMinutes).toBe(120);
    expect(g.dayTotals["2026-10-12"]).toBe(240);
    expect(g.dayTotals["2026-10-14"]).toBe(60);
    expect(g.totalMinutes).toBe(300);
  });

  it("víc záznamů bez úkolu v jedné buňce se sečte a spočítá", () => {
    const g = buildWeekGrid(DAYS, [
      e({ jobId: "A", date: "2026-10-13", minutes: 30 }),
      e({ jobId: "A", date: "2026-10-13", minutes: 45 }),
    ]);
    expect(g.rows[0]!.cells["2026-10-13"]).toEqual({
      gridMinutes: 75,
      taskMinutes: 0,
      gridEntries: 2,
    });
  });

  it("záznam mimo týden se ignoruje", () => {
    const g = buildWeekGrid(DAYS, [e({ jobId: "A", date: "2026-10-19", minutes: 60 })]);
    expect(g.rows).toEqual([]);
    expect(g.totalMinutes).toBe(0);
  });
});

const c = (id: string, minutes: number, note: string | null, createdAt: string): CellEntry => ({
  id,
  minutes,
  note,
  createdAt,
});

describe("planCellSave", () => {
  it("prázdná buňka: 0 nedělá nic, jiný čas založí záznam", () => {
    expect(planCellSave([], 0)).toEqual({ kind: "noop" });
    expect(planCellSave([], 90)).toEqual({ kind: "insert", minutes: 90 });
  });

  it("0 smaže všechny záznamy buňky", () => {
    const plan = planCellSave([c("a", 60, null, "1"), c("b", 30, null, "2")], 0);
    expect(plan).toEqual({ kind: "delete", deleteIds: ["a", "b"] });
  });

  it("stejná hodnota u jediného záznamu = beze změny", () => {
    expect(planCellSave([c("a", 60, "x", "1")], 60)).toEqual({ kind: "noop" });
  });

  it("jiná hodnota přepíše záznam a zachová poznámku", () => {
    expect(planCellSave([c("a", 60, "web", "1")], 90)).toEqual({
      kind: "update",
      id: "a",
      minutes: 90,
      note: "web",
      deleteIds: [],
    });
  });

  it("víc záznamů se sloučí do nejstaršího, poznámky se spojí bez duplicit", () => {
    const plan = planCellSave(
      [c("b", 30, "schůzka", "2"), c("a", 60, "web", "1"), c("c", 15, "web", "3")],
      120,
    );
    expect(plan).toEqual({
      kind: "update",
      id: "a",
      minutes: 120,
      note: "web; schůzka",
      deleteIds: ["b", "c"],
    });
  });

  it("sloučení i při stejném součtu (víc záznamů se vždy sloučí)", () => {
    const plan = planCellSave([c("a", 60, null, "1"), c("b", 30, null, "2")], 90);
    expect(plan).toMatchObject({
      kind: "update",
      id: "a",
      minutes: 90,
      note: null,
      deleteIds: ["b"],
    });
  });

  it("spojená poznámka se ořízne na limit", () => {
    const long = "x".repeat(400);
    const plan = planCellSave([c("a", 10, long, "1"), c("b", 10, "y".repeat(400), "2")], 30);
    expect(plan.kind).toBe("update");
    if (plan.kind === "update") expect(plan.note!.length).toBe(500);
  });
});

describe("dayLimitError", () => {
  it("do 24 hodin je v pořádku", () => {
    expect(dayLimitError(0, 1440)).toBeNull();
    expect(dayLimitError(1000, 440)).toBeNull();
  });

  it("nad 24 hodin vrací chybu s tím, kolik zbývá", () => {
    expect(dayLimitError(1000, 441)).toMatch(/zbývá 7:20/);
    expect(dayLimitError(1440, 1)).toMatch(/zbývá 0:00/);
  });
});
