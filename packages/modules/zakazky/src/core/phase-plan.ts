import type { PhaseRole, PhaseStatus } from "../shared";

/*
  Čistá pravidla přechodu mezi fázemi zakázky (R-38). Fáze se řadí podle `position`. Přeskočené fáze (`skipped`) se
  nikdy nedokončují ani neotevírají, jen se přes ně přechází.
*/

/** Minimální popis fáze pro plánování přechodu. */
export type PhaseLite = {
  id: string;
  position: number;
  status: PhaseStatus;
  role: PhaseRole | null;
};

/** Co se stane s fázemi při nastavení aktuální fáze. */
export type PhaseChangePlan = {
  target: PhaseLite;
  /** Dřívější nehotové fáze, které se dokončí. */
  completing: PhaseLite[];
  /** Pozdější fáze (hotové nebo rozpracované), které se vrátí do stavu Nezahájená. */
  reopening: PhaseLite[];
};

const sorted = (phases: readonly PhaseLite[]) =>
  [...phases].sort((a, b) => a.position - b.position);

/**
 * Klik na fázi `targetId`: dřívější nehotové fáze se dokončí, cílová je aktuální (rozpracovaná), pozdější hotové nebo
 * rozpracované se vrátí do stavu Nezahájená. Vrací `null`, když fáze v seznamu není.
 */
export function planPhaseChange(
  phases: readonly PhaseLite[],
  targetId: string,
): PhaseChangePlan | null {
  const all = sorted(phases);
  const target = all.find((p) => p.id === targetId);
  if (!target) return null;
  return {
    target,
    completing: all.filter(
      (p) => p.position < target.position && p.status !== "done" && p.status !== "skipped",
    ),
    reopening: all.filter(
      (p) => p.position > target.position && (p.status === "done" || p.status === "in_progress"),
    ),
  };
}

/** Výsledek dokončení fáze: co se dokončí a která fáze se stane aktuální (`null` = nic dalšího nezbývá). */
export type PhaseCompletePlan = {
  target: PhaseLite;
  completing: PhaseLite[];
  next: PhaseLite | null;
};

/**
 * Dokončení fáze `targetId`: dokončí se ona i všechny dřívější nehotové; aktuální se stane první pozdější fáze,
 * která není hotová ani přeskočená. Vrací `null`, když fáze v seznamu není.
 */
export function planPhaseComplete(
  phases: readonly PhaseLite[],
  targetId: string,
): PhaseCompletePlan | null {
  const all = sorted(phases);
  const target = all.find((p) => p.id === targetId);
  if (!target) return null;
  return {
    target,
    completing: all.filter(
      (p) => p.position <= target.position && p.status !== "done" && p.status !== "skipped",
    ),
    next:
      all.find(
        (p) => p.position > target.position && p.status !== "done" && p.status !== "skipped",
      ) ?? null,
  };
}

/** Je fáze poslední (žádná pozdější fáze není přeskočená)? Určuje `isLast` v události `project.phase_completed`. */
export function isLastPhase(phases: readonly PhaseLite[], phaseId: string): boolean {
  const all = sorted(phases);
  const p = all.find((x) => x.id === phaseId);
  return !!p && !all.some((x) => x.position > p.position && x.status !== "skipped");
}

/** První fáze, která ještě není hotová ani přeskočená (aktuální fáze po úpravě seznamu), nebo `null`. */
export function firstOpenPhase(phases: readonly PhaseLite[]): PhaseLite | null {
  return sorted(phases).find((p) => p.status !== "done" && p.status !== "skipped") ?? null;
}
