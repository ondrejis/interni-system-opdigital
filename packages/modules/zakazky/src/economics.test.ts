import { describe, expect, it } from "vitest";
import { changeLabel, lineTotalMinor } from "./economics";

describe("ekonomika zakázky", () => {
  it("cena řádku v haléřích se zaokrouhluje půl od nuly a nepoužívá plovoucí čárku na součtech", () => {
    expect(lineTotalMinor("2.5", 1000)).toBe(2500);
    expect(lineTotalMinor("0.333", 100)).toBe(33); // 33,3 → 33
    expect(lineTotalMinor("0.335", 100)).toBe(34); // 33,5 → 34
    expect(lineTotalMinor("-0.335", 100)).toBe(-34);
    expect(lineTotalMinor(3, 12345)).toBe(37035);
  });

  it("označení víceprací a méněprací", () => {
    expect(changeLabel(3, 100)).toBe("VP-3");
    expect(changeLabel(1, -100)).toBe("MP-1");
  });
});
