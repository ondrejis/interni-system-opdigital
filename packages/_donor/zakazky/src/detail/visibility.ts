// Fáze, podle které se řídí viditelnost částí detailu zakázky. Čisté funkce. Pozastavená zakázka se chová jako fáze,
// ze které byla pozastavena; prohraná nese jen obchodní část.

const ORDER = [
  "inquiry",
  "offer",
  "preparation",
  "execution",
  "handover",
  "warranty",
  "closed",
] as const;
type Main = (typeof ORDER)[number];

type RowLike = Record<string, unknown>;

/** Fáze, podle které se řídí viditelnost (u pozastavené zakázky ta původní). */
export function effectivePhase(row: RowLike): Main | "lost" {
  const phase = typeof row.phase === "string" ? row.phase : "";
  const from = typeof row.pausedFrom === "string" ? row.pausedFrom : "";
  const key = phase === "paused" ? from : phase;
  if (key === "lost") return "lost";
  // zakázka bez fáze (stará data) se bere jako běžící
  return (ORDER as readonly string[]).includes(key) ? (key as Main) : "execution";
}

/** Je zakázka ve fázi `min` nebo dál (a není prohraná)? */
export function phaseAtLeast(row: RowLike, min: Main): boolean {
  const p = effectivePhase(row);
  return p !== "lost" && ORDER.indexOf(p) >= ORDER.indexOf(min);
}

export const fromPreparation = (row: RowLike) => phaseAtLeast(row, "preparation");
export const fromExecution = (row: RowLike) => phaseAtLeast(row, "execution");
