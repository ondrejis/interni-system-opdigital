import { describe, expect, it } from "vitest";
import { canEditOrder, canTransition, compareWithOrder, orderTotals } from "./calc";

describe("objednávky", () => {
  it("součty řádků v haléřích a DPH po řádcích", () => {
    const t = orderTotals([
      { quantity: "2.5", unitPriceMinor: 10_000, vatRateBp: 2100 },
      { quantity: "1", unitPriceMinor: 99_99, vatRateBp: 1200 },
    ]);
    expect(t.netMinor).toBe(25_000 + 99_99);
    expect(t.vatMinor).toBe(5_250 + 1_200);
    expect(t.grossMinor).toBe(t.netMinor + t.vatMinor);
    expect(orderTotals([])).toEqual({ netMinor: 0, vatMinor: 0, grossMinor: 0 });
  });

  it("upravit jde jen koncept a přechody stavů jsou omezené", () => {
    expect(canEditOrder("draft")).toBe(true);
    expect(canEditOrder("approved")).toBe(false);
    expect(canTransition("approved", "received")).toBe(true);
    expect(canTransition("received", "cancelled")).toBe(false);
    expect(canTransition("cancelled", "draft")).toBe(false);
    expect(canTransition("draft", "received")).toBe(false);
  });

  it("porovnání faktury s objednávkou", () => {
    expect(compareWithOrder(1000, 1200)).toEqual({ diffMinor: 200, state: "over" });
    expect(compareWithOrder(1000, 800).state).toBe("under");
    expect(compareWithOrder(1000, 1000).state).toBe("match");
  });
});
