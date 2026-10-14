import { describe, expect, it } from "vitest";
import {
  FinanceLogicError,
  allocate,
  allocateJob,
  allocationsDiffer,
  effectiveSplitRules,
  hasErrors,
  manualAllocation,
  recalcNeedsConfirmation,
  ruleMonthFor,
  toRecord,
  validateSplitRules,
  type JobPayment,
  type SplitRule,
} from "./index";

const O = "ondrej";
const P = "patrik";
const K = (czk: number) => czk * 100;

const pct = (
  userId: string,
  percent: number | string,
  extra: Partial<SplitRule> = {},
): SplitRule => ({
  userId,
  mode: "percent",
  percent,
  appliesTo: "all",
  ...extra,
});
const fixedPer = (userId: string, czk: number, extra: Partial<SplitRule> = {}): SplitRule => ({
  userId,
  mode: "fixed_per_payment",
  fixedMinor: K(czk),
  appliesTo: "all",
  ...extra,
});
const fixedTotal = (userId: string, czk: number, extra: Partial<SplitRule> = {}): SplitRule => ({
  userId,
  mode: "fixed_total",
  fixedMinor: K(czk),
  appliesTo: "all",
  ...extra,
});

const pay = (amountCzk: number, issuerId = O, extra = {}) => ({
  kind: "one_off" as const,
  amountMinor: K(amountCzk),
  issuerId,
  issuedOn: "2026-10-01",
  ...extra,
});

function expectCode(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(FinanceLogicError);
    expect((e as FinanceLogicError).code).toBe(code);
    return;
  }
  throw new Error(`Očekávána chyba ${code}`);
}

describe("allocate: základy", () => {
  it("bez pravidel patří celá platba fakturujícímu", () => {
    const r = allocate(pay(10_000, P), []);
    expect(r.mode).toBe("issuer_only");
    expect(r.allocations).toEqual([{ userId: P, amountMinor: K(10_000) }]);
  });

  it("procenta 60/40 z 10 000 Kč", () => {
    const r = allocate(pay(10_000), [pct(O, 60), pct(P, 40)]);
    expect(toRecord(r.allocations)).toEqual({ [O]: K(6_000), [P]: K(4_000) });
    expect(r.mode).toBe("rules");
    expect(r.warnings).toEqual([]);
  });

  it("procenta jako řetězec z numeric sloupce („60.00“, „33,33“)", () => {
    const r = allocate(pay(10_000), [pct(O, "60.00"), pct(P, "40,00")]);
    expect(toRecord(r.allocations)).toEqual({ [O]: K(6_000), [P]: K(4_000) });
  });

  it("zaokrouhluje dolů a haléř dostane fakturující (scénář 4)", () => {
    const r = allocate({ ...pay(0), amountMinor: 33_333 }, [pct(O, 50), pct(P, 50)]);
    expect(toRecord(r.allocations)).toEqual({ [O]: 16_667, [P]: 16_666 });
    const r2 = allocate({ ...pay(0), amountMinor: 33_333, issuerId: P }, [pct(O, 50), pct(P, 50)]);
    expect(toRecord(r2.allocations)).toEqual({ [O]: 16_666, [P]: 16_667 });
  });

  it("třetina třem osobám: zbylý haléř jde fakturujícímu", () => {
    const r = allocate({ ...pay(0), amountMinor: 100 }, [
      pct(O, "33.3333"),
      pct(P, "33.3333"),
      pct("jana", "33.3334"),
    ]);
    expect(r.allocations.reduce((s, a) => s + a.amountMinor, 0)).toBe(100);
    expect(toRecord(r.allocations)).toEqual({ [O]: 34, [P]: 33, jana: 33 });
  });

  it("procenta dávají méně než 100 % → zbytek fakturujícímu + varování", () => {
    const r = allocate(pay(10_000, O), [pct(O, 50), pct(P, 30)]);
    expect(toRecord(r.allocations)).toEqual({ [O]: K(7_000), [P]: K(3_000) });
    expect(r.warnings.map((w) => w.code)).toEqual(["percent_under_100"]);
    expect(r.warnings[0]?.percentSum).toBe(80);
  });

  it("procenta přes 100 % jsou chyba (R-11)", () => {
    expectCode(() => allocate(pay(1_000), [pct(O, 70), pct(P, 40)]), "percent_over_100");
  });

  it("přesně 100 % rozdělené na víc pravidel téže osoby se sečte", () => {
    const r = allocate(pay(1_000), [pct(O, 25), pct(O, 25), pct(P, 50)]);
    expect(toRecord(r.allocations)).toEqual({ [O]: K(500), [P]: K(500) });
  });

  it("jen fixní částka: zbytek jde fakturujícímu", () => {
    const r = allocate(pay(80_000, P), [fixedPer(O, 10_000)]);
    expect(toRecord(r.allocations)).toEqual({ [O]: K(10_000), [P]: K(70_000) });
  });

  it("fixní částka + procenta: procenta jsou ze zbytku po fixních částkách", () => {
    const r = allocate(pay(10_000), [fixedPer(P, 2_000), pct(O, 50), pct(P, 50)]);
    // zbytek 8 000 → 4 000 / 4 000; Patrik má navíc fixních 2 000
    expect(toRecord(r.allocations)).toEqual({ [O]: K(4_000), [P]: K(6_000) });
  });

  it("fixní částka nikdy nepřesáhne zbytek platby (a je varování)", () => {
    const r = allocate(pay(3_000), [fixedPer(O, 2_000), fixedPer(P, 2_000)]);
    expect(toRecord(r.allocations)).toEqual({ [O]: K(2_000), [P]: K(1_000) });
    expect(r.warnings.map((w) => w.code)).toEqual(["fixed_capped"]);
  });

  it("fixní částky se odečítají v pořadí `position`", () => {
    const r = allocate(pay(3_000), [
      fixedPer(O, 2_000, { position: 2 }),
      fixedPer(P, 2_000, { position: 1 }),
    ]);
    expect(toRecord(r.allocations)).toEqual({ [P]: K(2_000), [O]: K(1_000) });
  });

  it("kdo je v pravidlech, je ve výsledku i s nulou (PK platba+uživatel)", () => {
    const r = allocate(pay(1_000), [fixedPer(O, 5_000), pct(P, 100)]);
    expect(toRecord(r.allocations)).toEqual({ [O]: K(1_000), [P]: 0 });
  });
});

describe("allocate: rozsah pravidel a platnost", () => {
  const rules: SplitRule[] = [
    pct(O, 50),
    pct(P, 50),
    pct(O, 80, { appliesTo: "retainer" }),
    pct(P, 20, { appliesTo: "retainer" }),
  ];

  it("konkrétní applies_to má přednost před all jako celá skupina", () => {
    const retainer = allocate(
      { kind: "retainer", amountMinor: K(10_000), issuerId: O, periodMonth: "2026-10" },
      rules,
    );
    expect(toRecord(retainer.allocations)).toEqual({ [O]: K(8_000), [P]: K(2_000) });
    const oneOff = allocate(pay(10_000), rules);
    expect(toRecord(oneOff.allocations)).toEqual({ [O]: K(5_000), [P]: K(5_000) });
  });

  it("pravidlo jen pro retainer se na jednorázovou platbu neuplatní → vše fakturujícímu", () => {
    const only = [pct(O, 50, { appliesTo: "retainer" }), pct(P, 50, { appliesTo: "retainer" })];
    const r = allocate(pay(1_000, P), only);
    expect(r.mode).toBe("issuer_only");
    expect(toRecord(r.allocations)).toEqual({ [P]: K(1_000) });
  });

  it("platnost od–do včetně krajních měsíců; retainer se řídí period_month", () => {
    const r2 = [
      pct(O, 70, { validToMonth: "2026-12" }),
      pct(P, 30, { validToMonth: "2026-12" }),
      pct(O, 50, { validFromMonth: "2027-01" }),
      pct(P, 50, { validFromMonth: "2027-01" }),
    ];
    const at = (periodMonth: string) =>
      toRecord(
        allocate(
          {
            kind: "retainer",
            amountMinor: K(15_000),
            issuerId: O,
            periodMonth,
            issuedOn: "2030-01-01",
          },
          r2,
        ).allocations,
      );
    expect(at("2026-11")).toEqual({ [O]: K(10_500), [P]: K(4_500) });
    expect(at("2026-12")).toEqual({ [O]: K(10_500), [P]: K(4_500) });
    expect(at("2027-01")).toEqual({ [O]: K(7_500), [P]: K(7_500) });
  });

  it("jiný druh než retainer se řídí měsícem data vystavení, jinak dneškem", () => {
    const r2 = [pct(O, 70, { validToMonth: "2026-12" }), pct(P, 30, { validToMonth: "2026-12" })];
    const issued = allocate(
      { kind: "extra", amountMinor: 1000, issuerId: O, issuedOn: "2027-01-05" },
      r2,
    );
    expect(issued.mode).toBe("issuer_only");
    const today = allocate({ kind: "extra", amountMinor: 1000, issuerId: O }, r2, {
      today: "2026-12-31",
    });
    expect(toRecord(today.allocations)).toEqual({ [O]: 700, [P]: 300 });
    expectCode(
      () => allocate({ kind: "extra", amountMinor: 1000, issuerId: O }, r2),
      "invalid_date",
    );
  });

  it("ruleMonthFor: retainer → period_month, jinak datum vystavení, jinak dnes", () => {
    expect(ruleMonthFor({ kind: "retainer", periodMonth: "2026-12", issuedOn: "2027-01-02" })).toBe(
      "2026-12",
    );
    expect(ruleMonthFor({ kind: "intro", periodMonth: "2026-12", issuedOn: "2027-01-02" })).toBe(
      "2027-01",
    );
    expect(ruleMonthFor({ kind: "extra" }, "2026-05-09")).toBe("2026-05");
  });

  it("effectiveSplitRules vrací původní pravidla použitá pro druh a měsíc", () => {
    expect(effectiveSplitRules(rules, "retainer", "2026-10")).toHaveLength(2);
    expect(effectiveSplitRules(rules, "retainer", "2026-10")[0]).toBe(rules[2]);
    expect(effectiveSplitRules(rules, "intro", "2026-10")).toEqual([rules[0], rules[1]]);
  });
});

describe("allocate: fixně celkem (fixed_total)", () => {
  const rules = [{ ...fixedTotal(P, 10_000), id: "ft" }, pct(O, 100)];

  it("odečítá se postupně z dřívějších plateb (scénář 7, ručně předaná spotřeba)", () => {
    const first = allocate(pay(6_000), rules);
    expect(toRecord(first.allocations)).toEqual({ [P]: K(6_000), [O]: 0 });
    expect(first.fixedTotalUsed).toEqual({ ft: K(6_000) });
    const second = allocate(pay(6_000), rules, { fixedTotalConsumed: first.fixedTotalUsed });
    expect(toRecord(second.allocations)).toEqual({ [P]: K(4_000), [O]: K(2_000) });
    const third = allocate(pay(6_000), rules, { fixedTotalConsumed: { ft: K(10_000) } });
    expect(toRecord(third.allocations)).toEqual({ [P]: 0, [O]: K(6_000) });
  });

  it("allocateJob řadí podle data vystavení, pak vytvoření, pak id", () => {
    const payments: JobPayment[] = [
      { ...pay(6_000), id: "b", issuedOn: "2026-11-01", createdAt: "2026-09-01T00:00:00Z" },
      { ...pay(6_000), id: "a", issuedOn: "2026-10-01", createdAt: "2026-09-02T00:00:00Z" },
    ];
    const out = allocateJob(payments, rules);
    expect(toRecord(out.get("a")!.allocations)).toEqual({ [P]: K(6_000), [O]: 0 });
    expect(toRecord(out.get("b")!.allocations)).toEqual({ [P]: K(4_000), [O]: K(2_000) });
  });

  it("allocateJob: stejné datum rozhodne vytvoření, pak id; vstupní pořadí nehraje roli", () => {
    const mk = (id: string, createdAt: string): JobPayment => ({
      ...pay(6_000),
      id,
      issuedOn: "2026-10-01",
      createdAt,
    });
    const a = allocateJob([mk("x", "2026-01-02"), mk("y", "2026-01-01")], rules);
    expect(toRecord(a.get("y")!.allocations)[P]).toBe(K(6_000));
    expect(toRecord(a.get("x")!.allocations)[P]).toBe(K(4_000));
    const b = allocateJob([mk("m", "2026-01-01"), mk("n", "2026-01-01")], rules);
    expect(toRecord(b.get("m")!.allocations)[P]).toBe(K(6_000));
    const c = allocateJob([mk("n", "2026-01-01"), mk("m", "2026-01-01")], rules);
    expect(toRecord(c.get("m")!.allocations)[P]).toBe(K(6_000));
  });

  it("allocateJob: zrušené platby nespotřebují nic a nejsou ve výsledku; ruční také ne", () => {
    const payments: JobPayment[] = [
      { ...pay(6_000), id: "c", issuedOn: "2026-09-01", status: "canceled" },
      {
        ...pay(6_000),
        id: "m",
        issuedOn: "2026-09-15",
        allocationMode: "manual",
        manualAllocations: [{ userId: O, amountMinor: K(6_000) }],
      },
      { ...pay(6_000), id: "d", issuedOn: "2026-10-01" },
    ];
    const out = allocateJob(payments, rules);
    expect(out.has("c")).toBe(false);
    expect(out.get("m")?.mode).toBe("manual");
    expect(toRecord(out.get("d")!.allocations)).toEqual({ [P]: K(6_000), [O]: 0 });
  });

  it("allocateJob: plánovaná platba bez data vystavení se řadí podle měsíce, bez data úplně nakonec", () => {
    const payments: JobPayment[] = [
      { kind: "extra", amountMinor: K(6_000), issuerId: O, id: "nodate", status: "planned" },
      { kind: "retainer", amountMinor: K(6_000), issuerId: O, id: "m1", periodMonth: "2026-10" },
      { kind: "retainer", amountMinor: K(6_000), issuerId: O, id: "m2", periodMonth: "2026-11" },
    ];
    const out = allocateJob(payments, rules, { today: "2026-10-14" });
    expect(toRecord(out.get("m1")!.allocations)[P]).toBe(K(6_000));
    expect(toRecord(out.get("m2")!.allocations)[P]).toBe(K(4_000));
    expect(toRecord(out.get("nodate")!.allocations)[P]).toBe(0);
  });

  it("fixed_total se spotřebuje jen z plateb, na které pravidlo platí (applies_to)", () => {
    const r = [
      { ...fixedTotal(P, 10_000, { appliesTo: "intro" }), id: "ft" },
      pct(O, 100, { appliesTo: "intro" }),
    ];
    const payments: JobPayment[] = [
      { ...pay(6_000), id: "o", kind: "one_off", issuedOn: "2026-09-01" },
      { ...pay(6_000), id: "i", kind: "intro", issuedOn: "2026-10-01" },
    ];
    const out = allocateJob(payments, r);
    expect(out.get("o")?.mode).toBe("issuer_only");
    expect(toRecord(out.get("i")!.allocations)[P]).toBe(K(6_000));
  });
});

describe("allocate: ruční přepis", () => {
  it("vrátí uložené alokace v režimu manual (štítek „Rozděleno ručně“)", () => {
    const r = allocate(
      {
        ...pay(1_000),
        allocationMode: "manual",
        manualAllocations: [
          { userId: O, amountMinor: K(250) },
          { userId: P, amountMinor: K(750) },
        ],
      },
      [pct(O, 50), pct(P, 50)],
    );
    expect(r.mode).toBe("manual");
    expect(toRecord(r.allocations)).toEqual({ [O]: K(250), [P]: K(750) });
  });

  it("součet musí sedět, osoby se nesmí opakovat, částky nejsou záporné", () => {
    expectCode(
      () => manualAllocation(1_000, [{ userId: O, amountMinor: 999 }]),
      "allocation_sum_mismatch",
    );
    expectCode(
      () =>
        manualAllocation(1_000, [
          { userId: O, amountMinor: 500 },
          { userId: O, amountMinor: 500 },
        ]),
      "allocation_duplicate_user",
    );
    expectCode(
      () =>
        manualAllocation(1_000, [
          { userId: O, amountMinor: 1_100 },
          { userId: P, amountMinor: -100 },
        ]),
      "invalid_amount",
    );
  });
});

describe("allocate: validace vstupu", () => {
  it("částka musí být kladné celé číslo haléřů", () => {
    expectCode(() => allocate({ ...pay(1), amountMinor: 0 }, []), "invalid_amount");
    expectCode(() => allocate({ ...pay(1), amountMinor: -5 }, []), "invalid_amount");
    expectCode(() => allocate({ ...pay(1), amountMinor: 10.5 }, []), "invalid_amount");
    expectCode(() => allocate({ ...pay(1), amountMinor: Number.NaN }, []), "invalid_amount");
  });
  it("fakturující je povinný", () => {
    expectCode(() => allocate({ ...pay(1), issuerId: "" }, []), "invalid_user");
  });
  it("neplatná pravidla vyhodí chybu s popisem", () => {
    expectCode(() => allocate(pay(1), [pct(O, 0)]), "invalid_percent");
    expectCode(() => allocate(pay(1), [pct(O, 101)]), "invalid_percent");
    expectCode(() => allocate(pay(1), [pct(O, 12.345678)]), "invalid_percent");
    expectCode(() => allocate(pay(1), [pct(O, "abc")]), "invalid_percent");
    expectCode(
      () => allocate(pay(1), [{ userId: O, mode: "percent", appliesTo: "all" }]),
      "invalid_percent",
    );
    expectCode(() => allocate(pay(1), [{ ...fixedPer(O, 1), fixedMinor: -1 }]), "invalid_fixed");
    expectCode(() => allocate(pay(1), [{ ...fixedPer(O, 1), fixedMinor: 1.5 }]), "invalid_fixed");
    expectCode(() => allocate(pay(1), [pct("", 50)]), "invalid_user");
    expectCode(
      () => allocate(pay(1), [pct(O, 50, { validFromMonth: "2026-13" })]),
      "invalid_month",
    );
    expectCode(
      () => allocate(pay(1), [pct(O, 50, { validFromMonth: "2027-01", validToMonth: "2026-12" })]),
      "invalid_validity",
    );
  });
  it("chyba přenáší seznam všech nálezů", () => {
    try {
      allocate(pay(1), [pct(O, 0), fixedPer(P, 1, { fixedMinor: -1 })]);
      throw new Error("mělo vyhodit");
    } catch (e) {
      expect((e as FinanceLogicError).issues.map((i) => i.code)).toEqual([
        "invalid_percent",
        "invalid_fixed",
      ]);
    }
  });
});

describe("validateSplitRules (FIN-07, R-11)", () => {
  it("100 % je v pořádku, žádné nálezy", () => {
    expect(validateSplitRules([pct(O, 60), pct(P, 40)])).toEqual([]);
    expect(validateSplitRules([])).toEqual([]);
    expect(validateSplitRules([fixedPer(O, 10_000)])).toEqual([]);
  });

  it("součet > 100 % je chyba, < 100 % varování; hlásí se po druzích platby", () => {
    const over = validateSplitRules([pct(O, 70), pct(P, 40)]);
    expect(hasErrors(over)).toBe(true);
    expect(over.map((i) => i.kind).sort()).toEqual(["extra", "intro", "one_off", "retainer"]);
    expect(over[0]?.message).toMatch(/110 %/);
    const under = validateSplitRules([pct(O, 50, { appliesTo: "retainer" })]);
    expect(hasErrors(under)).toBe(false);
    expect(under).toHaveLength(1);
    expect(under[0]).toMatchObject({
      severity: "warning",
      code: "percent_under_100",
      kind: "retainer",
    });
  });

  it("zohledňuje úseky platnosti (retainer do 12/2026 a od 01/2027)", () => {
    const rules = [
      pct(O, 70, { appliesTo: "retainer", validToMonth: "2026-12" }),
      pct(P, 30, { appliesTo: "retainer", validToMonth: "2026-12" }),
      pct(O, 50, { appliesTo: "retainer", validFromMonth: "2027-01" }),
      pct(P, 50, { appliesTo: "retainer", validFromMonth: "2027-01" }),
    ];
    expect(validateSplitRules(rules)).toEqual([]);
    const bad = validateSplitRules([
      ...rules.slice(0, 3),
      pct(P, 60, { appliesTo: "retainer", validFromMonth: "2027-01" }),
    ]);
    expect(bad).toHaveLength(1);
    expect(bad[0]).toMatchObject({
      code: "percent_over_100",
      fromMonth: "2027-01",
      percentSum: 110,
    });
    expect(bad[0]?.message).toContain("od 01/2027");
  });

  it("konkrétní druh přebíjí all i při validaci", () => {
    const rules = [
      pct(O, 100),
      pct(O, 60, { appliesTo: "retainer" }),
      pct(P, 40, { appliesTo: "retainer" }),
    ];
    expect(validateSplitRules(rules)).toEqual([]);
  });

  it("neplatná pole vrátí chyby místo výjimky", () => {
    const issues = validateSplitRules([pct(O, 0)]);
    expect(hasErrors(issues)).toBe(true);
    expect(issues[0]?.code).toBe("invalid_percent");
  });
});

describe("pomocné funkce", () => {
  it("recalcNeedsConfirmation: jen u Zaplacené (FIN-13)", () => {
    expect(recalcNeedsConfirmation("paid")).toBe(true);
    expect(recalcNeedsConfirmation("issued")).toBe(false);
    expect(recalcNeedsConfirmation("planned")).toBe(false);
    expect(recalcNeedsConfirmation(undefined)).toBe(false);
  });
  it("allocationsDiffer ignoruje pořadí a nuly", () => {
    expect(
      allocationsDiffer(
        [
          { userId: O, amountMinor: 5 },
          { userId: P, amountMinor: 0 },
        ],
        [{ userId: O, amountMinor: 5 }],
      ),
    ).toBe(false);
    expect(
      allocationsDiffer([{ userId: O, amountMinor: 5 }], [{ userId: O, amountMinor: 6 }]),
    ).toBe(true);
  });
});
