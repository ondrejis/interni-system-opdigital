import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, mayApproveAll, mayDecide, pickRule, type RuleLike } from "./rules";

const rule = (p: Partial<RuleLike> & Pick<RuleLike, "minAmountMinor">): RuleLike => ({
  id: `r-${p.minAmountMinor}`,
  docType: "change",
  approverPermission: "zakazky.approve",
  approverId: null,
  active: true,
  ...p,
});

describe("vyhodnocení pravidel", () => {
  const rules = [
    rule({ minAmountMinor: 5_000_00 }),
    rule({ minAmountMinor: 50_000_00, approverPermission: "zakazky.approve_all" }),
    rule({ minAmountMinor: 1_000_000_00, docType: "order" }),
  ];

  it("pod nejnižším limitem se doklad schválí hned (žádné pravidlo)", () => {
    expect(pickRule(rules, "change", 4_999_99)).toBeNull();
  });

  it("platí nejvyšší pravidlo, jehož limit nepřevyšuje částku", () => {
    expect(pickRule(rules, "change", 5_000_00)?.minAmountMinor).toBe(5_000_00);
    expect(pickRule(rules, "change", 49_999_99)?.minAmountMinor).toBe(5_000_00);
    expect(pickRule(rules, "change", 50_000_00)?.approverPermission).toBe("zakazky.approve_all");
  });

  it("částka se posuzuje v absolutní hodnotě (méněpráce neobejde schvalování)", () => {
    expect(pickRule(rules, "change", -60_000_00)?.approverPermission).toBe("zakazky.approve_all");
  });

  it("pravidla jiného typu a vypnutá pravidla se ignorují; typ bez pravidla se schválí hned", () => {
    expect(pickRule(rules, "statement", 9_999_999_00)).toBeNull();
    expect(pickRule([rule({ minAmountMinor: 0, active: false })], "change", 1)).toBeNull();
  });

  it("výchozí pravidla mají pro každý typ limit 50 000 Kč", () => {
    const defaults = DEFAULT_RULES.map((r, i) => ({ ...r, id: String(i), active: true }));
    expect(pickRule(defaults, "statement", 10_000_00)?.approverPermission).toBe("zakazky.approve");
    expect(pickRule(defaults, "received_invoice", 50_000_00)?.approverPermission).toBe(
      "zakazky.approve_all",
    );
  });
});

describe("kdo smí rozhodnout", () => {
  const held = (...p: [string, "all" | "own"][]) => new Map(p);
  const base = { userId: "u1", jobOwnerIds: ["u1"] };

  it("držitel approve smí do limitu, nad limit potřebuje approve_all", () => {
    const high = rule({ minAmountMinor: 1, approverPermission: "zakazky.approve_all" });
    expect(
      mayDecide({
        ...base,
        rule: rule({ minAmountMinor: 1 }),
        held: held(["zakazky.approve", "all"]),
      }),
    ).toBe(true);
    expect(mayDecide({ ...base, rule: high, held: held(["zakazky.approve", "all"]) })).toBe(false);
    expect(mayDecide({ ...base, rule: high, held: held(["zakazky.approve_all", "all"]) })).toBe(
      true,
    );
  });

  it("rozsah „jen moje“ stačí jen u zakázky, kde je aktér v týmu", () => {
    const h = held(["zakazky.approve", "own"]);
    const r = rule({ minAmountMinor: 1 });
    expect(mayDecide({ rule: r, held: h, userId: "u1", jobOwnerIds: ["u1", "u2"] })).toBe(true);
    expect(mayDecide({ rule: r, held: h, userId: "u1", jobOwnerIds: ["u2"] })).toBe(false);
  });

  it("pravidlo s konkrétním schvalovatelem pustí jen jeho a držitele approve_all", () => {
    const r = rule({ minAmountMinor: 1, approverId: "boss" });
    expect(
      mayDecide({ rule: r, held: held(["zakazky.approve", "all"]), userId: "u1", jobOwnerIds: [] }),
    ).toBe(false);
    expect(mayDecide({ rule: r, held: held(), userId: "boss", jobOwnerIds: [] })).toBe(true);
    expect(
      mayDecide({
        rule: r,
        held: held(["zakazky.approve_all", "all"]),
        userId: "u1",
        jobOwnerIds: [],
      }),
    ).toBe(true);
  });

  it("bez oprávnění nic; systém smí vždy", () => {
    expect(mayDecide({ ...base, rule: null, held: held() })).toBe(false);
    expect(mayDecide({ ...base, rule: null, held: held(), unrestricted: true })).toBe(true);
    expect(mayApproveAll(held(["zakazky.approve", "all"]))).toBe(false);
    expect(mayApproveAll(held(["zakazky.approve_all", "own"]))).toBe(true);
  });
});
