/*
  Kontrakt příkazů modulu „hodiny“: zod vstupy a výstupy (M1). Čas se v příkazech posílá jako text `time` (`1,5`, `1:30`,
  `90m`), který rozebírá server (`logic/parse-time.ts`), nebo jako celé `minutes`; když jsou zadané obě, platí `minutes`.
*/
import { z } from "zod";
import { MAX_NOTE_LENGTH } from "./logic/grid";
import { MAX_DAY_MINUTES } from "./logic/parse-time";

const isoDate = z.iso.date();
const id = z.uuid();
const note = z.string().trim().max(MAX_NOTE_LENGTH).nullish();
const timeText = z.string().trim().max(40);
const minutes = z.number().int().min(0).max(MAX_DAY_MINUTES);

/** `hodiny.parse`: náhled rozpoznání zadaného času. */
export const parseInput = z.object({ text: z.string().max(40) });
/** Výstup `hodiny.parse`. */
export type ParseOutput =
  { ok: true; minutes: number; hm: string; decimal: string } | { ok: false; error: string };

/** `hodiny.save`: nový záznam, nebo úprava (`id`). K úkolu stačí `taskId` (zakázka se vezme z úkolu). */
export const saveInput = z
  .object({
    id: id.optional(),
    jobId: id.optional(),
    taskId: id.nullish(),
    date: isoDate,
    time: timeText.optional(),
    minutes: minutes.optional(),
    note,
  })
  .refine((v) => v.time !== undefined || v.minutes !== undefined, {
    message: "Zadejte čas.",
    path: ["time"],
  });
/** Vstup `hodiny.save`. */
export type SaveInput = z.input<typeof saveInput>;
/** Výstup `hodiny.save`. */
export type SaveOutput = {
  id: string;
  jobId: string;
  taskId: string | null;
  date: string;
  minutes: number;
  /** Kolik minut má člověk ten den zapsáno celkem. */
  dayMinutes: number;
};

/** `hodiny.cell.save`: nastaví čas bez úkolu v buňce týdenní mřížky (prázdný čas nebo 0 buňku vymaže). */
export const cellSaveInput = z.object({
  jobId: id,
  date: isoDate,
  time: timeText.optional(),
  minutes: minutes.optional(),
});
/** Vstup `hodiny.cell.save`. */
export type CellSaveInput = z.input<typeof cellSaveInput>;
/** Výstup `hodiny.cell.save`. */
export type CellSaveOutput = {
  /** Nový čas buňky bez úkolu v minutách (0 = vymazáno). */
  minutes: number;
  dayMinutes: number;
};

/** `hodiny.delete`: smaže vlastní záznam. */
export const deleteInput = z.object({ id });

/** `hodiny.week`: týdenní výkaz přihlášeného (týden, do kterého spadá `weekStart`; bez něj tento týden). */
export const weekInput = z.object({ weekStart: isoDate.optional() });
/** Záznam hodin ve výpisech. */
export type EntryDto = {
  id: string;
  userId: string;
  jobId: string;
  taskId: string | null;
  taskTitle: string | null;
  date: string;
  minutes: number;
  note: string | null;
};
/** Zakázka v nabídkách a v hlavičkách řádků. */
export type JobRef = {
  id: string;
  number: string | null;
  title: string;
  status: string | null;
  isPrivate: boolean;
};
/** Buňka týdenní mřížky. */
export type WeekCellDto = { gridMinutes: number; taskMinutes: number; gridEntries: number };
/** Výstup `hodiny.week`. */
export type WeekOutput = {
  weekStart: string;
  weekEnd: string;
  today: string;
  days: { date: string; holiday: string | null; workday: boolean; minutes: number }[];
  rows: { job: JobRef; cells: Record<string, WeekCellDto>; totalMinutes: number }[];
  totalMinutes: number;
  /** Záznamy týdne (s poznámkami a úkoly) pro detail pod mřížkou. */
  entries: EntryDto[];
  /** Zakázky, na které člověk zapisoval v posledních týdnech a tento týden na nich nic nemá. */
  recentJobs: JobRef[];
};

/** `hodiny.jobs`: zakázky, ke kterým jde zapsat čas (hledání v názvu a čísle). */
export const jobsInput = z.object({
  q: z.string().trim().max(100).optional(),
  includeClosed: z.boolean().optional(),
});
/** Výstup `hodiny.jobs`. */
export type JobsOutput = JobRef[];

/** `hodiny.forTask`: čas zapsaný u úkolu (dialog „Zapsat čas“). */
export const forTaskInput = z.object({ taskId: id });
/** Výstup `hodiny.forTask`. */
export type ForTaskOutput = {
  taskId: string;
  taskTitle: string;
  /** Zakázka úkolu; `null`, když úkol k žádné zakázce nepatří (čas se pak zapsat nedá). */
  job: JobRef | null;
  estimateMin: number | null;
  totalMinutes: number;
  myMinutes: number;
  entries: (EntryDto & { userName: string })[];
};

/** `hodiny.report`: přehled hodin za týden nebo měsíc. */
export const reportInput = z.object({
  period: z.enum(["week", "month"]).default("week"),
  /** Libovolný den období; bez něj dnešek. */
  anchor: isoDate.optional(),
  /** `mine` = jen moje hodiny, `all` = hodiny všech (vyžaduje rozsah „vše“). */
  scope: z.enum(["mine", "all"]).default("mine"),
  by: z.enum(["job", "person"]).default("job"),
});
/** Vstup `hodiny.report`. */
export type ReportInput = z.input<typeof reportInput>;
/** Řádek přehledu: skupina s rozpadem. */
export type ReportRow = {
  id: string;
  label: string;
  minutes: number;
  sharePct: number;
  parts: { id: string; label: string; minutes: number }[];
};
/** Výstup `hodiny.report`. */
export type ReportOutput = {
  period: "week" | "month";
  from: string;
  to: string;
  scope: "mine" | "all";
  by: "job" | "person";
  totalMinutes: number;
  rows: ReportRow[];
  days: { date: string; minutes: number }[];
  /** Může aktér přepnout na hodiny všech. */
  canSeeAll: boolean;
};

/** `hodiny.job.summary`: odpracováno vs. odhad a efektivní sazba u zakázky. */
export const jobSummaryInput = z.object({ jobId: id });
/** Výstup `hodiny.job.summary`. */
export type JobSummaryOutput = {
  job: JobRef;
  /** Rozsah hodin aktéra: u „own“ jsou v součtech jen jeho hodiny. */
  scope: "all" | "own";
  workedMinutes: number;
  estimateMin: number | null;
  /** Kolik úkolů se do odhadu počítá (bez zrušených). */
  estimateTasks: number | null;
  remainingMinutes: number | null;
  overrunMinutes: number | null;
  progressPct: number | null;
  users: {
    userId: string;
    name: string;
    minutes: number;
    sharePct: number | null;
    incomeMinor: number | null;
    rateMinor: number | null;
  }[];
  /** Příjmy a sazby jsou k dispozici (modul Finance je zapnutý a aktér smí vidět peníze). */
  moneyAvailable: boolean;
  totalIncomeMinor: number | null;
  effectiveRateMinor: number | null;
  recent: (EntryDto & { userName: string })[];
};
