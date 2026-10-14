/** České skloňování podle počtu: `plural(2, "úkol", "úkoly", "úkolů")` → „úkoly“. */
export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n);
  return abs === 1 ? one : abs >= 2 && abs <= 4 ? few : many;
}

/** „3 úkoly“. */
export const countOf = (n: number, one: string, few: string, many: string) =>
  `${n} ${plural(n, one, few, many)}`;
