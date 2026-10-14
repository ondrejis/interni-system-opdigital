/** Cokoli z cizí zakázky B (id nebo název) v odpovědi pro lidi z týmu A je únik. */
export function findForeign(value: unknown, markers: string[]): string[] {
  const text = JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? Number(v) : v)) ?? "";
  return markers.filter((m) => text.includes(m));
}
