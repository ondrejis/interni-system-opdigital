import { addDaysIso, diffDaysIso, isWorkday } from "@rebar/core/time";

/** Společné typy a pomocníci pro harmonogram (Gantt, seznam, dialog). Bez serverového kódu. */

export type GanttPhase = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  baselineStart: string | null;
  baselineEnd: string | null;
  progress: number;
  status: string;
  milestone: boolean;
  dependsOnId: string | null;
  delay: number;
  responsibleName?: string | undefined;
  note?: string | null | undefined;
};

export type Phase = GanttPhase & {
  actualStart: string | null;
  actualEnd: string | null;
  plannedHours: number | null;
  responsibleId: string | null;
  note: string | null;
};

export type PhasesData = { phases: Phase[]; progress: number; users: Record<string, string> };

/* ---------- přiblížení ---------- */

export type Zoom = "week" | "month" | "quarter";
export const ZOOMS: readonly { id: Zoom; label: string; dayW: number }[] = [
  { id: "week", label: "Týden", dayW: 40 },
  { id: "month", label: "Měsíc", dayW: 16 },
  { id: "quarter", label: "Čtvrtletí", dayW: 6 },
];
export const dayWidth = (zoom: Zoom) => ZOOMS.find((z) => z.id === zoom)!.dayW;

/**
 * Přiblížení při otevření: týden, když se celý plán vejde na šířku `width` (px); měsíc pro plány do zhruba 8 měsíců
 * (kus se posouvá do strany); čtvrtletí až pro delší, jinak by pruhy byly příliš malé.
 */
export function fitZoom(startDate: string, endDate: string, width: number): Zoom {
  const span = diffDaysIso(startDate, endDate) + 21;
  if (span * dayWidth("week") <= width) return "week";
  return span <= 240 ? "month" : "quarter";
}

/* ---------- stav fáze ---------- */

export type PhaseState = "done" | "late" | "active" | "planned";

export function phaseState(p: Pick<GanttPhase, "status" | "delay" | "progress">): PhaseState {
  if (p.status === "done" || p.progress >= 100) return "done";
  if (p.delay > 0) return "late";
  return p.progress > 0 ? "active" : "planned";
}

export const STATE_LABEL: Record<PhaseState, string> = {
  done: "Hotovo",
  late: "Zpožděno",
  active: "Probíhá",
  planned: "Plán",
};

/** Barvy stavu z tokenů design systému (světlý i tmavý režim). Text na pruhu je vždy `text-fg`. */
export const STATE_TONE: Record<
  PhaseState,
  { track: string; fill: string; edge: string; text: string; chip: string }
> = {
  done: {
    track: "var(--success-soft)",
    fill: "color-mix(in oklab, var(--success) 38%, var(--bg))",
    edge: "var(--success)",
    text: "text-success",
    chip: "green",
  },
  late: {
    track: "var(--danger-soft)",
    fill: "color-mix(in oklab, var(--danger) 36%, var(--bg))",
    edge: "var(--danger)",
    text: "text-danger",
    chip: "red",
  },
  // „probíhá“ nemá brandovou barvu (klient si může zvolit červenou, která by splynula se zpožděním)
  active: {
    track: "var(--label-blue-bg)",
    fill: "color-mix(in oklab, var(--label-blue-fg) 38%, var(--bg))",
    edge: "var(--label-blue-fg)",
    text: "text-[var(--label-blue-fg)]",
    chip: "blue",
  },
  planned: {
    track: "var(--bg-hover)",
    fill: "color-mix(in oklab, var(--fg-subtle) 28%, var(--bg))",
    edge: "var(--line-strong)",
    text: "text-muted",
    chip: "gray",
  },
};

/* ---------- formátování ---------- */

export const WEEKDAY_SHORT = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
const MONTHS_SHORT = [
  "led",
  "úno",
  "bře",
  "dub",
  "kvě",
  "čvn",
  "čvc",
  "srp",
  "zář",
  "říj",
  "lis",
  "pro",
];
export const monthShort = (iso: string) => MONTHS_SHORT[Number(iso.slice(5, 7)) - 1]!;

/** „2026-10-08“ → „8. 10.“ */
export const fmtShort = (iso: string) => `${Number(iso.slice(8, 10))}. ${Number(iso.slice(5, 7))}.`;

/** „5. – 7. 10.“ nebo „30. 10. – 3. 11.“; jeden den = „8. 10.“. */
export function fmtRange(a: string, b: string): string {
  if (a === b) return fmtShort(a);
  if (a.slice(0, 7) === b.slice(0, 7))
    return `${Number(a.slice(8, 10))}. – ${Number(b.slice(8, 10))}. ${Number(b.slice(5, 7))}.`;
  return `${fmtShort(a)} – ${fmtShort(b)}`;
}

const plural = (n: number, one: string, few: string, many: string) =>
  `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;
export const workdaysLabel = (n: number) =>
  plural(n, "pracovní den", "pracovní dny", "pracovních dnů");
export const daysLabel = (n: number) => plural(n, "den", "dny", "dnů");

/** „dnes“, „zítra“, „za 5 dní“, „před 3 dny“. */
export function relativeDay(date: string, today: string): string {
  const d = diffDaysIso(today, date);
  if (d === 0) return "dnes";
  if (d === 1) return "zítra";
  if (d === -1) return "včera";
  return d > 0
    ? `za ${plural(d, "den", "dny", "dní")}`
    : `před ${plural(-d, "dnem", "dny", "dny")}`;
}

/** Další pracovní den po `date`. */
export function nextWorkday(date: string): string {
  let d = addDaysIso(date, 1);
  while (!isWorkday(d)) d = addDaysIso(d, 1);
  return d;
}

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
