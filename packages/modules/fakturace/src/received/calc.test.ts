import { describe, expect, it } from "vitest";
import {
  canEditReceived,
  checkReceived,
  dedupKey,
  headerVat,
  isOverdue,
  sumLines,
  vatOf,
} from "./calc";

describe("přijaté faktury", () => {
  it("DPH řádku a přenesená daňová povinnost", () => {
    expect(vatOf(10_000, 2100, "standard")).toBe(2_100);
    expect(vatOf(-10_050, 2100, "standard")).toBe(-2_111); // půl od nuly: -2110,5
    expect(vatOf(10_000, 2100, "reverse_charge")).toBe(0);
    expect(headerVat(10_000, 12_100, "standard")).toBe(2_100);
    expect(headerVat(10_000, 10_000, "reverse_charge")).toBe(0);
    expect(
      sumLines(
        [
          { netMinor: 100, vatRateBp: 1200 },
          { netMinor: 200, vatRateBp: 2100 },
        ],
        "standard",
      ),
    ).toEqual({
      netMinor: 300,
      vatMinor: 12 + 42,
      grossMinor: 354,
    });
  });

  it("řádky musí sedět na základ hlavičky", () => {
    const h = { netMinor: 100_000, grossMinor: 121_000, vatMode: "standard" };
    const l = (n: number) => ({ netMinor: n, vatRateBp: 2100 });
    expect(checkReceived(h, [l(60_000), l(40_000)])).toBeNull();
    expect(checkReceived(h, [l(60_000), l(30_000)])).toMatch(/Součet řádků/);
    expect(checkReceived(h, [])).toMatch(/žádné řádky/);
    expect(checkReceived({ ...h, netMinor: 0 }, [l(0)])).toMatch(/nula/);
    expect(checkReceived({ ...h, grossMinor: 90_000 }, [l(100_000)])).toMatch(/nižší než základ/);
    expect(
      checkReceived({ ...h, vatMode: "reverse_charge", grossMinor: 100_000 }, [l(100_000)]),
    ).toBeNull();
    // přijatý dobropis (záporná faktura) je v pořádku
    expect(
      checkReceived({ netMinor: -1000, grossMinor: -1210, vatMode: "standard" }, [l(-1000)]),
    ).toBeNull();
  });

  it("duplicita se pozná podle čísla bez mezer a velikosti písmen", () => {
    expect(dedupKey(" FV 2026/001 ")).toBe(dedupKey("fv2026/001"));
    expect(dedupKey("FV-1")).not.toBe(dedupKey("FV-2"));
  });

  it("úpravy a splatnost", () => {
    expect(canEditReceived("draft")).toBe(true);
    expect(canEditReceived("rejected")).toBe(true);
    expect(canEditReceived("approved")).toBe(false);
    expect(canEditReceived("paid")).toBe(false);
    expect(isOverdue("approved", "2026-10-01", "2026-10-09")).toBe(true);
    expect(isOverdue("paid", "2026-10-01", "2026-10-09")).toBe(false);
    expect(isOverdue("approved", "2026-10-09", "2026-10-09")).toBe(false);
    expect(isOverdue("draft", "2026-10-01", "2026-10-09")).toBe(false);
  });
});
