"use client";

import { formatInstant } from "@rebar/core/time";
import { Icon, cn, useCommandQuery } from "@rebar/ui";
import { formatDue, formatDuration } from "./logic";
import type {
  ActivityDto,
  ActivityDueState,
  ActivityTypeDto,
  ListMineResult,
  NoteTarget,
  TimelineResult,
  UpcomingResult,
} from "./types";

/** Na co se aktivita, poznámka nebo seznam vztahuje (stačí jedna vazba, aktivita smí mít víc). */
export type ActivityTarget = { jobId?: string; companyId?: string; personId?: string };

/** Typ záznamu, ke kterému se píše poznámka a nahrávají soubory: zakázka, jinak osoba, jinak firma. */
export function mainTarget(t: ActivityTarget): { type: NoteTarget; id: string } | null {
  if (t.jobId) return { type: "job", id: t.jobId };
  if (t.personId) return { type: "person", id: t.personId };
  if (t.companyId) return { type: "company", id: t.companyId };
  return null;
}

/** Aktivní typy aktivit (hovor, schůzka…) v pořadí z nastavení. */
export function useActivityTypes() {
  return useCommandQuery<ActivityTypeDto[]>("crm.activity.types", {});
}

/** Dotaz na „Další kroky“ (nadcházející aktivity a připnuté poznámky) záznamu. */
export const useUpcoming = (
  t: ActivityTarget & { aggregate?: boolean; limit?: number },
  enabled = true,
) => useCommandQuery<UpcomingResult>("crm.activity.listUpcoming", t, { enabled });

/** Dotaz na časovou osu záznamu. */
export const useTimeline = (t: ActivityTarget & { aggregate?: boolean; limit?: number }) =>
  useCommandQuery<TimelineResult>("crm.timeline.get", t);

/** Dotaz na seznam aktivit s časovým filtrem a typem. */
export const useActivityList = (input: {
  scope: "mine" | "all";
  range: string;
  typeKey?: string;
  limit: number;
}) => useCommandQuery<ListMineResult>("crm.activity.listMine", input);

/** Barva termínu podle stavu: po termínu červeně, dnes zeleně, ostatní tlumeně. */
export const DUE_TONE: Record<ActivityDueState, string> = {
  overdue: "text-danger",
  today: "text-success",
  future: "text-muted",
  nodate: "text-faint",
  done: "text-faint",
};

export function TypeIcon({ icon, className }: { icon: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("flex size-4 shrink-0 items-center justify-center text-muted", className)}
    >
      <Icon name={icon} className="size-4" />
    </span>
  );
}

/** Termín jako text („Dnes 14:30“, „Zítra“) v barvě stavu; hotová aktivita ukáže, kdy byla dokončena. */
export function DueText({ activity, className }: { activity: ActivityDto; className?: string }) {
  const done = activity.state === "done";
  const text = done
    ? `Hotovo ${formatInstant(activity.doneAt, { time: false })}`
    : formatDue(activity.dueAt, activity.allDay);
  return (
    <span className={cn("tabular whitespace-nowrap", DUE_TONE[activity.state], className)}>
      {text}
    </span>
  );
}

/** Podtitulek řádku aktivity: délka, místo, zakázka, osoba. */
export function activityMeta(a: ActivityDto, opts: { context?: boolean } = {}): string {
  return [
    formatDuration(a.durationMin),
    a.location,
    opts.context ? a.jobTitle : null,
    opts.context ? a.personName : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Odkaz na detail obchodu v pop-upu CRM. */
export const dealHref = (jobId: string) => `/crm?record=${jobId}`;
