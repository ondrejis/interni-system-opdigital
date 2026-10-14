import { describe, expect, it } from "vitest";
import {
  FleetError,
  checkFuel,
  checkLog,
  consumption,
  deadlineState,
  deadlinesFor,
  formatMeter,
  intervalDue,
  intervalText,
  netOfVat,
  worstTone,
} from "./fleet";

const TODAY = "2026-06-15";
const norm = (s: string) => s.replace(/\s/g, " ");

describe("termíny", () => {
  it("rozliší po termínu, brzy a v pořádku a skloňuje dny", () => {
    expect(deadlineState(null, TODAY)).toMatchObject({ tone: "none", days: null });
    expect(deadlineState("2026-06-10", TODAY)).toMatchObject({
      tone: "overdue",
      days: -5,
      text: "prošlo před 5 dny",
    });
    expect(deadlineState("2026-06-14", TODAY).text).toBe("prošlo před 1 dnem");
    expect(deadlineState("2026-06-15", TODAY)).toMatchObject({ tone: "soon", text: "dnes" });
    expect(deadlineState("2026-06-16", TODAY).text).toBe("za 1 den");
    expect(deadlineState("2026-06-18", TODAY).text).toBe("za 3 dny");
    expect(deadlineState("2026-07-15", TODAY)).toMatchObject({ tone: "soon", days: 30 });
    expect(deadlineState("2026-07-16", TODAY)).toMatchObject({ tone: "ok", days: 31 });
  });

  it("hlídá termíny podle druhu: stroj žádné, přívěs bez známky", () => {
    expect(deadlinesFor("excavator")).toEqual([]);
    expect(deadlinesFor("van").map((d) => d.key)).toEqual([
      "stkDate",
      "insuranceDate",
      "vignetteDate",
    ]);
    expect(deadlinesFor("trailer").map((d) => d.key)).toEqual(["stkDate", "insuranceDate"]);
  });

  it("nejhorší tón", () => {
    expect(worstTone(["ok", "soon", "ok"])).toBe("soon");
    expect(worstTone(["ok", "overdue", "soon"])).toBe("overdue");
    expect(worstTone([])).toBe("none");
  });
});

describe("spotřeba", () => {
  const f = (id: string, liters: number, meterValue: number | null, fullTank = true) => ({
    id,
    liters,
    meterValue,
    fullTank,
  });

  it("počítá mezi plnými nádržemi a započítá i částečné doplnění", () => {
    const { perFuel, avg } = consumption(
      [f("a", 50, 1000), f("b", 40, 1500), f("c", 10, 1800, false), f("d", 25, 2000)],
      "km",
    );
    expect(perFuel.has("a")).toBe(false); // první plná nemá s čím srovnat
    expect(perFuel.get("b")).toBeCloseTo(8); // 40 l / 500 km
    expect(perFuel.get("d")).toBeCloseTo(7); // (10 + 25) l / 500 km
    expect(perFuel.has("c")).toBe(false);
    expect(avg).toBeCloseTo(7.5);
  });

  it("průměr je vážený ujetou vzdáleností, ne průměr jednotlivých spotřeb", () => {
    // úseky: 35 l / 500 km (7,0), 10 l / 100 km (10,0), 10 l / 100 km (10,0): celkem 55 l / 700 km = 7,857
    const { perFuel, avg } = consumption(
      [f("a", 40, 50200), f("b", 35, 50700), f("c", 10, 50800), f("d", 10, 50900)],
      "km",
    );
    expect(perFuel.get("b")).toBeCloseTo(7);
    expect(avg).toBeCloseTo((55 / 700) * 100);
    expect(avg).not.toBeCloseTo(9); // aritmetický průměr 7, 10, 10
    expect(consumption([f("a", 30, 100), f("b", 60, 120), f("c", 20, 160)], "mth").avg).toBeCloseTo(
      80 / 60,
    );
  });

  it("u strojů v l/mth, nezadaný tachometr se přeskočí, bez dvou plných nic", () => {
    expect(consumption([f("a", 30, 100), f("b", 60, 120)], "mth").perFuel.get("b")).toBe(3);
    expect(consumption([f("a", 30, null), f("b", 60, 120)], "km").avg).toBeNull();
    expect(consumption([f("a", 30, 100)], "km").avg).toBeNull();
  });
});

describe("servisní intervaly", () => {
  const iv = { everyMeter: 15000, everyMonths: 12, lastDate: "2026-01-10", lastMeter: 100000 };

  it("podle tachometru i data, co nastane dřív", () => {
    const ok = intervalDue(iv, 105000, TODAY);
    expect(ok).toMatchObject({ tone: "ok", meterLeft: 10000, dueDate: "2027-01-10" });
    expect(intervalDue(iv, 113600, TODAY).tone).toBe("soon"); // zbývá 1 400 ≤ 10 % z 15 000
    expect(intervalDue(iv, 115100, TODAY)).toMatchObject({ tone: "overdue", meterLeft: -100 });
    expect(intervalDue(iv, 101000, "2027-02-01").tone).toBe("overdue");
    expect(intervalDue(iv, 101000, "2026-12-20").tone).toBe("soon");
  });

  it("jen jedna veličina a bez posledního servisu", () => {
    expect(intervalDue({ ...iv, everyMeter: null }, 999999, TODAY).tone).toBe("ok");
    expect(intervalDue({ ...iv, everyMonths: null }, 105000, TODAY).dueDate).toBeNull();
    expect(
      intervalDue({ everyMeter: 1000, everyMonths: 6, lastDate: null, lastMeter: null }, 5, TODAY),
    ).toMatchObject({ tone: "ok", meterLeft: null, daysLeft: null });
  });

  it("text ukáže naléhavější údaj", () => {
    expect(norm(intervalText(intervalDue(iv, 105000, TODAY), "km"))).toBe("zbývá 10 000 km");
    expect(intervalText(intervalDue(iv, 115100, TODAY), "km")).toBe("překročeno o 100 km");
    expect(intervalText(intervalDue({ ...iv, everyMeter: null }, 0, "2027-01-20"), "km")).toBe(
      "po termínu 10 dní",
    );
    expect(intervalText({ meterLeft: null, daysLeft: null, dueDate: null, tone: "ok" }, "km")).toBe(
      "",
    );
  });
});

describe("zápis do knihy jízd", () => {
  const base = {
    meter: "km",
    date: "2026-06-10",
    today: TODAY,
    currentMeter: 50000,
    meterStart: null,
    meterEnd: null,
    amount: 120,
    private: false,
    purpose: "Rozvoz",
    jobId: null,
  };

  it("vzdálenost z tachometru má přednost před zadanou", () => {
    expect(checkLog({ ...base, meterStart: 49000, meterEnd: 49123.4, amount: 5 })).toBe(123.4);
    expect(checkLog(base)).toBe(120);
  });

  it("odmítne nesmysly", () => {
    expect(() => checkLog({ ...base, meterStart: 100, meterEnd: 100 })).toThrow(/vyšší/);
    expect(() => checkLog({ ...base, amount: null })).toThrow(/Zadejte/);
    expect(() => checkLog({ ...base, amount: 1501 })).toThrow(/1 500 km/);
    expect(() => checkLog({ ...base, meter: "mth", amount: 25 })).toThrow(/24 motohodin/);
    expect(() => checkLog({ ...base, purpose: null })).toThrow(/účel nebo zakázku/);
    expect(() => checkLog({ ...base, purpose: null, jobId: "j" })).not.toThrow();
    expect(() => checkLog({ ...base, purpose: null, private: true })).not.toThrow();
    expect(() => checkLog({ ...base, purpose: "x", amount: 0 })).toThrow(FleetError);
  });

  it("dnešní jízda nesmí začínat pod známým stavem, zpětný zápis ano", () => {
    expect(() => checkLog({ ...base, date: TODAY, meterStart: 49000, meterEnd: 49100 })).toThrow(
      /nižší než poslední/,
    );
    expect(() =>
      checkLog({ ...base, date: "2026-06-01", meterStart: 49000, meterEnd: 49100 }),
    ).not.toThrow();
  });
});

describe("tankování", () => {
  const ok = { fuel: "diesel", meter: "km", tankLiters: 80, liters: 60, meterValue: 51000 };
  it("kontroluje palivo, nádrž a tachometr", () => {
    expect(() => checkFuel(ok)).not.toThrow();
    expect(() => checkFuel({ ...ok, fuel: "electric" })).toThrow(/netankuje/);
    expect(() => checkFuel({ ...ok, liters: 89 })).toThrow(/Nádrž má 80/);
    expect(() => checkFuel({ ...ok, liters: 88 })).not.toThrow();
    expect(() => checkFuel({ ...ok, tankLiters: null, liters: 500 })).not.toThrow();
    expect(() => checkFuel({ ...ok, meterValue: null })).toThrow(/tachometru/);
    expect(() => checkFuel({ ...ok, meter: "mth", meterValue: null })).toThrow(/motohodin/);
  });

  it("tankování za dnešek nesmí jít pod známý stav, starší datum ano", () => {
    const at = { ...ok, today: "2026-06-10", currentMeter: 51000 };
    expect(() => checkFuel({ ...at, date: "2026-06-10", meterValue: 51000 })).not.toThrow();
    expect(() => checkFuel({ ...at, date: "2026-06-10", meterValue: 51400 })).not.toThrow();
    expect(() => checkFuel({ ...at, date: "2026-06-10", meterValue: 50999 })).toThrow(
      /nižší než poslední známý.*kartě stroje/,
    );
    expect(() => checkFuel({ ...at, date: "2026-06-08", meterValue: 50500 })).not.toThrow();
  });

  it("cena bez DPH z účtenky", () => {
    expect(netOfVat(121_00, 21)).toBe(100_00);
    expect(netOfVat(1_00, 21)).toBe(83);
    expect(netOfVat(100_00, 0)).toBe(100_00);
  });
});

describe("zobrazení", () => {
  it("stav tachometru podle měřidla", () => {
    expect(formatMeter(null, "km")).toBe("—");
    expect(formatMeter("12.5", "mth")).toBe("12,5 mth");
    expect(formatMeter(150000.4, "km")).toMatch(/^150\s000 km$/);
  });
});
