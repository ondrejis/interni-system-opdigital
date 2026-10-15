/*
  Sdílené konstanty, popisky a čisté pomocné funkce modulu „zakazky“. Bez databáze, bez zodu a bez Node, takže je smí
  importovat i UI (ZAK-B) a testy. Server (`entities.ts`, `core/**`) je bere odsud, aby popisky nebyly dvakrát.
*/

/** Typ zakázky = služba, kterou agentura poskytuje. */
export const JOB_TYPES = ["web", "marketing", "systemy"] as const;
/** Stav zakázky (`JobStatus` v kontraktech). */
export const JOB_STATUSES = ["planned", "active", "paused", "done", "cancelled"] as const;
/** Způsob fakturace zakázky (`hourly` je jen příznak, R-25). */
export const BILLING_MODELS = ["one_off", "intro_then_retainer", "retainer", "hourly"] as const;
/** Fáze marketingové zakázky (úvod → rozhodnutí → retainer → konec). */
export const MARKETING_STAGES = ["intro", "decision", "retainer", "ended"] as const;
/** Stav fáze zakázky. */
export const PHASE_STATUSES = ["not_started", "in_progress", "done", "skipped"] as const;
/** Zvláštní význam fáze: vyhodnocení úvodní fáze marketingu, retainer. */
export const PHASE_ROLES = ["intro_evaluation", "retainer"] as const;
/** Role člena týmu zakázky. */
export const JOB_MEMBER_ROLES = ["lead", "member"] as const;
/** Důvod ukončení zakázky (`project.completed`). */
export const COMPLETE_REASONS = ["finished", "retainer_ended", "cancelled"] as const;

export type JobType = (typeof JOB_TYPES)[number];
export type JobStatusCode = (typeof JOB_STATUSES)[number];
export type BillingModelCode = (typeof BILLING_MODELS)[number];
export type MarketingStageCode = (typeof MARKETING_STAGES)[number];
export type PhaseStatus = (typeof PHASE_STATUSES)[number];
export type PhaseRole = (typeof PHASE_ROLES)[number];
export type MemberRole = (typeof JOB_MEMBER_ROLES)[number];
export type CompleteReason = (typeof COMPLETE_REASONS)[number];

/** Popisky typů zakázek (služeb). */
export const JOB_TYPE_LABELS: Record<JobType, string> = {
  web: "Web",
  marketing: "Marketing",
  systemy: "Systémy",
};
/** Popisky stavů zakázky. */
export const JOB_STATUS_LABELS: Record<JobStatusCode, string> = {
  planned: "Plánovaná",
  active: "Aktivní",
  paused: "Pozastavená",
  done: "Dokončená",
  cancelled: "Zrušená",
};
/** Barvy stavů (názvy z palety `@rebar/ui`). */
export const JOB_STATUS_COLORS: Record<JobStatusCode, string> = {
  planned: "gray",
  active: "green",
  paused: "yellow",
  done: "blue",
  cancelled: "red",
};
/** Popisky způsobů fakturace. */
export const BILLING_MODEL_LABELS: Record<BillingModelCode, string> = {
  one_off: "Jednorázově",
  intro_then_retainer: "Úvodní fáze, pak retainer",
  retainer: "Rovnou retainer",
  hourly: "Hodinově",
};
/** Popisky fází marketingové zakázky. */
export const MARKETING_STAGE_LABELS: Record<MarketingStageCode, string> = {
  intro: "Úvodní fáze",
  decision: "Rozhodnutí",
  retainer: "Retainer",
  ended: "Ukončeno",
};
/** Popisky stavů fáze. */
export const PHASE_STATUS_LABELS: Record<PhaseStatus, string> = {
  not_started: "Nezahájená",
  in_progress: "Probíhá",
  done: "Hotová",
  skipped: "Přeskočená",
};
/** Popisky zvláštních rolí fáze. */
export const PHASE_ROLE_LABELS: Record<PhaseRole, string> = {
  intro_evaluation: "Vyhodnocení úvodní fáze",
  retainer: "Retainer",
};
/** Popisky rolí v týmu. */
export const MEMBER_ROLE_LABELS: Record<MemberRole, string> = {
  lead: "Vedoucí",
  member: "Člen",
};
/** Popisky důvodů ukončení. */
export const COMPLETE_REASON_LABELS: Record<CompleteReason, string> = {
  finished: "Dokončeno",
  retainer_ended: "Retainer ukončen",
  cancelled: "Zrušeno",
};

/** Stavy, ve kterých je zakázka „živá“ (nepočítá se mezi uzavřené). */
export const OPEN_STATUSES: readonly JobStatusCode[] = ["planned", "active", "paused"];

/** Nejvýš tolik fází má jedna zakázka i šablona. */
export const MAX_PHASES = 40;

/* ---------- práce s daty (čisté funkce, ISO `YYYY-MM-DD`, bez časových zón) ---------- */

const DAY_MS = 86_400_000;
const toUtc = (iso: string) => Date.parse(`${iso}T12:00:00Z`);

/** Dnešní datum v české zóně (`YYYY-MM-DD`). */
export function todayPrague(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(now);
}

/** Datum o `days` dní později (záporné = dříve). */
export function addDays(iso: string, days: number): string {
  return new Date(toUtc(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Počet dní od `from` do `to` (záporný, když je `to` dřív). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** Měsíc `YYYY-MM` z data. */
export const monthOf = (iso: string): string => iso.slice(0, 7);

/** Termín položky šablony: start zakázky + počet dní; bez počtu dní `null`. */
export function dueFromOffset(startDate: string, offsetDays: number | null | undefined) {
  return offsetDays === null || offsetDays === undefined ? null : addDays(startDate, offsetDays);
}

/**
 * Plánované datum začátku a konce fáze podle šablony: začátek = start zakázky + posun, konec = začátek + délka
 * (včetně obou krajních dnů, takže jednodenní fáze začíná i končí týž den; délka 0 se bere jako jeden den).
 */
export function phaseDates(
  startDate: string,
  phase: { offsetDays: number; durationDays: number },
): { plannedStart: string; plannedEnd: string } {
  const plannedStart = addDays(startDate, phase.offsetDays);
  return { plannedStart, plannedEnd: addDays(plannedStart, Math.max(phase.durationDays, 1) - 1) };
}

/** Zakázka je po termínu: živá a termín je před dneškem. */
export function isOverdue(
  job: { status: string; dueDate: string | null },
  today: string = todayPrague(),
): boolean {
  return (
    OPEN_STATUSES.includes(job.status as JobStatusCode) && !!job.dueDate && job.dueDate < today
  );
}
