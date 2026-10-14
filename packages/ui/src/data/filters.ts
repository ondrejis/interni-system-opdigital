import { VALUELESS_OPERATORS, type Condition, type FilterGroup } from "@rebar/core/shared";

export const isCondition = (c: Condition | FilterGroup): c is Condition => "attr" in c;

/** Je podmínka úplná a smí se poslat na server? Nedokončené chipy se z dotazu vynechají. */
export function completeFilters(f: FilterGroup | undefined): FilterGroup | undefined {
  if (!f) return undefined;
  const keep = (c: Condition | FilterGroup): Condition | FilterGroup | null => {
    if (!isCondition(c)) {
      const inner = completeFilters(c);
      return inner ?? null;
    }
    if (VALUELESS_OPERATORS.includes(c.op)) return c;
    const v = c.value;
    if (v === undefined || v === null || v === "") return null;
    if (
      Array.isArray(v) &&
      (c.op === "between" ? v.some((x) => x === undefined || x === null) : v.length === 0)
    )
      return null;
    return c;
  };
  const conditions = f.conditions.map(keep).filter((x): x is Condition | FilterGroup => x !== null);
  return conditions.length ? { op: f.op, conditions } : undefined;
}
