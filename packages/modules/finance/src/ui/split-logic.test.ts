import { describe, expect, it } from "vitest";
import type { SplitRuleInput } from "@rebar/core/contracts";
import { blocking, defaultPreviewKind, fiftyFifty, previewText, ruleIssues } from "./split-logic";

const O = "00000000-0000-4000-8000-000000000001";
const P = "00000000-0000-4000-8000-000000000002";
const names = { [O]: "Ondřej", [P]: "Patrik" };
const nb = (s: string) => s.split(String.fromCharCode(160)).join(" ");

describe("náhled rozdělení v editoru", () => {
  it("60/40 z 10 000 Kč: Ondřej 6 000, Patrik 4 000", () => {
    const rules: SplitRuleInput[] = [
      { userId: O, mode: "percent", percent: 60, appliesTo: "all" },
      { userId: P, mode: "percent", percent: 40, appliesTo: "all" },
    ];
    const r = previewText({ rules, amountMinor: 1_000_000, kind: "one_off", issuerId: O, names });
    expect(nb(r.text)).toBe("Z platby 10 000 Kč dostane Ondřej 6 000 Kč, Patrik 4 000 Kč.");
    expect(r.error).toBeNull();
  });

  it("součet procent nad 100 % je chyba, která blokuje uložení", () => {
    const rules = fiftyFifty(O, P).map((r) => ({ ...r, percent: 60 }));
    expect(blocking(ruleIssues(rules))).toBe(true);
    expect(
      previewText({ rules, amountMinor: 1_000_000, kind: "one_off", issuerId: O, names }).error,
    ).toMatch(/100/);
  });

  it("součet procent pod 100 % je jen upozornění", () => {
    const rules: SplitRuleInput[] = [{ userId: O, mode: "percent", percent: 70, appliesTo: "all" }];
    const issues = ruleIssues(rules);
    expect(issues.some((i) => i.code === "percent_under_100")).toBe(true);
    expect(blocking(issues)).toBe(false);
  });

  it("platnost od–do: retainer 70/30 do 12/2026, od 01/2027 50/50 (AS-04)", () => {
    const rules: SplitRuleInput[] = [
      { userId: O, mode: "percent", percent: 70, appliesTo: "retainer", validTo: "2026-12" },
      { userId: P, mode: "percent", percent: 30, appliesTo: "retainer", validTo: "2026-12" },
      { userId: O, mode: "percent", percent: 50, appliesTo: "retainer", validFrom: "2027-01" },
      { userId: P, mode: "percent", percent: 50, appliesTo: "retainer", validFrom: "2027-01" },
    ];
    expect(blocking(ruleIssues(rules))).toBe(false);
    const dec = previewText({
      rules,
      amountMinor: 1_500_000,
      kind: "retainer",
      issuerId: O,
      month: "2026-12",
      names,
    });
    expect(nb(dec.text)).toBe("Z platby 15 000 Kč dostane Ondřej 10 500 Kč, Patrik 4 500 Kč.");
    const jan = previewText({
      rules,
      amountMinor: 1_500_000,
      kind: "retainer",
      issuerId: O,
      month: "2027-01",
      names,
    });
    expect(nb(jan.text)).toBe("Z platby 15 000 Kč dostane Ondřej 7 500 Kč, Patrik 7 500 Kč.");
  });

  it("výchozí druh náhledu podle pravidel", () => {
    expect(defaultPreviewKind(fiftyFifty(O, P))).toBe("one_off");
    expect(
      defaultPreviewKind([{ userId: O, mode: "percent", percent: 100, appliesTo: "retainer" }]),
    ).toBe("retainer");
  });
});
