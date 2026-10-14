import { addDaysIso, addWorkdays, diffDaysIso, isWorkday, workingDays } from "@rebar/core/time";

/** Výpočty harmonogramu bez databáze (pracovní dny a svátky ČR, návaznosti, průběh, zpoždění). */

export type PhaseLike = {
  id: string;
  startDate: string;
  endDate: string;
  baselineEnd?: string | null;
  actualEnd?: string | null;
  progress: number;
  status: string;
  milestone?: boolean;
  dependsOnId?: string | null;
};

export const statusFromProgress = (progress: number) =>
  progress >= 100 ? "done" : progress > 0 ? "in_progress" : "planned";

/** Délka fáze v pracovních dnech (nejméně 1; milník = 1). */
export function lengthInWorkdays(start: string, end: string): number {
  return Math.max(1, workingDays(start, end).length);
}

/** Nejbližší pracovní den ke dni `date` směrem dopředu (včetně dne samého). */
export function toWorkday(date: string): string {
  return isWorkday(date) ? date : addWorkdays(date, 0);
}

/** Konec fáze, která začíná `start` a trvá `workdays` pracovních dní. */
export function endAfter(start: string, workdays: number): string {
  const first = toWorkday(start);
  return workdays <= 1 ? first : addWorkdays(first, workdays - 1);
}

/** Návaznost nesmí udělat kruh (A po B po A) ani odkazovat sama na sebe. */
export function wouldCycle(
  phases: readonly Pick<PhaseLike, "id" | "dependsOnId">[],
  phaseId: string | null,
  dependsOnId: string | null,
): boolean {
  if (!dependsOnId) return false;
  if (dependsOnId === phaseId) return true;
  const byId = new Map(phases.map((p) => [p.id, p.dependsOnId ?? null]));
  const seen = new Set<string>();
  let cur: string | null = dependsOnId;
  while (cur) {
    if (cur === phaseId) return true;
    if (seen.has(cur)) return false;
    seen.add(cur);
    cur = byId.get(cur) ?? null;
  }
  return false;
}

/**
 * Posune navazující fáze, které by začínaly dřív, než skončí jejich předchůdce: začnou první pracovní den po něm
 * a zachovají délku v pracovních dnech. Pracuje na kopii, vrací změněné fáze (v pořadí posunu).
 */
export function shiftDependents<T extends PhaseLike>(phases: readonly T[], changedId: string): T[] {
  const byId = new Map(phases.map((p) => [p.id, { ...p }]));
  const moved = new Map<string, T>();
  const queue = [changedId];
  const guard = new Set<string>();
  while (queue.length) {
    const predId = queue.shift()!;
    const pred = byId.get(predId);
    if (!pred) continue;
    for (const dep of byId.values()) {
      if (dep.dependsOnId !== predId) continue;
      if (dep.startDate > pred.endDate) continue;
      const len = lengthInWorkdays(dep.startDate, dep.endDate);
      dep.startDate = addWorkdays(pred.endDate, 1);
      dep.endDate = dep.milestone ? dep.startDate : addWorkdays(dep.startDate, len - 1);
      moved.set(dep.id, dep);
      if (!guard.has(dep.id + dep.startDate)) {
        guard.add(dep.id + dep.startDate);
        queue.push(dep.id);
      }
    }
  }
  return [...moved.values()];
}

/** Celkový průběh zakázky = průběh fází vážený jejich délkou v pracovních dnech. */
export function jobProgress(phases: readonly PhaseLike[]): number {
  if (!phases.length) return 0;
  let total = 0;
  let done = 0;
  for (const p of phases) {
    const days = lengthInWorkdays(p.startDate, p.endDate);
    total += days;
    done += (days * (p.status === "done" ? 100 : p.progress)) / 100;
  }
  return Math.round((done / total) * 100);
}

/**
 * Zpoždění fáze v pracovních dnech: hotová → skutečný konec proti plánu; přeplánovaná na později → posun proti
 * výchozímu plánu; běžící po plánovaném konci → dnes proti plánu.
 */
export function phaseDelay(p: PhaseLike, today: string): number {
  const planEnd = p.baselineEnd ?? p.endDate;
  const work = (a: string, b: string) => (b > a ? workingDays(addDaysIso(a, 1), b).length : 0);
  if (p.status === "done") return p.actualEnd ? work(planEnd, p.actualEnd) : 0;
  const shifted = work(planEnd, p.endDate);
  const overdue = p.progress < 100 ? work(p.endDate, today) : 0;
  return Math.max(shifted, overdue);
}

/** Fáze, která začíná dřív, než skončí její předchůdce (návaznost není dodržená). Hotové fáze se nepočítají. */
export function dependencyConflicts<T extends PhaseLike>(phases: readonly T[]): T[] {
  const byId = new Map(phases.map((p) => [p.id, p]));
  return phases.filter((p) => {
    const pred = p.dependsOnId ? byId.get(p.dependsOnId) : undefined;
    return !!pred && p.status !== "done" && p.startDate <= pred.endDate;
  });
}

/**
 * Opravy pro „Přepočítat návaznosti“: nové termíny jen pro první fázi v řetězu konfliktů (předchůdce sám konflikt
 * nemá). Posun navazujících pak provede server (`shift`), takže se nic neposouvá dvakrát.
 */
export function conflictFixes<T extends PhaseLike>(
  phases: readonly T[],
): { id: string; startDate: string; endDate: string }[] {
  const byId = new Map(phases.map((p) => [p.id, p]));
  const conflicts = dependencyConflicts(phases);
  const ids = new Set(conflicts.map((p) => p.id));
  return conflicts
    .filter((p) => !ids.has(p.dependsOnId ?? ""))
    .map((p) => {
      const pred = byId.get(p.dependsOnId!)!;
      const len = lengthInWorkdays(p.startDate, p.endDate);
      const startDate = addWorkdays(pred.endDate, 1);
      return {
        id: p.id,
        startDate,
        endDate: p.milestone ? startDate : addWorkdays(startDate, len - 1),
      };
    });
}

/** Souhrn harmonogramu pro hlavičku záložky: termín, počty, zpoždění, nejbližší milník. */
export function scheduleSummary<T extends PhaseLike & { delay: number }>(
  phases: readonly T[],
  today: string,
) {
  const open = phases.filter((p) => p.status !== "done");
  const start = phases.map((p) => p.startDate).sort()[0] ?? null;
  const end =
    phases
      .map((p) => p.endDate)
      .sort()
      .at(-1) ?? null;
  const work = (a: string, b: string) => (b > a ? workingDays(addDaysIso(a, 1), b).length : 0);
  return {
    total: phases.length,
    done: phases.length - open.length,
    late: open.filter((p) => p.delay > 0),
    start,
    end,
    /** Pracovních dnů od dneška do konce plánu (0, když plán skončil). */
    remaining: end ? work(today, end) : 0,
    /** Pracovních dnů po konci plánu, když ještě zbývá práce. */
    overdue: end && open.length ? work(end, today) : 0,
    nextMilestone:
      open.filter((p) => p.milestone).sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ??
      null,
  };
}

export { diffDaysIso };
