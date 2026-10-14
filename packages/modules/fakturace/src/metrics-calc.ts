import { bucketLabel, bucketsBetween, type Bucket, type DateRange } from "@rebar/core/dashboards";

/** Nejvíc košů, které plán peněžních toků ukáže (delší období se zkrátí od začátku). */
export const MAX_BUCKETS = 60;

/** Zbývá uhradit: celkem − uhrazeno, nikdy záporné (přeplatek se neodečítá od ostatních faktur). */
export const remainingMinor = (grossMinor: number, paidMinor: number): number =>
  Math.max(0, grossMinor - paidMinor);

/** Jedna řada plánu peněžních toků: součty po koších (klíč = začátek koše `YYYY-MM-DD`). */
export type FlowRow = { key: string; value: number };

/**
 * Srovná součty z databáze na všechny koše období (i prázdné, aby řada neměla díry). Řádky mimo koše se zahodí,
 * duplicitní klíče se sečtou.
 */
export function alignToBuckets(
  range: DateRange,
  bucket: Bucket,
  ...series: readonly (readonly FlowRow[])[]
): { categories: { key: string; label: string }[]; values: number[][] } {
  const keys = bucketsBetween(range, bucket, MAX_BUCKETS);
  return {
    categories: keys.map((key) => ({ key, label: bucketLabel(key, bucket) })),
    values: series.map((rows) => {
      const sums = new Map<string, number>();
      for (const r of rows) sums.set(r.key, (sums.get(r.key) ?? 0) + r.value);
      return keys.map((k) => sums.get(k) ?? 0);
    }),
  };
}
