import { describe, expect, it } from "vitest";
import { UserError } from "@rebar/core/rbac";
import { preparePoints } from "./points";

describe("příprava kontaktních údajů (KON-01)", () => {
  it("opakování (jiný zápis téhož čísla) se spojí a zůstane jeden hlavní od každého druhu", () => {
    const out = preparePoints([
      { kind: "phone", value: "602 111 222", label: "mobile" },
      { kind: "phone", value: "+420602111222", isPrimary: true },
      { kind: "phone", value: "+421 905 000 111" },
      { kind: "email", value: "A@Example.cz" },
      { kind: "email", value: "b@example.cz", isPrimary: true },
      { kind: "email", value: " " },
    ]);
    expect(out.map((p) => [p.kind, p.valueNorm, p.isPrimary, p.label])).toEqual([
      ["phone", "+420602111222", true, "mobile"],
      ["phone", "+421905000111", false, null],
      ["email", "a@example.cz", false, null],
      ["email", "b@example.cz", true, null],
    ]);
  });

  it("bez označeného hlavního je hlavní první údaj daného druhu", () => {
    const out = preparePoints([
      { kind: "email", value: "x@example.cz" },
      { kind: "email", value: "y@example.cz" },
    ]);
    expect(out.map((p) => p.isPrimary)).toEqual([true, false]);
  });

  it("špatný tvar je věta pro uživatele", () => {
    expect(() => preparePoints([{ kind: "email", value: "není" }])).toThrow(UserError);
    expect(() => preparePoints([{ kind: "phone", value: "12" }])).toThrow(/Telefon/);
  });
});
