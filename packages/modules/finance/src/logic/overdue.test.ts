import { describe, expect, it } from "vitest";
import {
  FinanceLogicError,
  countOverdue,
  dueOnFrom,
  isOverdue,
  paymentDueState,
  summarizePayments,
  type PaymentForTotals,
} from "./index";

const TODAY = "2026-10-14";

describe("isOverdue / paymentDueState (FIN-11, R-40)", () => {
  it("červeně jen Vystavená po splatnosti; v den splatnosti ještě ne", () => {
    expect(isOverdue({ status: "issued", dueOn: "2026-10-13" }, TODAY)).toBe(true);
    expect(isOverdue({ status: "issued", dueOn: "2026-10-14" }, TODAY)).toBe(false);
    expect(isOverdue({ status: "issued", dueOn: "2026-10-15" }, TODAY)).toBe(false);
    expect(isOverdue({ status: "issued", dueOn: null }, TODAY)).toBe(false);
    expect(isOverdue({ status: "paid", dueOn: "2026-01-01" }, TODAY)).toBe(false);
    expect(isOverdue({ status: "canceled", dueOn: "2026-01-01" }, TODAY)).toBe(false);
    expect(isOverdue({ status: "planned", dueOn: "2026-01-01" }, TODAY)).toBe(false);
  });

  it("Plánovaná s prošlým termínem je jen upozornění (planned_late)", () => {
    expect(paymentDueState({ status: "planned", dueOn: "2026-10-01" }, TODAY)).toBe("planned_late");
    expect(paymentDueState({ status: "planned", issuedOn: "2026-10-01" }, TODAY)).toBe(
      "planned_late",
    );
    expect(paymentDueState({ status: "planned", issuedOn: "2026-10-20" }, TODAY)).toBe("ok");
    expect(paymentDueState({ status: "planned" }, TODAY)).toBe("none");
    expect(paymentDueState({ status: "issued", dueOn: "2026-10-10" }, TODAY)).toBe("overdue");
    expect(paymentDueState({ status: "issued", dueOn: "2026-11-10" }, TODAY)).toBe("ok");
    expect(paymentDueState({ status: "paid" }, TODAY)).toBe("none");
  });

  it("countOverdue počítá číslo u položky Finance", () => {
    expect(
      countOverdue(
        [
          { status: "issued", dueOn: "2026-10-01" },
          { status: "issued", dueOn: "2026-12-01" },
          { status: "planned", dueOn: "2026-10-01" },
          { status: "issued", dueOn: "2026-09-01" },
        ],
        TODAY,
      ),
    ).toBe(2);
  });

  it("neplatné datum dneška je chyba", () => {
    expect(() => isOverdue({ status: "issued" }, "14.10.2026")).toThrowError(FinanceLogicError);
  });

  it("dueOnFrom přičte dny včetně přechodu měsíce a roku", () => {
    expect(dueOnFrom("2026-12-20", 14)).toBe("2027-01-03");
    expect(dueOnFrom("2027-02-20", 14)).toBe("2027-03-06");
  });
});

describe("summarizePayments (FIN-12)", () => {
  const list: PaymentForTotals[] = [
    {
      status: "paid",
      amountMinor: 10_000,
      issuerId: "o",
      allocations: [
        { userId: "o", amountMinor: 6_000 },
        { userId: "p", amountMinor: 4_000 },
      ],
    },
    {
      status: "issued",
      amountMinor: 5_000,
      issuerId: "p",
      dueOn: "2026-10-01",
      allocations: [
        { userId: "o", amountMinor: 2_500 },
        { userId: "p", amountMinor: 2_500 },
      ],
    },
    { status: "planned", amountMinor: 3_000, issuerId: "o", issuedOn: "2026-09-01" },
    { status: "canceled", amountMinor: 99_000, issuerId: "o" },
  ];
  it("součty bez zrušených, rozpad podle stavu, po splatnosti, podíly", () => {
    const t = summarizePayments(list, TODAY);
    expect(t.count).toBe(3);
    expect(t.totalMinor).toBe(18_000);
    expect(t.byStatus.paid).toEqual({ count: 1, amountMinor: 10_000 });
    expect(t.byStatus.issued).toEqual({ count: 1, amountMinor: 5_000 });
    expect(t.byStatus.planned).toEqual({ count: 1, amountMinor: 3_000 });
    expect(t.byStatus.canceled).toEqual({ count: 1, amountMinor: 99_000 });
    expect(t.overdue).toEqual({ count: 1, amountMinor: 5_000 });
    expect(t.plannedLate).toEqual({ count: 1, amountMinor: 3_000 });
    expect(t.allocatedByUser).toEqual({ o: 8_500, p: 6_500 });
    expect(t.invoicedByIssuer).toEqual({ o: 13_000, p: 5_000 });
  });
  it("prázdný seznam dává nuly", () => {
    const t = summarizePayments([], TODAY);
    expect(t.count).toBe(0);
    expect(t.totalMinor).toBe(0);
    expect(t.allocatedByUser).toEqual({});
  });
});
