"use client";

import type { ComponentType } from "react";
import type { KanbanCardContext } from "@rebar/ui";
import { NextActivityIcon as NextActivityIconImpl } from "./next-icon";
import { ActivityComposer as ActivityComposerImpl, WorkPanel as WorkPanelImpl } from "./composer";
import { UpcomingSteps as UpcomingStepsImpl } from "./steps";
import { Timeline as TimelineImpl } from "./timeline-ui";
import { ActivityList as ActivityListImpl } from "./list";
import type { ActivityTarget } from "./ui-shared";
import type { ActivityRange } from "./types";

/**
 * Veřejné komponenty oblasti Aktivity pro ostatní oblasti CRM (nástěnka, dnešní práce, detail zakázky, firmy a osoby,
 * schránka). Názvy a tvar props jsou smlouva (docs/CRM.md); implementace je v souborech vedle.
 */

export type { ActivityTarget } from "./ui-shared";

/**
 * Ikona další aktivity na kartě (dnes / budoucí / po termínu / chybí) s popoverem: nadcházející aktivity, odškrtnutí,
 * naplánování další. Čte `crmNextActivityAt`, `crmOpenActivities` z řádku zakázky.
 */
export const NextActivityIcon: ComponentType<KanbanCardContext> = NextActivityIconImpl;

/**
 * Psací panel „Aktivita“: typ jako ikony, předmět, termín (datum + čas, nebo celý den), délka, priorita, místo,
 * přiřazeno; `Cmd+Enter` uloží. Volitelně `autoFocus` (zaměří předmět).
 */
export const ActivityComposer: ComponentType<
  ActivityTarget & {
    onCreated?: (id: string) => void;
    defaultTypeKey?: string;
    autoFocus?: boolean;
  }
> = ActivityComposerImpl;

/** Sekce „Další kroky“: nadcházející aktivity a připnuté poznámky (odškrtnutí rovnou v seznamu). `aggregate` = i z podřízených záznamů. */
export const UpcomingSteps: ComponentType<ActivityTarget & { aggregate?: boolean }> =
  UpcomingStepsImpl;

/**
 * Pravá pracovní plocha detailu zakázky, firmy nebo osoby: psací panel (Aktivita / Poznámka / Hovor, `Cmd+Enter` uloží),
 * sekce „Další kroky“ a „Historie“ s filtry (Vše, Aktivity, Poznámky, Soubory, Protokol změn). Pro firmu a osobu
 * (`aggregate`) sbírá dění ze všech jejich zakázek a osob.
 */
export const WorkPanel: ComponentType<ActivityTarget & { aggregate?: boolean }> = WorkPanelImpl;

/** Jen časová osa (bez psacího panelu). */
export const Timeline: ComponentType<ActivityTarget & { aggregate?: boolean }> = TimelineImpl;

/**
 * Seznam aktivit s rychlými filtry (typ; k dokončení, po termínu, dnes, zítra, tento týden, příští týden, hotové)
 * a odškrtnutím, naplánováním další a odložením přímo v řádku. `scope: "mine"` = přiřazené mně.
 */
export const ActivityList: ComponentType<{
  scope: "mine" | "all";
  range?: ActivityRange;
  limit?: number;
  hideFilters?: boolean;
}> = ActivityListImpl;
