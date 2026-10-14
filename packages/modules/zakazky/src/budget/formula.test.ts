import { describe, expect, it } from "vitest";
import { evaluateCalcLines, evaluateFormula, sumCalcThousandths } from "./formula";

describe("vzorce výkazu výměr", () => {
  it("počítá aritmetiku s prioritou a závorkami", () => {
    expect(evaluateFormula("2+3*4")).toEqual({ ok: true, value: 14 });
    expect(evaluateFormula("(2+3)*4")).toEqual({ ok: true, value: 20 });
    expect(evaluateFormula("-2*-3")).toEqual({ ok: true, value: 6 });
    expect(evaluateFormula("10/4")).toEqual({ ok: true, value: 2.5 });
    expect(evaluateFormula("4,5 × 2")).toEqual({ ok: true, value: 9 });
    expect(evaluateFormula("")).toEqual({ ok: true, value: 0 });
  });

  it("zaokrouhluje na tisíciny půl od nuly", () => {
    expect(evaluateFormula("1/3")).toEqual({ ok: true, value: 0.333 });
    expect(evaluateFormula("2/3")).toEqual({ ok: true, value: 0.667 });
    expect(evaluateFormula("1.0005")).toEqual({ ok: true, value: 1.001 });
    expect(evaluateFormula("-1.0005")).toEqual({ ok: true, value: -1.001 });
    expect(evaluateFormula("0.1+0.2")).toEqual({ ok: true, value: 0.3 });
  });

  it("odmítne chyby srozumitelně", () => {
    expect(evaluateFormula("1/0")).toEqual({ ok: false, error: "Dělení nulou." });
    expect(evaluateFormula("(1+2")).toMatchObject({ ok: false });
    expect(evaluateFormula("1+")).toMatchObject({ ok: false });
    expect(evaluateFormula("2 3")).toMatchObject({ ok: false });
    expect(evaluateFormula("a+1")).toMatchObject({
      ok: false,
      error: expect.stringContaining("Neznámá"),
    });
  });

  it("nespouští kód: žádné eval, funkce ani přístup k prototypům", () => {
    for (const bad of [
      "process.exit(1)",
      "constructor",
      "__proto__",
      "globalThis",
      "1;2",
      "alert(1)",
      "`${1}`",
      "1**2",
      "this",
    ]) {
      const r = evaluateFormula(bad);
      expect(r.ok).toBe(false);
    }
    expect(evaluateFormula("toString", {})).toMatchObject({ ok: false });
  });

  it("řádky odkazují na proměnné v libovolném pořadí", () => {
    const out = evaluateCalcLines([
      { variable: "plocha", formula: "dl*sir" },
      { variable: "dl", formula: "4,5" },
      { variable: "sir", formula: "3" },
      { variable: null, formula: "plocha*2" },
    ]);
    expect(out.map((o) => o.value)).toEqual([13.5, 4.5, 3, 27]);
    expect(out.every((o) => o.error === null)).toBe(true);
    expect(sumCalcThousandths(out.map((o) => o.value))).toBe(48_000);
  });

  it("zachytí cyklus, duplicitu a chybnou závislost", () => {
    const cyc = evaluateCalcLines([
      { variable: "a", formula: "b+1" },
      { variable: "b", formula: "a+1" },
    ]);
    expect(cyc.every((o) => o.error)).toBe(true);
    const dup = evaluateCalcLines([
      { variable: "a", formula: "1" },
      { variable: "a", formula: "2" },
    ]);
    expect(dup[0]!.error).toBeNull();
    expect(dup[1]!.error).toMatch(/víckrát/);
    const dep = evaluateCalcLines([
      { variable: "a", formula: "1/0" },
      { variable: "b", formula: "a+1" },
    ]);
    expect(dep[1]!.error).toMatch(/chybný/);
  });
});
