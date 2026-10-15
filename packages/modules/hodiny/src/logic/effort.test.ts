import { describe, expect, it } from "vitest";
import { computeJobEffort, hourlyRate } from "./effort";

describe("hourlyRate", () => {
  it("příjem ÷ hodiny, zaokrouhleno na haléř", () => {
    expect(hourlyRate(1_000_000, 600)).toBe(100_000); // 10 000 Kč za 10 h = 1 000 Kč/h
    expect(hourlyRate(700_000, 90)).toBe(466_667); // 7 000 Kč za 1,5 h
  });

  it("bez hodin nejde sazbu spočítat", () => {
    expect(hourlyRate(500_000, 0)).toBeNull();
  });
});

describe("computeJobEffort: odpracováno vs. odhad", () => {
  it("v odhadu: zbývá, nic nepřečerpáno", () => {
    const r = computeJobEffort({
      hours: [{ userId: "o", minutes: 180 }],
      estimateMin: 300,
      incomeByUser: null,
    });
    expect(r).toMatchObject({
      workedMinutes: 180,
      estimateMin: 300,
      remainingMinutes: 120,
      overrunMinutes: 0,
      progressPct: 60,
    });
  });

  it("přečerpáno: překročení v minutách a procento nad 100", () => {
    const r = computeJobEffort({
      hours: [
        { userId: "o", minutes: 240 },
        { userId: "p", minutes: 120 },
      ],
      estimateMin: 300,
      incomeByUser: null,
    });
    expect(r).toMatchObject({
      workedMinutes: 360,
      remainingMinutes: 0,
      overrunMinutes: 60,
      progressPct: 120,
    });
  });

  it("bez odhadu (null i 0) není z čeho počítat zbytek", () => {
    for (const estimateMin of [null, 0]) {
      const r = computeJobEffort({
        hours: [{ userId: "o", minutes: 60 }],
        estimateMin,
        incomeByUser: null,
      });
      expect(r.estimateMin).toBeNull();
      expect(r.remainingMinutes).toBeNull();
      expect(r.overrunMinutes).toBeNull();
      expect(r.progressPct).toBeNull();
    }
  });

  it("žádné hodiny: nuly, podíly null", () => {
    const r = computeJobEffort({ hours: [], estimateMin: 120, incomeByUser: null });
    expect(r).toMatchObject({ workedMinutes: 0, remainingMinutes: 120, progressPct: 0, users: [] });
  });

  it("víc řádků téhož člověka se sečte", () => {
    const r = computeJobEffort({
      hours: [
        { userId: "o", minutes: 30 },
        { userId: "o", minutes: 45 },
      ],
      estimateMin: null,
      incomeByUser: null,
    });
    expect(r.users).toEqual([
      { userId: "o", minutes: 75, sharePct: 100, incomeMinor: null, rateMinor: null },
    ]);
  });
});

describe("computeJobEffort: efektivní sazba", () => {
  it("podíl na příjmech ÷ jeho hodiny, pro každého zvlášť", () => {
    // úvodní fáze 2 × 7 000 Kč dělená 50/50, Ondřej odpracoval 10 h, Patrik 20 h
    const r = computeJobEffort({
      hours: [
        { userId: "o", minutes: 600 },
        { userId: "p", minutes: 1200 },
      ],
      estimateMin: null,
      incomeByUser: { o: 700_000, p: 700_000 },
    });
    const o = r.users.find((u) => u.userId === "o")!;
    const p = r.users.find((u) => u.userId === "p")!;
    expect(o).toMatchObject({ incomeMinor: 700_000, rateMinor: 70_000 }); // 700 Kč/h
    expect(p).toMatchObject({ incomeMinor: 700_000, rateMinor: 35_000 }); // 350 Kč/h
    expect(r.totalIncomeMinor).toBe(1_400_000);
    expect(r.effectiveRateMinor).toBe(46_667); // 14 000 Kč / 30 h
    expect(o.sharePct).toBe(33.3);
    expect(p.sharePct).toBe(66.7);
  });

  it("kdo má příjem a žádné hodiny, má sazbu null; kdo má hodiny a žádný příjem, má sazbu 0", () => {
    const r = computeJobEffort({
      hours: [{ userId: "o", minutes: 120 }],
      estimateMin: null,
      incomeByUser: { p: 500_000 },
    });
    expect(r.users.find((u) => u.userId === "p")).toMatchObject({
      minutes: 0,
      sharePct: 0,
      incomeMinor: 500_000,
      rateMinor: null,
    });
    expect(r.users.find((u) => u.userId === "o")).toMatchObject({ incomeMinor: 0, rateMinor: 0 });
  });

  it("bez financí (null) jsou příjmy i sazby null", () => {
    const r = computeJobEffort({
      hours: [{ userId: "o", minutes: 60 }],
      estimateMin: null,
      incomeByUser: null,
    });
    expect(r.totalIncomeMinor).toBeNull();
    expect(r.effectiveRateMinor).toBeNull();
    expect(r.users[0]).toMatchObject({ incomeMinor: null, rateMinor: null });
  });

  it("pořadí: nejvíc hodin první, při shodě podle id", () => {
    const r = computeJobEffort({
      hours: [
        { userId: "b", minutes: 60 },
        { userId: "a", minutes: 60 },
        { userId: "c", minutes: 90 },
      ],
      estimateMin: null,
      incomeByUser: null,
    });
    expect(r.users.map((u) => u.userId)).toEqual(["c", "a", "b"]);
  });
});
