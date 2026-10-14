import { describe, expect, it } from "vitest";
import {
  FinanceLogicError,
  balance,
  countsTowardBalance,
  describeBalance,
  type BalancePayment,
  type BalanceSettlement,
} from "./index";

const O = "ondrej";
const P = "patrik";
const people = { [O]: { name: "Ondřej" }, [P]: { name: "Patrik" } };

const pay = (id: string, extra: Partial<BalancePayment> = {}): BalancePayment => ({
  id,
  status: "paid",
  kind: "one_off",
  amountMinor: 10_000,
  issuerId: O,
  issuedOn: "2026-09-28",
  paidOn: "2026-10-05",
  allocations: [
    { userId: O, amountMinor: 6_000 },
    { userId: P, amountMinor: 4_000 },
  ],
  ...extra,
});

describe("balance: co se počítá", () => {
  it("základ „zaplacené“ bere jen Zaplacené, „vystavené“ i Vystavené; Plánované a Zrušené nikdy", () => {
    const list = [
      pay("paid"),
      pay("issued", { status: "issued", paidOn: null }),
      pay("planned", { status: "planned", issuedOn: null, paidOn: null }),
      pay("canceled", { status: "canceled" }),
    ];
    expect(balance(list).paymentIds).toEqual(["paid"]);
    expect(balance(list, [], { basis: "issued" }).paymentIds).toEqual(["paid", "issued"]);
    expect(balance(list).basis).toBe("paid");
  });

  it("soukromé platby a recurring jsou mimo saldo (FIN-18)", () => {
    const list = [pay("a", { isPrivate: true }), pay("b", { kind: "recurring" })];
    const b = balance(list);
    expect(b.headline).toBeNull();
    expect(b.months).toEqual([]);
    expect(countsTowardBalance({ status: "paid", isPrivate: true }, "paid")).toBe(false);
  });

  it("součet podílů musí sedět na částku, jinak chyba", () => {
    expect(() =>
      balance([pay("x", { allocations: [{ userId: O, amountMinor: 1 }] })]),
    ).toThrowError(FinanceLogicError);
    // nezapočtená (plánovaná) platba se nekontroluje
    expect(() =>
      balance([pay("x", { status: "planned", allocations: [{ userId: O, amountMinor: 1 }] })]),
    ).not.toThrow();
  });
});

describe("balance: dluhy a vyrovnání", () => {
  it("fakturující dluží druhému jeho podíl; dluhy opačným směrem se odečítají (FIN-15)", () => {
    const b = balance([
      pay("a"), // O fakturuje, P patří 4 000 → O dluží P 4 000
      pay("b", {
        issuerId: P,
        allocations: [
          { userId: O, amountMinor: 3_000 },
          { userId: P, amountMinor: 7_000 },
        ],
      }), // P fakturuje, O patří 3 000 → P dluží O 3 000
    ]);
    expect(b.headline).toEqual({ debtorId: O, creditorId: P, amountMinor: 1_000 });
    expect(b.grossPairs).toEqual(b.pairs);
  });

  it("vyrovnání snižuje dluh; přeplacení otočí směr; storno se nepočítá", () => {
    const settle = (
      id: string,
      from: string,
      to: string,
      amountMinor: number,
      canceled = false,
    ): BalanceSettlement => ({
      id,
      fromUserId: from,
      toUserId: to,
      amountMinor,
      settledOn: "2026-10-31",
      canceledAt: canceled ? "2026-11-01T00:00:00Z" : null,
    });
    const base = [pay("a")]; // O dluží P 4 000
    expect(balance(base, [settle("s", O, P, 1_500)]).headline?.amountMinor).toBe(2_500);
    expect(balance(base, [settle("s", O, P, 4_000)]).headline).toBeNull();
    expect(balance(base, [settle("s", O, P, 5_000)]).headline).toEqual({
      debtorId: P,
      creditorId: O,
      amountMinor: 1_000,
    });
    // vyrovnání opačným směrem dluh zvyšuje (chybně zapsané)
    expect(balance(base, [settle("s", P, O, 500)]).headline?.amountMinor).toBe(4_500);
    expect(balance(base, [settle("s", O, P, 4_000, true)]).headline?.amountMinor).toBe(4_000);
    expect(
      balance(base, [settle("s1", O, P, 1_000), settle("s2", O, P, 1_000)]).headline?.amountMinor,
    ).toBe(2_000);
  });

  it("neplatné vyrovnání vyhodí chybu", () => {
    const bad = (s: Partial<BalanceSettlement>) =>
      balance([], [{ id: "s", fromUserId: O, toUserId: P, amountMinor: 100, ...s }]);
    expect(() => bad({ amountMinor: 0 })).toThrowError(FinanceLogicError);
    expect(() => bad({ amountMinor: 1.5 })).toThrowError(FinanceLogicError);
    expect(() => bad({ toUserId: O })).toThrowError(FinanceLogicError);
  });

  it("bez plateb je vyrovnáno", () => {
    const b = balance([]);
    expect(b.headline).toBeNull();
    expect(describeBalance(b, people)).toBe("Vyrovnáno");
  });
});

describe("balance: měsíční rozpis (FIN-16)", () => {
  it("řadí měsíce vzestupně, počítá fakturováno / patří / rozdíl a ukazuje id plateb", () => {
    const b = balance([
      pay("nov", { paidOn: "2026-11-02" }),
      pay("okt1", { paidOn: "2026-10-02" }),
      pay("okt2", {
        paidOn: "2026-10-20",
        issuerId: P,
        allocations: [
          { userId: O, amountMinor: 5_000 },
          { userId: P, amountMinor: 5_000 },
        ],
      }),
    ]);
    expect(b.months.map((m) => m.month)).toEqual(["2026-10", "2026-11"]);
    const okt = b.months[0]!;
    expect(okt.paymentIds).toEqual(["okt1", "okt2"]);
    expect(okt.invoiced).toEqual({ [O]: 10_000, [P]: 10_000 });
    expect(okt.entitled).toEqual({ [O]: 11_000, [P]: 9_000 });
    expect(okt.difference).toEqual({ [O]: -1_000, [P]: 1_000 });
    // říjen: O dluží P 4 000, P dluží O 5 000 → P dluží O 1 000
    expect(okt.debts).toEqual([{ debtorId: P, creditorId: O, amountMinor: 1_000 }]);
    expect(b.months[1]?.debts).toEqual([{ debtorId: O, creditorId: P, amountMinor: 4_000 }]);
    // celkem: O dluží P 4 000 − 1 000 = 3 000
    expect(b.headline).toEqual({ debtorId: O, creditorId: P, amountMinor: 3_000 });
  });

  it("měsíc se bere podle základu: zaplacené → paidOn, vystavené → issuedOn", () => {
    const p = pay("a", { issuedOn: "2026-09-28", paidOn: "2026-10-05" });
    expect(balance([p]).months[0]?.month).toBe("2026-10");
    expect(balance([p], [], { basis: "issued" }).months[0]?.month).toBe("2026-09");
  });

  it("fallback měsíce: druhé datum, pak period_month, jinak bucket bez měsíce na konci", () => {
    const b = balance(
      [
        pay("nodate", { issuedOn: null, paidOn: null }),
        pay("period", { issuedOn: null, paidOn: null, periodMonth: "2026-12" }),
        pay("issuedonly", { paidOn: null, issuedOn: "2026-08-15" }),
      ],
      [],
    );
    expect(b.months.map((m) => m.month)).toEqual(["2026-08", "2026-12", null]);
  });
});

describe("describeBalance", () => {
  it("skloňuje jméno věřitele do 3. pádu a formátuje částku", () => {
    const b = balance([
      pay("a", {
        amountMinor: 1_240_000,
        allocations: [
          { userId: O, amountMinor: 0 },
          { userId: P, amountMinor: 1_240_000 },
        ],
      }),
    ]);
    expect(describeBalance(b, people, { nbsp: false })).toBe("Ondřej dluží Patrikovi 12 400 Kč");
    expect(
      describeBalance(
        b,
        { [O]: { name: "Ondřej" }, [P]: { name: "Jana", dative: "Janě" } },
        { nbsp: false },
      ),
    ).toBe("Ondřej dluží Janě 12 400 Kč");
  });
});
