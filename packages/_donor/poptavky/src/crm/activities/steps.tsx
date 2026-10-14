"use client";

import {
  Card,
  CardBody,
  CardHeader,
  Icon,
  IconButton,
  Skeleton,
  cn,
  errorToast,
  useCommandMutation,
} from "@rebar/ui";
import { ActivityLine, useCompleteActivity } from "./activity-actions";
import { useUpcoming, type ActivityTarget } from "./ui-shared";
import type { NoteDto } from "./types";

/** Připnutá poznámka: text s tlačítkem pro odepnutí. */
function PinnedNote({ note }: { note: NoteDto }) {
  const pin = useCommandMutation<{ id: string; pinned: boolean }, NoteDto>("crm.note.pin");
  return (
    <li className="flex items-start gap-2 rounded-md bg-warning-soft px-2 py-1.5">
      <Icon name="pin" className="mt-1 size-4 shrink-0 text-warning" />
      <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-base">{note.body}</p>
      <IconButton
        label="Odepnout poznámku"
        size="sm"
        onClick={() =>
          pin.mutate(
            { id: note.id, pinned: false },
            { onError: (e) => errorToast((e as Error).message) },
          )
        }
      >
        <Icon name="x" />
      </IconButton>
    </li>
  );
}

/**
 * „Další kroky“: nadcházející aktivity (nejbližší termín první, po termínu červeně) a připnuté poznámky. Aktivitu lze
 * odškrtnout rovnou v seznamu (pak se nabídne další), odložit, upravit nebo smazat. U firmy a osoby (`aggregate`) i ze
 * všech jejích zakázek.
 */
export function UpcomingSteps({ aggregate, ...target }: ActivityTarget & { aggregate?: boolean }) {
  const q = useUpcoming({ ...target, ...(aggregate ? { aggregate } : {}) });
  const { complete, busyId, dialog } = useCompleteActivity();
  const activities = q.data?.activities ?? [];
  const notes = q.data?.notes ?? [];
  const empty = !!q.data && !activities.length && !notes.length;
  return (
    <Card aria-label="Další kroky" data-testid="upcoming-steps">
      <CardHeader
        title="Další kroky"
        icon={<Icon name="calendar-clock" />}
        count={
          q.data && activities.length + notes.length > 0
            ? activities.length + notes.length
            : undefined
        }
      />
      <CardBody flush className="p-2">
        {q.isLoading ? (
          <Skeleton className="m-2 h-16" />
        ) : q.isError ? (
          <p className="p-2 text-sm text-danger">Další kroky se nepodařilo načíst.</p>
        ) : empty ? (
          <p
            className={cn(
              "m-2 flex items-center gap-2 rounded-md border border-dashed border-line-strong bg-warning-soft/40 px-3 py-2.5 text-muted",
            )}
          >
            <Icon name="circle-alert" className="size-4 shrink-0 text-warning" />
            Zatím nic není naplánováno. Naplánujte další krok, ať obchod nestojí.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {notes.map((n) => (
              <PinnedNote key={n.id} note={n} />
            ))}
            {activities.map((a) => (
              <ActivityLine
                key={a.id}
                activity={a}
                onComplete={(x) => void complete(x)}
                busy={busyId === a.id}
                context={!!aggregate}
              />
            ))}
          </ul>
        )}
      </CardBody>
      {dialog}
    </Card>
  );
}
