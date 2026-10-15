import { describe, expect, it } from "vitest";
import type { FilterGroup } from "@rebar/core/shared";
import { decodeFilter, encodeFilter, sameFilter, withListParams } from "./list-url";

const F: FilterGroup = {
  op: "and",
  conditions: [
    { attr: "assignee", op: "is_me" },
    { attr: "title", op: "contains", value: "Příliš žluťoučký kůň ěščř" },
  ],
};

describe("filtr seznamu v adrese", () => {
  it("projde tam a zpět včetně diakritiky", () => {
    const s = encodeFilter(F)!;
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeFilter(s)).toEqual(F);
  });
  it("prázdný filtr se do adresy nezapisuje", () => {
    expect(encodeFilter(undefined)).toBeNull();
    expect(encodeFilter({ op: "and", conditions: [] })).toBeNull();
  });
  it("poškozený nebo podvržený parametr je ignorován", () => {
    expect(decodeFilter("!!!")).toBeUndefined();
    expect(
      decodeFilter(btoa(JSON.stringify({ op: "and", conditions: [{ attr: "a", op: "drop" }] }))),
    ).toBeUndefined();
    expect(decodeFilter(btoa("{"))).toBeUndefined();
    expect(decodeFilter("a".repeat(5000))).toBeUndefined();
    expect(decodeFilter(btoa(JSON.stringify({ attr: "x", op: "eq" })))).toBeUndefined(); // jen skupina
  });
  it("sameFilter ignoruje prázdný filtr", () => {
    expect(sameFilter(undefined, { op: "and", conditions: [] })).toBe(true);
    expect(sameFilter(F, F)).toBe(true);
    expect(sameFilter(F, undefined)).toBe(false);
  });
  it("adresa zachová ostatní parametry", () => {
    const href = withListParams("/zakazky?pohled=abc", { filters: F, q: "novák" });
    const u = new URL(href, "http://x");
    expect(u.searchParams.get("pohled")).toBe("abc");
    expect(decodeFilter(u.searchParams.get("f"))).toEqual(F);
    expect(u.searchParams.get("q")).toBe("novák");
    expect(withListParams(href, {})).toBe("/zakazky?pohled=abc");
  });
});
