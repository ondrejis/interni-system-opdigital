/*
  Tvary dat, které UI zakázek čte od jiných modulů přes příkazy (`ukoly.*`, `disk.*`, `finance.*`). Zakázky na ty moduly
  nezávisí (`dependsOn`), takže jejich typy neimportují, a popisují jen to, co potřebují; chybějící modul nebo příkaz
  se v UI projeví jako prázdný stav, ne jako chyba.
*/
import type { BoardCard, PhaseView } from "../contract";

/** Karta zakázky na boardu a v seznamu; `members` doplňuje server (ZAK-A), starší odpověď je nemá. */
export type BoardCardX = BoardCard & { members?: { userId: string; name: string }[] };

/** Úkol zakázky, jak ho vrací `ukoly.list` (jen pole, která UI používá). */
export type TaskLite = {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "done" | "canceled";
  priority: "none" | "low" | "medium" | "high" | "urgent";
  assigneeId: string | null;
  assigneeName: string | null;
  dueDate: string | null;
  estimateMin: number | null;
  jobPhaseId: string | null;
  typeName?: string | null;
};

/** Skupina úkolů pod jednou fází (nebo „Bez fáze“). */
export type TaskGroup = {
  key: string;
  /** `null` = skupina „Bez fáze“. */
  phaseId: string | null;
  name: string;
  phase: PhaseView | null;
  open: TaskLite[];
  closed: TaskLite[];
};

/** Výsledek `ukoly.list`. */
export type TaskListResult = { rows: TaskLite[]; total: number };

/** Stav složky na Disku (`disk.folderState`). */
export type DriveInfo = {
  state: "none" | "pending" | "ready" | "error" | "timeout";
  folderId: string | null;
  url: string | null;
};

/** Položka výběru uživatele nebo šablony. */
export type Option = { value: string; label: string; hint?: string };
