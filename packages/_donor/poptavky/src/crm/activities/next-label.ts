// Čistá logika popisku „další aktivity“ na kartě nástěnky (bez Reactu, aby šla testovat samostatně).

import { localParts } from "@rebar/core/time";
import { activityState, daysSince, type ActivityState } from "../logic";
import { formatDue } from "./logic";

/** Jak vypadá stav další aktivity na kartě: text v čipu, ikona a věta pro tooltip a čtečky. */
export type NextActivityLook = {
  state: ActivityState;
  /** Krátký text v čipu: „Dnes 14:00“, „Zítra“, „Po termínu 2 d“, „Naplánovat“. */
  text: string;
  /** Název ikony z `Icon`. */
  icon: string;
  /** Celá věta pro tooltip a `aria-label`. */
  hint: string;
};

/** Aktivita na celý den je uložená na půlnoc pražského času; čas „0:00“ se proto nezobrazuje. */
const isAllDay = (at: Date | string | number) => localParts(new Date(at)).time === "00:00";

/**
 * Stav další aktivity zakázky jako text a ikona (jednotný jazyk čtyř stavů: dnes, budoucí, po termínu, nic není
 * naplánováno). Bez otevřených aktivit je čip výzva „Naplánovat“, ne varování.
 */
export function nextActivityLook(
  nextAt: Date | string | number | null | undefined,
  openCount: number,
  now: Date = new Date(),
): NextActivityLook {
  const state = activityState(nextAt, openCount, now);
  if (state === "none" || nextAt === null || nextAt === undefined)
    return {
      state: "none",
      text: "Naplánovat",
      icon: "calendar-plus",
      hint: "Zakázka nemá naplánovanou další aktivitu. Kliknutím ji naplánujete.",
    };
  const when = formatDue(nextAt, isAllDay(nextAt), now);
  const more = openCount > 1 ? ` (a ${openCount - 1} další)` : "";
  if (state === "overdue") {
    const days = daysSince(nextAt, now);
    return {
      state,
      text: days > 0 ? `Po termínu ${days} d` : "Po termínu",
      icon: "alarm-clock",
      hint: `Další aktivita je po termínu: ${when}${more}`,
    };
  }
  if (state === "today")
    return {
      state,
      text: when,
      icon: "calendar-clock",
      hint: `Další aktivita je dnes: ${when}${more}`,
    };
  return {
    state,
    text: when,
    icon: "calendar",
    hint: `Další aktivita je naplánovaná: ${when}${more}`,
  };
}

/** Barva textu čipu: jen jeden signál na kartě (po termínu přebije dnes; ostatní stavy jsou šedé). */
export function nextActivityTone(
  state: ActivityState,
  rotting: boolean,
): "danger" | "success" | "muted" {
  if (state === "overdue") return "danger";
  if (state === "today" && !rotting) return "success";
  return "muted";
}
