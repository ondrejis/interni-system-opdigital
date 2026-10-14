"use client";

import {
  Avatar,
  Button,
  EmptyState,
  Icon,
  Skeleton,
  cn,
  errorToast,
  successToast,
  useCommandMutation,
  useNav,
} from "@rebar/ui";
import { useState } from "react";
import {
  ActivityRowMenu,
  CompleteCircle,
  PriorityMark,
  useCompleteActivity,
} from "./activity-actions";
import { DueText, TypeIcon, dealHref, useActivityList, useActivityTypes } from "./ui-shared";
import { formatDuration } from "./logic";
import { RANGE_LABELS, type ActivityDto, type ActivityRange } from "./types";

const RANGES: ActivityRange[] = ["open", "overdue", "today", "tomorrow", "week", "nextWeek"];
const PAGE = 100;

const selectClass =
  "h-8 rounded-md border border-line-strong bg-bg px-2 text-base text-fg transition-colors hover:border-faint focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-line)]";

/**
 * Seznam aktivit s rychlými filtry (typ a čas: k dokončení, po termínu, dnes, zítra, tento týden, příští týden, hotové),
 * sloupci Hotovo, Předmět, Zakázka, Priorita, Kontakt, Firma a Termín. Dnešní řádky jsou zvýrazněné; aktivitu lze odškrtnout
 * (pak se nabídne další), naplánovat navazující, odložit nebo upravit přímo v řádku. `scope: "mine"` = přiřazené mně.
 * Na telefonu se řádky zobrazí jako karty.
 */
export function ActivityList({
  scope,
  range: initialRange,
  limit,
  hideFilters,
}: {
  scope: "mine" | "all";
  range?: ActivityRange;
  limit?: number;
  /** Bez lišty filtrů (seznam s pevným rozsahem, např. widget). */
  hideFilters?: boolean;
}) {
  const [range, setRange] = useState<ActivityRange>(initialRange ?? "open");
  const [typeKey, setTypeKey] = useState("");
  const [shown, setShown] = useState(limit ?? PAGE);
  const types = useActivityTypes();
  const q = useActivityList({ scope, range, ...(typeKey ? { typeKey } : {}), limit: shown });
  const { complete, busyId, dialog } = useCompleteActivity();
  const reopen = useCommandMutation<{ id: string }, ActivityDto>("crm.activity.reopen");
  const rows = q.data?.rows ?? [];
  const total = q.data?.total ?? 0;

  const doReopen = (a: ActivityDto) =>
    reopen.mutate(
      { id: a.id },
      {
        onSuccess: () => successToast("Aktivita je znovu otevřená."),
        onError: (e) => errorToast((e as Error).message),
      },
    );

  return (
    <div className="space-y-3">
      {!hideFilters && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Časový filtr">
            {[...RANGES, "done" as const].map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={range === r}
                onClick={() => {
                  setRange(r);
                  setShown(limit ?? PAGE);
                }}
                className={cn(
                  "h-7 rounded-full border px-3 text-sm font-medium transition-colors pointer-coarse:h-11",
                  range === r
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line-strong text-muted hover:bg-hover hover:text-fg",
                  r === "overdue" && range !== r && "text-danger",
                )}
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>
          {types.data && types.data.length > 0 && (
            <label className="ml-auto flex items-center gap-2 text-sm text-muted">
              Typ
              <select
                aria-label="Typ aktivity"
                className={selectClass}
                value={typeKey}
                onChange={(e) => setTypeKey(e.target.value)}
              >
                <option value="">Všechny typy</option>
                {types.data.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {q.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
        </div>
      ) : q.isError ? (
        <p className="text-sm text-danger">Aktivity se nepodařilo načíst.</p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Icon name="calendar-check" />}
          title={range === "done" ? "Žádné hotové aktivity" : "Nic k vyřízení"}
          description={
            range === "overdue"
              ? "Nic není po termínu."
              : "V tomto výběru nejsou žádné aktivity. Naplánujte je v detailu zakázky, firmy nebo osoby."
          }
        />
      ) : (
        <>
          <ActivityTable
            rows={rows}
            busyId={busyId}
            onComplete={(a) => void complete(a)}
            onReopen={doReopen}
          />
          <ActivityCards
            rows={rows}
            busyId={busyId}
            onComplete={(a) => void complete(a)}
            onReopen={doReopen}
          />
          {rows.length < total && (
            <div className="flex justify-center">
              <Button
                variant="secondary"
                onClick={() => setShown((n) => n + PAGE)}
                loading={q.isFetching}
              >
                Zobrazit další ({total - rows.length})
              </Button>
            </div>
          )}
        </>
      )}
      {dialog}
    </div>
  );
}

type RowsProps = {
  rows: ActivityDto[];
  busyId: string | null;
  onComplete: (a: ActivityDto) => void;
  onReopen: (a: ActivityDto) => void;
};

const rowTone = (a: ActivityDto) =>
  a.state === "today" ? "bg-accent-soft" : a.state === "overdue" ? "bg-danger-soft/40" : "";

function DealLink({ a }: { a: ActivityDto }) {
  const { Link } = useNav();
  if (!a.jobId) return <span className="text-faint">—</span>;
  if (!a.jobTitle) return <span className="text-faint">—</span>;
  return (
    <Link
      href={dealHref(a.jobId)}
      className="block truncate text-accent hover:underline"
      title={a.jobTitle}
    >
      {a.jobTitle}
    </Link>
  );
}

function ActivityTable({ rows, busyId, onComplete, onReopen }: RowsProps) {
  return (
    <div className="hidden overflow-x-auto rounded-lg border border-line md:block">
      <table className="w-full min-w-[56rem] border-collapse text-left text-base">
        <thead className="bg-subtle text-sm text-muted">
          <tr className="h-9">
            <th className="w-10 px-3 font-medium">
              <span className="sr-only">Hotovo</span>
            </th>
            <th className="px-3 font-medium">Předmět</th>
            <th className="px-3 font-medium">Zakázka</th>
            <th className="px-3 font-medium">Priorita</th>
            <th className="px-3 font-medium">Kontakt</th>
            <th className="px-3 font-medium">Firma</th>
            <th className="px-3 font-medium">Termín</th>
            <th className="w-10 px-3">
              <span className="sr-only">Akce</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((a) => (
            <tr key={a.id} className={cn("h-9", rowTone(a))} data-state={a.state}>
              <td className="px-3">
                <CompleteCircle
                  activity={a}
                  busy={busyId === a.id}
                  onComplete={onComplete}
                  onReopen={onReopen}
                />
              </td>
              <td className="max-w-80 px-3">
                <div className="flex items-center gap-2">
                  <TypeIcon icon={a.typeIcon} />
                  <span
                    className={cn(
                      "truncate font-medium",
                      a.state === "done" && "text-muted line-through",
                    )}
                    title={a.subject}
                  >
                    {a.subject}
                  </span>
                  {a.assigneeName && (
                    <span title={`Přiřazeno: ${a.assigneeName}`} className="shrink-0">
                      <Avatar name={a.assigneeName} size={18} />
                    </span>
                  )}
                </div>
              </td>
              <td className="max-w-56 px-3">
                <DealLink a={a} />
              </td>
              <td className="px-3">
                <PriorityMark priority={a.priority} />
              </td>
              <td className="max-w-40 truncate px-3 text-muted">{a.personName ?? "—"}</td>
              <td className="max-w-48 truncate px-3 text-muted">{a.companyName ?? "—"}</td>
              <td className="px-3">
                <DueText activity={a} />
                {a.durationMin && a.state !== "done" && (
                  <span className="ml-1.5 text-sm text-faint">{formatDuration(a.durationMin)}</span>
                )}
              </td>
              <td className="px-3">
                <ActivityRowMenu activity={a} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ActivityCards({ rows, busyId, onComplete, onReopen }: RowsProps) {
  return (
    <ul className="space-y-3 md:hidden">
      {rows.map((a) => (
        <li
          key={a.id}
          className={cn("rounded-lg border border-line p-4", rowTone(a))}
          data-state={a.state}
        >
          <div className="flex items-start gap-3">
            <CompleteCircle
              activity={a}
              busy={busyId === a.id}
              onComplete={onComplete}
              onReopen={onReopen}
            />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <TypeIcon icon={a.typeIcon} />
                <span
                  className={cn("font-medium", a.state === "done" && "text-muted line-through")}
                >
                  {a.subject}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 text-sm">
                <DueText activity={a} />
                <PriorityMark priority={a.priority} />
              </div>
              <DealLink a={a} />
              {(a.personName || a.companyName) && (
                <div className="text-sm text-muted">
                  {[a.personName, a.companyName].filter(Boolean).join(" · ")}
                </div>
              )}
            </div>
            <ActivityRowMenu activity={a} />
          </div>
        </li>
      ))}
    </ul>
  );
}
