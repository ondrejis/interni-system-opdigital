/*
  Povinné scénáře FIN-22 (8 řádků tabulky), příklady z 00-spec (Finance → Příklady), AS-02, AS-03 (část logiky) a AS-04.
  Prochází celý řetěz: pravidla → alokace platby → saldo → vyrovnání.
*/
import { describe, expect, it } from "vitest";
import {
  allocate,
  allocateJob,
  balance,
  describeBalance,
  previewSplit,
  retainerSchedule,
  toRecord,
  type BalancePayment,
  type JobPayment,
  type PaymentKind,
  type RuleKind,
  type SplitRule,
} from "./index";

const O = "ondrej";
const P = "patrik";
const people = { [O]: { name: "Ondřej" }, [P]: { name: "Patrik" } };
const K = (czk: number) => Math.round(czk * 100);

const pct = (userId: string, percent: number, extra: Partial<SplitRule> = {}): SplitRule => ({
  userId,
  mode: "percent",
  percent,
  appliesTo: "all",
  ...extra,
});

/** Rozdělí platbu a vyrobí z ní zaplacenou platbu pro `balance`. */
function paidPayment(
  id: string,
  amountMinor: number,
  issuerId: string,
  rules: SplitRule[],
  kind: PaymentKind = "one_off",
  periodMonth?: string,
): BalancePayment {
  const r = allocate(
    {
      kind,
      amountMinor,
      issuerId,
      issuedOn: "2026-10-01",
      ...(periodMonth ? { periodMonth } : {}),
    },
    rules,
  );
  return {
    id,
    status: "paid",
    kind,
    amountMinor,
    issuerId,
    issuedOn: "2026-10-01",
    paidOn: "2026-10-20",
    allocations: r.allocations,
  };
}

describe("FIN-22 scénář 1: web 50 000 Kč, fakturuje Ondřej, 60/40", () => {
  const rules = [pct(O, 60), pct(P, 40)];
  it("alokace O 30 000 / P 20 000, Ondřej dluží Patrikovi 20 000 Kč", () => {
    const p = paidPayment("web", K(50_000), O, rules);
    expect(toRecord(p.allocations)).toEqual({ [O]: K(30_000), [P]: K(20_000) });
    const b = balance([p]);
    expect(b.headline).toEqual({ debtorId: O, creditorId: P, amountMinor: K(20_000) });
    expect(describeBalance(b, people)).toBe("Ondřej dluží Patrikovi 20 000 Kč");
    expect(describeBalance(b, people, { nbsp: false })).toBe("Ondřej dluží Patrikovi 20 000 Kč");
  });
});

describe("FIN-22 scénář 2: úvodní fáze 2 × 7 000 Kč, 1. fakturuje Patrik, 2. Ondřej, 50/50", () => {
  const rules = [pct(O, 50), pct(P, 50)];
  it("každá platba O 3 500 / P 3 500, saldo 0", () => {
    const p1 = paidPayment("i1", K(7_000), P, rules, "intro");
    const p2 = paidPayment("i2", K(7_000), O, rules, "intro");
    for (const p of [p1, p2])
      expect(toRecord(p.allocations)).toEqual({ [O]: K(3_500), [P]: K(3_500) });
    const b = balance([p1, p2]);
    expect(b.headline).toBeNull();
    expect(b.pairs).toEqual([]);
    // hrubě: Patrik dluží Ondřejovi 3 500 a naopak → vyruší se i před vyrovnáními
    expect(b.grossPairs).toEqual([]);
    expect(describeBalance(b, people)).toBe("Vyrovnáno");
  });
  it("zaplacená jen první platba: Patrik dluží Ondřejovi 3 500 Kč; na základu „vystavené“ je vyrovnáno", () => {
    const p1 = paidPayment("i1", K(7_000), P, rules, "intro");
    const p2 = {
      ...paidPayment("i2", K(7_000), O, rules, "intro"),
      status: "issued" as const,
      paidOn: null,
    };
    expect(balance([p1, p2]).headline).toEqual({
      debtorId: P,
      creditorId: O,
      amountMinor: K(3_500),
    });
    expect(balance([p1, p2], [], { basis: "issued" }).headline).toBeNull();
  });
});

describe("FIN-22 scénář 3: systém 80 000 Kč, fakturuje Patrik, Ondřej fixně 10 000 / platba, Patrik zbytek", () => {
  const variants: [string, SplitRule[]][] = [
    [
      "Patrik 100 % zbytku",
      [
        { userId: O, mode: "fixed_per_payment", fixedMinor: K(10_000), appliesTo: "all" },
        pct(P, 100),
      ],
    ],
    [
      "Patrik bez pravidla (zbytek fakturujícímu)",
      [{ userId: O, mode: "fixed_per_payment", fixedMinor: K(10_000), appliesTo: "all" }],
    ],
  ];
  for (const [label, rules] of variants) {
    it(`O 10 000, P 70 000, Patrik dluží Ondřejovi 10 000 Kč — ${label}`, () => {
      const p = paidPayment("sys", K(80_000), P, rules);
      expect(toRecord(p.allocations)).toEqual({ [O]: K(10_000), [P]: K(70_000) });
      expect(balance([p]).headline).toEqual({ debtorId: P, creditorId: O, amountMinor: K(10_000) });
    });
  }
});

describe("FIN-22 scénář 4: 333,33 Kč, fakturuje Ondřej, 50/50", () => {
  it("P 166,66, O 166,67, Ondřej dluží Patrikovi 166,66 Kč", () => {
    const p = paidPayment("x", 33_333, O, [pct(O, 50), pct(P, 50)]);
    expect(toRecord(p.allocations)).toEqual({ [O]: 16_667, [P]: 16_666 });
    const b = balance([p]);
    expect(b.headline).toEqual({ debtorId: O, creditorId: P, amountMinor: 16_666 });
    expect(describeBalance(b, people, { nbsp: false })).toBe("Ondřej dluží Patrikovi 166,66 Kč");
  });
});

describe("FIN-22 scénář 5 / AS-02: scénář 1 + vyrovnání O→P 20 000 Kč", () => {
  it("Plánovaná → Vystavená → Zaplacená, vyrovnání vynuluje saldo, storno vrátí dluh", () => {
    const rules = [pct(O, 60), pct(P, 40)];
    const alloc = allocate({ kind: "one_off", amountMinor: K(50_000), issuerId: O }, rules, {
      today: "2026-10-01",
    });
    const base: BalancePayment = {
      id: "web",
      status: "planned",
      kind: "one_off",
      amountMinor: K(50_000),
      issuerId: O,
      allocations: alloc.allocations,
    };
    expect(toRecord(alloc.allocations)).toEqual({ [O]: K(30_000), [P]: K(20_000) });
    // plánovaná platba do salda nevstupuje
    expect(balance([base]).headline).toBeNull();
    // vystavená: jen na základu „vystavené“
    const issued = { ...base, status: "issued" as const, issuedOn: "2026-10-01" };
    expect(balance([issued]).headline).toBeNull();
    expect(balance([issued], [], { basis: "issued" }).headline?.amountMinor).toBe(K(20_000));
    // zaplacená
    const paid = { ...issued, status: "paid" as const, paidOn: "2026-10-25" };
    expect(balance([paid]).headline).toEqual({
      debtorId: O,
      creditorId: P,
      amountMinor: K(20_000),
    });
    // vyrovnání O → P 20 000
    const settlement = {
      id: "s1",
      fromUserId: O,
      toUserId: P,
      amountMinor: K(20_000),
      settledOn: "2026-10-31",
    };
    const settled = balance([paid], [settlement]);
    expect(settled.headline).toBeNull();
    expect(describeBalance(settled, people)).toBe("Vyrovnáno");
    expect(settled.settlementsApplied).toBe(1);
    // storno vrátí dluh
    const reverted = balance([paid], [{ ...settlement, canceledAt: "2026-11-01T10:00:00Z" }]);
    expect(reverted.headline).toEqual({ debtorId: O, creditorId: P, amountMinor: K(20_000) });
    expect(reverted.settlementsApplied).toBe(0);
  });
});

describe("FIN-22 scénář 6 / FIN-21 / AS-04: retainer 15 000 Kč, změna poměru od 01/2027", () => {
  const rules = [
    pct(O, 70, { appliesTo: "retainer", validToMonth: "2026-12" }),
    pct(P, 30, { appliesTo: "retainer", validToMonth: "2026-12" }),
    pct(O, 50, { appliesTo: "retainer", validFromMonth: "2027-01" }),
    pct(P, 50, { appliesTo: "retainer", validFromMonth: "2027-01" }),
  ];
  const retainer = (id: string, periodMonth: string, issuerId: string): JobPayment => ({
    id,
    kind: "retainer",
    amountMinor: K(15_000),
    issuerId,
    periodMonth,
  });

  it("12/2026: O 10 500 / P 4 500; 01/2027: O 7 500 / P 7 500; minulost se nepřepočítá", () => {
    const out = allocateJob([retainer("r12", "2026-12", O), retainer("r01", "2027-01", O)], rules);
    expect(toRecord(out.get("r12")!.allocations)).toEqual({ [O]: K(10_500), [P]: K(4_500) });
    expect(toRecord(out.get("r01")!.allocations)).toEqual({ [O]: K(7_500), [P]: K(7_500) });
    // přepočet celé zakázky později (např. po změně jiné platby) dá minulosti stejné podíly
    const again = allocateJob(
      [retainer("r01", "2027-01", O), retainer("r12", "2026-12", O)],
      rules,
    );
    expect(toRecord(again.get("r12")!.allocations)).toEqual({ [O]: K(10_500), [P]: K(4_500) });
  });

  it("saldo podle fakturujícího: fakturuje-li Ondřej, dluží Patrikovi 4 500 + 7 500", () => {
    const out = allocateJob([retainer("r12", "2026-12", O), retainer("r01", "2027-01", O)], rules);
    const payments: BalancePayment[] = ["r12", "r01"].map((id, i) => ({
      id,
      status: "paid",
      kind: "retainer",
      amountMinor: K(15_000),
      issuerId: O,
      periodMonth: i === 0 ? "2026-12" : "2027-01",
      issuedOn: i === 0 ? "2026-12-01" : "2027-01-01",
      paidOn: i === 0 ? "2026-12-15" : "2027-01-15",
      allocations: out.get(id)!.allocations,
    }));
    const b = balance(payments);
    expect(b.headline).toEqual({ debtorId: O, creditorId: P, amountMinor: K(12_000) });
    expect(b.months.map((m) => m.month)).toEqual(["2026-12", "2027-01"]);
    expect(b.months[0]?.debts).toEqual([{ debtorId: O, creditorId: P, amountMinor: K(4_500) }]);
    expect(b.months[1]?.debts).toEqual([{ debtorId: O, creditorId: P, amountMinor: K(7_500) }]);
  });

  it("příklad „Z platby 15 000 Kč“ v náhledu respektuje období", () => {
    const at = (month: string) =>
      previewSplit({ amountMinor: K(15_000), kind: "retainer", issuerId: O, month, rules, people })
        .text;
    expect(at("2026-12")).toBe("Z platby 15 000 Kč dostane Ondřej 10 500 Kč, Patrik 4 500 Kč.");
    expect(at("2027-01")).toBe("Z platby 15 000 Kč dostane Ondřej 7 500 Kč, Patrik 7 500 Kč.");
  });

  it("plán retaineru založí 12/2026 a 01/2027 s alokací dle období (AS-03/AS-04)", () => {
    const plan = retainerSchedule(
      {
        id: "ret",
        jobId: "job",
        amountMinor: K(15_000),
        fromMonth: "2026-12",
        issueDay: 5,
        issuerMode: "alternate",
        firstIssuerId: O,
        active: true,
      },
      { upToMonth: "2027-01", partnerIds: [O, P] },
    );
    expect(plan.map((p) => [p.description, p.issuerId, p.plannedIssuedOn])).toEqual([
      ["Retainer 12/2026", O, "2026-12-05"],
      ["Retainer 01/2027", P, "2027-01-05"],
    ]);
    const out = allocateJob(
      plan.map((p) => ({
        id: p.periodMonth,
        kind: p.kind,
        amountMinor: p.amountMinor,
        issuerId: p.issuerId,
        periodMonth: p.periodMonth,
      })),
      rules,
    );
    expect(toRecord(out.get("2026-12")!.allocations)).toEqual({ [O]: K(10_500), [P]: K(4_500) });
    expect(toRecord(out.get("2027-01")!.allocations)).toEqual({ [O]: K(7_500), [P]: K(7_500) });
  });
});

describe("FIN-22 scénář 7: Patrikovi fixně celkem 10 000 Kč, dvě platby po 6 000 Kč, zbytek Ondřej", () => {
  const rules: SplitRule[] = [
    { id: "ft", userId: P, mode: "fixed_total", fixedMinor: K(10_000), appliesTo: "all" },
    pct(O, 100),
  ];
  const payments = (issuer1: string, issuer2: string): JobPayment[] => [
    {
      id: "p1",
      kind: "one_off",
      amountMinor: K(6_000),
      issuerId: issuer1,
      issuedOn: "2026-10-01",
      createdAt: "2026-09-01T00:00:00Z",
    },
    {
      id: "p2",
      kind: "one_off",
      amountMinor: K(6_000),
      issuerId: issuer2,
      issuedOn: "2026-11-01",
      createdAt: "2026-09-02T00:00:00Z",
    },
  ];
  it("1.: P 6 000, O 0; 2.: P 4 000, O 2 000", () => {
    const out = allocateJob(payments(O, O), rules);
    expect(toRecord(out.get("p1")!.allocations)).toEqual({ [P]: K(6_000), [O]: 0 });
    expect(toRecord(out.get("p2")!.allocations)).toEqual({ [P]: K(4_000), [O]: K(2_000) });
  });
  it("saldo podle fakturujícího: fakturuje-li vždy Ondřej, dluží Patrikovi 10 000 Kč; u Patrika Patrik dluží 2 000", () => {
    const toBalance = (list: JobPayment[]): BalancePayment[] => {
      const out = allocateJob(list, rules);
      return list.map((p) => ({
        id: p.id,
        status: "paid",
        kind: p.kind,
        amountMinor: p.amountMinor,
        issuerId: p.issuerId,
        issuedOn: p.issuedOn ?? null,
        paidOn: p.issuedOn ?? null,
        allocations: out.get(p.id)!.allocations,
      }));
    };
    expect(balance(toBalance(payments(O, O))).headline).toEqual({
      debtorId: O,
      creditorId: P,
      amountMinor: K(10_000),
    });
    expect(balance(toBalance(payments(P, P))).headline).toEqual({
      debtorId: P,
      creditorId: O,
      amountMinor: K(2_000),
    });
  });
});

describe("FIN-22 scénář 8: platba bez pravidel", () => {
  it("100 % fakturujícímu, saldo 0", () => {
    const p = paidPayment("bez", K(12_345.67), P, []);
    expect(toRecord(p.allocations)).toEqual({ [P]: K(12_345.67) });
    expect(balance([p]).headline).toBeNull();
  });
});

describe("živý náhled (FIN-04)", () => {
  it("„Z platby 10 000 Kč dostane Ondřej 6 000 Kč, Patrik 4 000 Kč.“", () => {
    const r = previewSplit({
      amountMinor: K(10_000),
      issuerId: O,
      today: "2026-10-14",
      rules: [pct(O, 60), pct(P, 40)],
      people,
    });
    expect(r.error).toBeNull();
    expect(r.text.replace(/\u00a0/g, " ")).toBe(
      "Z platby 10 000 Kč dostane Ondřej 6 000 Kč, Patrik 4 000 Kč.",
    );
  });
  it("vynechá osoby s 0 Kč a ukáže haléře", () => {
    const r = previewSplit({
      amountMinor: 33_333,
      issuerId: O,
      today: "2026-10-14",
      rules: [pct(O, 50), pct(P, 50)],
      people,
    });
    expect(r.text.replace(/\u00a0/g, " ")).toBe(
      "Z platby 333,33 Kč dostane Ondřej 166,67 Kč, Patrik 166,66 Kč.",
    );
    const fixed = previewSplit({
      amountMinor: K(6_000),
      issuerId: O,
      today: "2026-10-14",
      rules: [
        { id: "ft", userId: P, mode: "fixed_total", fixedMinor: K(10_000), appliesTo: "all" },
        pct(O, 100),
      ],
      people,
    });
    expect(fixed.text.replace(/\u00a0/g, " ")).toBe("Z platby 6 000 Kč dostane Patrik 6 000 Kč.");
  });
  it("chybná pravidla nevyhodí výjimku, ale vrátí chybu", () => {
    const r = previewSplit({
      amountMinor: K(10_000),
      issuerId: O,
      today: "2026-10-14",
      rules: [pct(O, 70), pct(P, 50)],
      people,
    });
    expect(r.text).toBe("");
    expect(r.error).toMatch(/nesmí přesáhnout 100 %/);
  });
  it("bez pravidel: celá platba fakturujícímu", () => {
    const r = previewSplit({
      amountMinor: K(1_000),
      issuerId: P,
      today: "2026-10-14",
      rules: [],
      people,
    });
    expect(r.text.replace(/\u00a0/g, " ")).toBe("Z platby 1 000 Kč dostane Patrik 1 000 Kč.");
  });
});

/* ---------- property testy: součet podílů == částka platby vždy ---------- */

/** Deterministický generátor (mulberry32), aby byly testy opakovatelné. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("property: součet alokací == částka platby", () => {
  const users = [O, P, "jana"];
  const kinds: RuleKind[] = ["one_off", "intro", "retainer", "extra"];

  function randomRules(rand: () => number): SplitRule[] {
    const rules: SplitRule[] = [];
    const count = Math.floor(rand() * 5);
    // procenta na 4 desetinná místa, součet ≤ 100 % (u každé skupiny)
    let budget = 1_000_000;
    for (let i = 0; i < count; i++) {
      const user = users[Math.floor(rand() * users.length)]!;
      const appliesTo = rand() < 0.5 ? "all" : kinds[Math.floor(rand() * kinds.length)]!;
      const mode = ["percent", "fixed_per_payment", "fixed_total"][
        Math.floor(rand() * 3)
      ] as SplitRule["mode"];
      const base = {
        id: `r${i}`,
        userId: user,
        appliesTo,
        position: Math.floor(rand() * 4),
      } as const;
      if (mode === "percent") {
        const units = Math.min(budget, 1 + Math.floor(rand() * budget));
        // aby součet přes všechny skupiny nikdy nepřekročil 100 %, čerpáme z jednoho rozpočtu
        budget -= units;
        rules.push({ ...base, mode, percent: units / 10_000 });
      } else {
        rules.push({ ...base, mode, fixedMinor: Math.floor(rand() * 5_000_000) });
      }
    }
    return rules;
  }

  it("2 000 náhodných plateb a pravidel: součet přesně sedí, nic záporného, fixní nepřesáhne částku", () => {
    const rand = rng(20261014);
    for (let n = 0; n < 2000; n++) {
      const rules = randomRules(rand);
      const amountMinor = 1 + Math.floor(rand() * 20_000_000);
      const kind = kinds[Math.floor(rand() * kinds.length)]!;
      const r = allocate(
        { kind, amountMinor, issuerId: users[Math.floor(rand() * 2)]!, periodMonth: "2026-10" },
        rules,
        {
          fixedTotalConsumed: {
            r0: Math.floor(rand() * 3_000_000),
            r1: Math.floor(rand() * 3_000_000),
          },
        },
      );
      const sum = r.allocations.reduce((s, a) => s + a.amountMinor, 0);
      expect(sum).toBe(amountMinor);
      for (const a of r.allocations) {
        expect(Number.isSafeInteger(a.amountMinor)).toBe(true);
        expect(a.amountMinor).toBeGreaterThanOrEqual(0);
      }
      expect(new Set(r.allocations.map((a) => a.userId)).size).toBe(r.allocations.length);
    }
  });

  it("dvě procenta (4 desetinná místa) rozdělují libovolnou částku beze zbytku a fakturující dostane méně než 1 haléř navíc na osobu", () => {
    const rand = rng(7);
    for (let n = 0; n < 2000; n++) {
      const units = 1 + Math.floor(rand() * 999_999);
      const amountMinor = 1 + Math.floor(rand() * 9_000_000_000_000);
      const r = allocate({ kind: "one_off", amountMinor, issuerId: O, issuedOn: "2026-10-01" }, [
        pct(O, units / 10_000),
        pct(P, (1_000_000 - units) / 10_000),
      ]);
      const rec = toRecord(r.allocations);
      expect((rec[O] ?? 0) + (rec[P] ?? 0)).toBe(amountMinor);
      // Patrik dostal přesně podlahu svého podílu (BigInt kontrola bez plovoucí čárky)
      expect(BigInt(rec[P] ?? 0)).toBe(
        (BigInt(amountMinor) * BigInt(1_000_000 - units)) / 1_000_000n,
      );
    }
  });

  it("allocateJob: součet vždy sedí a fixed_total se nikdy nespotřebuje víc, než je", () => {
    const rand = rng(99);
    for (let n = 0; n < 300; n++) {
      const total = 1 + Math.floor(rand() * 5_000_000);
      const rules: SplitRule[] = [
        { id: "ft", userId: P, mode: "fixed_total", fixedMinor: total, appliesTo: "all" },
        pct(O, 100),
      ];
      const payments: JobPayment[] = Array.from({ length: 1 + Math.floor(rand() * 6) }, (_, i) => ({
        id: `p${i}`,
        kind: "one_off",
        amountMinor: 1 + Math.floor(rand() * 2_000_000),
        issuerId: rand() < 0.5 ? O : P,
        issuedOn: `2026-${String(1 + Math.floor(rand() * 12)).padStart(2, "0")}-01`,
        createdAt: `2026-01-01T00:00:${String(i).padStart(2, "0")}Z`,
      }));
      const out = allocateJob(payments, rules);
      let patrik = 0;
      for (const p of payments) {
        const a = out.get(p.id)!;
        expect(a.allocations.reduce((s, x) => s + x.amountMinor, 0)).toBe(p.amountMinor);
        patrik += toRecord(a.allocations)[P] ?? 0;
      }
      const expected = Math.min(
        total,
        payments.reduce((s, p) => s + p.amountMinor, 0),
      );
      // Patrik dostane právě fixní částku (jinak by zbytek šel Ondřejovi), pokud ji platby pokryjí
      expect(patrik).toBeLessThanOrEqual(total);
      expect(patrik).toBeGreaterThanOrEqual(0);
      expect(toRecord(out.get(payments[0]!.id)!.allocations)[P]).toBeGreaterThanOrEqual(0);
      if (payments.every((p) => p.issuerId === O)) expect(patrik).toBe(expected);
    }
  });

  it("saldo je antisymetrické a součet rozdílů za měsíc je 0", () => {
    const rand = rng(5);
    for (let n = 0; n < 300; n++) {
      const rules = [pct(O, 1 + Math.floor(rand() * 99)), pct(P, 0.01)];
      // druhé pravidlo záměrně dorovnáme, aby součet nebyl > 100
      const first = rules[0]!;
      rules[1] = pct(P, 100 - Number(first.percent));
      const payments: BalancePayment[] = Array.from(
        { length: 1 + Math.floor(rand() * 8) },
        (_, i) => {
          const amountMinor = 1 + Math.floor(rand() * 10_000_000);
          const issuerId = rand() < 0.5 ? O : P;
          const r = allocate(
            { kind: "one_off", amountMinor, issuerId, issuedOn: "2026-10-01" },
            rules,
          );
          return {
            id: `p${i}`,
            status: "paid",
            amountMinor,
            issuerId,
            paidOn: `2026-${String(1 + Math.floor(rand() * 12)).padStart(2, "0")}-10`,
            allocations: r.allocations,
          };
        },
      );
      const b = balance(payments);
      const swapped = balance(
        payments.map((p) => ({
          ...p,
          issuerId: p.issuerId === O ? P : O,
          allocations: p.allocations.map((a) => ({ ...a, userId: a.userId === O ? P : O })),
        })),
      );
      expect(b.headline?.amountMinor ?? 0).toBe(swapped.headline?.amountMinor ?? 0);
      for (const m of b.months) {
        expect(Object.values(m.difference).reduce((s, v) => s + v, 0)).toBe(0);
      }
    }
  });
});
