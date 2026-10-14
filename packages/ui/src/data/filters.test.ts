import { describe, expect, it } from "vitest";
import { completeFilters } from "./filters";

describe("completeFilters", () => {
  it("bez filtru nevrací nic", () => {
    expect(completeFilters(undefined)).toBeUndefined();
    expect(completeFilters({ op: "and", conditions: [] })).toBeUndefined();
  });

  it("nedokončené podmínky (chybí hodnota) se z dotazu vynechají", () => {
    const f = completeFilters({
      op: "and",
      conditions: [
        { attr: "title", op: "contains" },
        { attr: "title", op: "contains", value: "" },
        { attr: "value", op: "between", value: [100, undefined] },
        { attr: "stage", op: "is_any_of", value: [] },
        { attr: "title", op: "contains", value: "okna" },
      ],
    });
    expect(f).toEqual({
      op: "and",
      conditions: [{ attr: "title", op: "contains", value: "okna" }],
    });
  });

  it("operátory bez hodnoty a úplné rozsahy zůstanou", () => {
    const f = completeFilters({
      op: "or",
      conditions: [
        { attr: "manager", op: "is_me" },
        { attr: "endDate", op: "empty" },
        { attr: "value", op: "between", value: [100, 500] },
        { attr: "stage", op: "is_any_of", value: ["a"] },
      ],
    });
    expect(f?.op).toBe("or");
    expect(f?.conditions).toHaveLength(4);
  });

  it("vnořená skupina se zkrátí a prázdná zmizí", () => {
    const f = completeFilters({
      op: "and",
      conditions: [
        { op: "or", conditions: [{ attr: "title", op: "contains" }] },
        {
          op: "or",
          conditions: [
            { attr: "title", op: "equals", value: "x" },
            { attr: "title", op: "equals" },
          ],
        },
      ],
    });
    expect(f).toEqual({
      op: "and",
      conditions: [{ op: "or", conditions: [{ attr: "title", op: "equals", value: "x" }] }],
    });
  });
});
