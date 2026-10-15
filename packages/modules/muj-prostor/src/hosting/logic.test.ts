import { describe, expect, it } from "vitest";
import {
  annualMinor,
  monthlyMinor,
  periodMonths,
  renewalState,
  renewalWindowEnd,
  shiftRenewal,
  summarizeServices,
  type ServiceLike,
} from "./logic";

const TODAY = "2026-10-14";
const svc = (over: Partial<ServiceLike> = {}): ServiceLike => ({
  kind: "hosting",
  period: "yearly",
  status: "active",
  priceMinor: 600_000,
  nextRenewal: null,
  ...over,
});

describe("posun obnovy o období (HOST-03, R-47)", () => {
  it("roční služba se posune o rok, měsíční o měsíc", () => {
    expect(shiftRenewal("2026-11-05", "yearly")).toBe("2027-11-05");
    expect(shiftRenewal("2026-11-05", "monthly")).toBe("2026-12-05");
    expect(shiftRenewal("2026-12-05", "monthly")).toBe("2027-01-05");
    expect(periodMonths("yearly")).toBe(12);
    expect(periodMonths("monthly")).toBe(1);
  });

  it("přestupný den se v nepřestupném roce zkrátí a v dalším přestupném vrátí (podle `since`)", () => {
    expect(shiftRenewal("2024-02-29", "yearly")).toBe("2025-02-28");
    expect(shiftRenewal("2025-02-28", "yearly", "2024-02-29")).toBe("2026-02-28");
    expect(shiftRenewal("2027-02-28", "yearly", "2024-02-29")).toBe("2028-02-29");
  });

  it("měsíční obnova z konce měsíce se nesune dolů: 31. 1. → 28. 2. → 31. 3.", () => {
    expect(shiftRenewal("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(shiftRenewal("2026-02-28", "monthly", "2026-01-31")).toBe("2026-03-31");
    expect(shiftRenewal("2026-03-31", "monthly", "2026-01-31")).toBe("2026-04-30");
    expect(shiftRenewal("2026-04-30", "monthly", "2026-01-31")).toBe("2026-05-31");
  });

  it("ručně nastavený den (ne poslední v měsíci) se drží bez ohledu na `since`", () => {
    expect(shiftRenewal("2026-02-15", "monthly", "2026-01-31")).toBe("2026-03-15");
  });

  it("bez `since` zkrácený den zůstane zkrácený (a je to předvídatelné)", () => {
    expect(shiftRenewal("2026-02-28", "monthly")).toBe("2026-03-28");
  });

  it("zvládne přelom roku a přijme i časovou část data", () => {
    expect(shiftRenewal("2026-12-31", "yearly")).toBe("2027-12-31");
    expect(shiftRenewal("2026-12-31T00:00:00.000Z", "monthly")).toBe("2027-01-31");
  });
});

describe("roční opakovaný příjem (R-26)", () => {
  it("měsíční cena se násobí 12, roční zůstává", () => {
    expect(annualMinor(600_000, "yearly")).toBe(600_000);
    expect(annualMinor(50_000, "monthly")).toBe(600_000);
    expect(annualMinor(null, "yearly")).toBe(0);
    expect(monthlyMinor(600_000, "yearly")).toBe(50_000);
    expect(monthlyMinor(100_000, "yearly")).toBe(8_333);
    expect(monthlyMinor(12_345, "monthly")).toBe(12_345);
  });

  it("souhrn počítá do příjmu a počtu jen aktivní služby", () => {
    const s = summarizeServices(
      [
        svc({ priceMinor: 600_000, kind: "hosting" }),
        svc({ priceMinor: 50_000, period: "monthly", kind: "maintenance" }),
        svc({ priceMinor: 999_999, status: "paused" }),
        svc({ priceMinor: 999_999, status: "canceled" }),
        svc({ priceMinor: null }),
      ],
      TODAY,
    );
    expect(s.activeCount).toBe(3);
    expect(s.pausedCount).toBe(1);
    expect(s.canceledCount).toBe(1);
    expect(s.annualMinor).toBe(600_000 + 600_000);
    expect(s.monthlyMinor).toBe(100_000);
    expect(s.byKind.hosting).toEqual({ count: 2, annualMinor: 600_000 });
    expect(s.byKind.maintenance).toEqual({ count: 1, annualMinor: 600_000 });
  });

  it("prázdná evidence dá nuly", () => {
    const s = summarizeServices([], TODAY);
    expect(s.activeCount).toBe(0);
    expect(s.annualMinor).toBe(0);
    expect(s.dueSoonCount).toBe(0);
  });

  it("obnova do 30 dní zahrnuje i služby po termínu a nepočítá pozastavené", () => {
    const s = summarizeServices(
      [
        svc({ nextRenewal: "2026-10-01" }), // po termínu
        svc({ nextRenewal: "2026-10-14" }), // dnes
        svc({ nextRenewal: "2026-11-13" }), // přesně za 30 dní
        svc({ nextRenewal: "2026-11-14" }), // za 31 dní
        svc({ nextRenewal: null }),
        svc({ nextRenewal: "2026-10-20", status: "paused" }),
      ],
      TODAY,
    );
    expect(s.dueSoonCount).toBe(3);
    expect(s.overdueCount).toBe(1);
  });
});

describe("stav obnovy", () => {
  it("rozlišuje po termínu, blíží se, v pořádku a bez data", () => {
    expect(renewalState("2026-10-13", "active", TODAY)).toEqual({ level: "overdue", daysLeft: -1 });
    expect(renewalState("2026-10-14", "active", TODAY)).toEqual({ level: "soon", daysLeft: 0 });
    expect(renewalState("2026-11-13", "active", TODAY)).toEqual({ level: "soon", daysLeft: 30 });
    expect(renewalState("2026-11-14", "active", TODAY)).toEqual({ level: "ok", daysLeft: 31 });
    expect(renewalState(null, "active", TODAY)).toEqual({ level: "none", daysLeft: null });
    expect(renewalState("2026-10-20", "canceled", TODAY).level).toBe("none");
  });

  it("konec okna je dnes + 30 dní", () => {
    expect(renewalWindowEnd(TODAY)).toBe("2026-11-13");
    expect(renewalWindowEnd("2026-12-20", 14)).toBe("2027-01-03");
  });
});
