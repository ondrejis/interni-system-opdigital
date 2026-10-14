import { describe, expect, it } from "vitest";
import { availableHours, machineUtilizationPct } from "./metrics-calc";

describe("availableHours", () => {
  it("pracovní dny bez svátků krát osm hodin", () => {
    // 26.–30. 10. 2026, st 28. 10. je svátek
    expect(availableHours({ from: "2026-10-26", to: "2026-10-30" }, "2026-12-31")).toBe(4 * 8);
  });
  it("jen do dneška", () => {
    expect(availableHours({ from: "2026-10-01", to: "2026-10-31" }, "2026-10-09")).toBe(7 * 8);
  });
  it("období přes změnu času a budoucnost", () => {
    expect(availableHours({ from: "2026-10-24", to: "2026-10-26" }, "2026-12-31")).toBe(8);
    expect(availableHours({ from: "2027-01-01", to: "2027-01-31" }, "2026-12-31")).toBe(0);
  });
});

describe("machineUtilizationPct", () => {
  it("hodiny nasazení děleno dostupnými", () => {
    expect(machineUtilizationPct(60, 160)).toBe(37.5);
    expect(machineUtilizationPct(10, 0)).toBeNull();
  });
});
