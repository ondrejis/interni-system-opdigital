"use client";

import {
  Button,
  Icon,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
  KanbanInteractive,
  cn,
  type KanbanCardContext,
} from "@rebar/ui";
import { useState, type ComponentType } from "react";
import { ActivityLine, useCompleteActivity } from "./activity-actions";
import { ActivityComposer } from "./composer";
import { nextActivityLook, nextActivityTone } from "./next-label";
import { useUpcoming } from "./ui-shared";

/** Barva textu čipu podle toho, který signál má na kartě přednost (viz `nextActivityTone`). */
const TONE_CLASS = {
  danger: "text-danger hover:bg-danger-soft",
  success: "text-success hover:bg-success-soft",
  muted: "text-muted hover:bg-hover hover:text-fg",
} as const;

/**
 * Stav další aktivity na kartě nástěnky jako malý čip s ikonou a textem: „Dnes 14:00“ (zeleně), „Zítra“ (šedě),
 * „Po termínu 2 d“ (červeně), „Naplánovat“ (šedě, když nic není naplánované). Žádné barevné kolečko ani varovný
 * vykřičník; červená je jen u aktivity po termínu a zelená jen u dnešní, když zakázka zároveň nehnije (jeden výrazný
 * signál na kartě). Klik otevře popover s nadcházejícími aktivitami zakázky (odškrtnutí, odložení) a s naplánováním
 * další, bez otevření zakázky. Obaluje se do `KanbanInteractive`, takže klik ani tah kartu neotevře ani nepřesune.
 */
export const NextActivityIcon: ComponentType<KanbanCardContext> = ({ row }) => {
  const [open, setOpen] = useState(false);
  const [planning, setPlanning] = useState(false);
  const upcoming = useUpcoming({ jobId: row.id, limit: 6 }, open);
  const { complete, busyId, dialog } = useCompleteActivity();
  const nextAt = (row.crmNextActivityAt as string | null | undefined) ?? null;
  const count = Number(row.crmOpenActivities ?? 0);
  const look = nextActivityLook(nextAt, count);
  const tone = TONE_CLASS[nextActivityTone(look.state, !!row.crmRotting)];
  const activities = upcoming.data?.activities ?? [];
  const showComposer = planning || (!!upcoming.data && activities.length === 0);

  return (
    <KanbanInteractive className="-ml-1.5 min-w-0">
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setPlanning(false);
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={look.hint}
            title={look.hint}
            data-activity-state={look.state}
            className={cn(
              "inline-flex h-6 max-w-full items-center gap-1.5 rounded-md px-1.5 text-sm transition-colors pointer-coarse:px-2",
              tone,
            )}
          >
            <Icon name={look.icon} className="size-3.5 shrink-0" />
            <span className="truncate">{look.text}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-[min(22rem,calc(100vw-2rem))] p-3"
          onOpenAutoFocus={(e) => showComposer && e.preventDefault()}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Další aktivity</h3>
            {!showComposer && (
              <Button size="sm" variant="ghost" onClick={() => setPlanning(true)}>
                <Icon name="plus" /> Naplánovat
              </Button>
            )}
          </div>
          {upcoming.isLoading ? (
            <Skeleton className="h-14" />
          ) : upcoming.isError ? (
            <p className="text-sm text-danger">Aktivity se nepodařilo načíst.</p>
          ) : (
            activities.length > 0 && (
              <ul className="-mx-2 mb-2 max-h-72 space-y-0.5 overflow-y-auto">
                {activities.map((a) => (
                  <ActivityLine
                    key={a.id}
                    activity={a}
                    compact
                    onComplete={(x) => void complete(x)}
                    busy={busyId === a.id}
                  />
                ))}
              </ul>
            )
          )}
          {upcoming.data && activities.length === 0 && (
            <p className="mb-3 flex items-center gap-2 text-muted">
              <Icon name="calendar-plus" className="size-4 shrink-0 text-faint" />
              Žádná aktivita. Naplánujte další krok.
            </p>
          )}
          {showComposer && (
            <div className={cn(activities.length > 0 && "border-t border-line pt-3")}>
              <ActivityComposer jobId={row.id} onCreated={() => setPlanning(false)} autoFocus />
            </div>
          )}
        </PopoverContent>
      </Popover>
      {dialog}
    </KanbanInteractive>
  );
};
