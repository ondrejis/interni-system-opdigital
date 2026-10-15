"use client";

import { formatDate } from "@rebar/core/shared";
import { addDaysIso, todayIso, weekStartIso } from "@rebar/core/time";
import {
  Button,
  Chip,
  EmptyState,
  IconButton,
  SegmentedControl,
  Skeleton,
  cn,
  useCommandMutation,
  useCommandQuery,
  Icon,
} from "@rebar/ui";
import { useEffect, useRef, useState } from "react";
import type { CellSaveInput, CellSaveOutput, EntryDto, JobRef, WeekOutput } from "../contract";
import { formatDuration, parseCellDuration } from "../logic/parse-time";
import { LogTimeDialog, type LogTimeTarget } from "./log-time-dialog";
import { JobPicker, jobLabel, showMinutes, useDurationFormat } from "./shared";

const DAY = ["po", "út", "st", "čt", "pá", "so", "ne"];
const dayLabel = (date: string, i: number) =>
  `${DAY[i]} ${Number(date.slice(8))}. ${Number(date.slice(5, 7))}.`;

/** Jedna buňka mřížky: textové pole, které se při opuštění nebo Enteru uloží (`hodiny.cell.save`). */
function Cell({
  job,
  date,
  gridMinutes,
  taskMinutes,
  format,
  onError,
  inputId,
}: {
  job: JobRef;
  date: string;
  gridMinutes: number;
  taskMinutes: number;
  format: "hm" | "decimal";
  onError: (message: string | null) => void;
  inputId: string;
}) {
  const shown = gridMinutes > 0 ? formatDuration(gridMinutes, format) : "";
  const [text, setText] = useState(shown);
  const [invalid, setInvalid] = useState(false);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(shown);
  }, [shown]);
  const save = useCommandMutation<CellSaveInput, CellSaveOutput>("hodiny.cell.save", {
    onSuccess: () => onError(null),
  });

  function commit() {
    focused.current = false;
    const parsed = parseCellDuration(text);
    if (!parsed.ok) {
      setInvalid(true);
      onError(parsed.error);
      return;
    }
    setInvalid(false);
    if (parsed.minutes === gridMinutes) {
      setText(shown);
      onError(null);
      return;
    }
    save.mutate(
      { jobId: job.id, date, time: text },
      {
        onError: (e) => {
          setInvalid(true);
          onError(e.message);
        },
      },
    );
  }

  return (
    <div className="flex flex-col items-stretch">
      <input
        id={inputId}
        data-testid={`cell-${job.id}-${date}`}
        aria-label={`${jobLabel(job)}, ${formatDate(date)}`}
        aria-invalid={invalid || undefined}
        inputMode="text"
        autoComplete="off"
        value={text}
        placeholder="–"
        onFocus={(e) => {
          focused.current = true;
          e.currentTarget.select();
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setText(shown);
            setInvalid(false);
            onError(null);
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        className={cn(
          "tabular w-full rounded-md border border-line bg-bg px-2 py-1.5 text-right outline-none focus:border-[var(--accent-line)]",
          invalid && "border-danger",
          save.isPending && "opacity-60",
        )}
      />
      {taskMinutes > 0 && (
        <span className="tabular text-right text-xs text-muted" title="Zapsáno u úkolů">
          + {formatDuration(taskMinutes, format)}
        </span>
      )}
    </div>
  );
}

/** Týdenní výkaz (HOD-01): mřížka zakázka × den, navigace po týdnech, součty, záznamy týdne. */
export function WeekView({
  initialWeek,
  openLog,
}: {
  initialWeek?: string | undefined;
  openLog?: boolean;
}) {
  const [weekStart, setWeekStart] = useState(weekStartIso(initialWeek ?? todayIso()));
  const [format, setFormat] = useDurationFormat();
  const [extra, setExtra] = useState<JobRef[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [dialog, setDialog] = useState<LogTimeTarget | null>(openLog ? {} : null);
  const q = useCommandQuery<WeekOutput>("hodiny.week", { weekStart });
  const w = q.data;
  const today = todayIso();

  const rows = w
    ? [
        ...w.rows.map((r) => ({ job: r.job, cells: r.cells, total: r.totalMinutes })),
        ...extra
          .filter((j) => !w.rows.some((r) => r.job.id === j.id))
          .map((j) => ({ job: j, cells: {} as WeekOutputCells, total: 0 })),
      ]
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <IconButton
          label="Předchozí týden"
          variant="secondary"
          onClick={() => setWeekStart(addDaysIso(weekStart, -7))}
        >
          <Icon name="chevron-left" />
        </IconButton>
        <div className="min-w-48 text-center font-medium" data-testid="week-label">
          {formatDate(weekStart)} – {formatDate(addDaysIso(weekStart, 6))}
        </div>
        <IconButton
          label="Další týden"
          variant="secondary"
          onClick={() => setWeekStart(addDaysIso(weekStart, 7))}
        >
          <Icon name="chevron-right" />
        </IconButton>
        <Button variant="ghost" onClick={() => setWeekStart(weekStartIso(today))}>
          Tento týden
        </Button>
        <div className="ml-auto flex items-center gap-3">
          {w && (
            <span className="tabular text-muted" data-testid="week-total">
              Celkem {formatDuration(w.totalMinutes, format)} h
            </span>
          )}
          <SegmentedControl
            label="Zobrazení času"
            value={format}
            onChange={setFormat}
            options={[
              { value: "hm", label: "1:30" },
              { value: "decimal", label: "1,5" },
            ]}
          />
          <Button variant="secondary" onClick={() => setDialog({ date: today })}>
            <Icon name="plus" /> Zapsat čas
          </Button>
        </div>
      </div>

      {q.isLoading || !w ? (
        <Skeleton className="h-48" />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[44rem] border-collapse text-sm" data-testid="week-grid">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="sticky left-0 min-w-52 bg-bg px-3 py-2 font-medium">Zakázka</th>
                {w.days.map((d, i) => (
                  <th
                    key={d.date}
                    title={d.holiday ?? undefined}
                    className={cn(
                      "min-w-20 px-2 py-2 text-right font-medium capitalize",
                      !d.workday && "bg-subtle text-muted",
                      d.date === today && "text-accent",
                    )}
                  >
                    {dayLabel(d.date, i)}
                  </th>
                ))}
                <th className="min-w-20 px-3 py-2 text-right font-medium">Součet</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.job.id}
                  className="border-b border-line last:border-0"
                  data-job={r.job.id}
                >
                  <th scope="row" className="sticky left-0 bg-bg px-3 py-2 text-left font-normal">
                    <div className="font-medium">{r.job.title}</div>
                    {r.job.number && <div className="text-xs text-muted">{r.job.number}</div>}
                  </th>
                  {w.days.map((d) => {
                    const c = r.cells[d.date];
                    return (
                      <td
                        key={d.date}
                        className={cn("px-1.5 py-1.5 align-top", !d.workday && "bg-subtle")}
                      >
                        <Cell
                          inputId={`c-${r.job.id}-${d.date}`}
                          job={r.job}
                          date={d.date}
                          gridMinutes={c?.gridMinutes ?? 0}
                          taskMinutes={c?.taskMinutes ?? 0}
                          format={format}
                          onError={setProblem}
                        />
                      </td>
                    );
                  })}
                  <td
                    className="tabular px-3 py-2 text-right font-medium"
                    data-testid={`row-total-${r.job.id}`}
                  >
                    {showMinutes(r.total, format)}
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={9} className="p-2">
                    <EmptyState
                      title="Tento týden nic nezapsáno"
                      description="Přidejte zakázku a napište čas do buňky, např. 1,5 nebo 1:30."
                    />
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-line bg-subtle">
                <th className="sticky left-0 bg-subtle px-3 py-2 text-left font-medium">Celkem</th>
                {w.days.map((d) => (
                  <td
                    key={d.date}
                    className="tabular px-2 py-2 text-right font-medium"
                    data-testid={`day-total-${d.date}`}
                  >
                    {showMinutes(d.minutes, format)}
                  </td>
                ))}
                <td className="tabular px-3 py-2 text-right font-semibold">
                  {showMinutes(w.totalMinutes, format)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {problem && (
        <p role="alert" className="text-sm text-danger" data-testid="grid-error">
          {problem}
        </p>
      )}

      {w && (
        <div className="flex flex-wrap items-center gap-2">
          <JobPicker
            value={null}
            placeholder="Přidat zakázku do výkazu…"
            onChange={(j) => j && setExtra((x) => (x.some((e) => e.id === j.id) ? x : [...x, j]))}
            className="w-72"
          />
          {w.recentJobs
            .filter((j) => !rows.some((r) => r.job.id === j.id))
            .map((j) => (
              <button
                key={j.id}
                type="button"
                className="rounded-full border border-line px-3 py-1 text-sm text-muted hover:border-line-strong hover:text-fg"
                onClick={() => setExtra((x) => [...x, j])}
              >
                + {j.title}
              </button>
            ))}
        </div>
      )}

      {w && w.entries.length > 0 && (
        <section aria-label="Záznamy týdne">
          <h3 className="mb-2 font-medium">Záznamy týdne</h3>
          <ul
            className="divide-y divide-line rounded-lg border border-line"
            data-testid="week-entries"
          >
            {w.entries.map((e) => (
              <EntryRow
                key={e.id}
                e={e}
                w={w}
                format={format}
                onOpen={() =>
                  setDialog({
                    entry: e,
                    job: w.rows.find((r) => r.job.id === e.jobId)?.job ?? null,
                    taskTitle: e.taskTitle,
                  })
                }
              />
            ))}
          </ul>
        </section>
      )}

      {dialog && (
        <LogTimeDialog
          key={dialog.entry?.id ?? "new"}
          open
          onOpenChange={(o) => !o && setDialog(null)}
          target={dialog}
        />
      )}
    </div>
  );
}

type WeekOutputCells = WeekOutput["rows"][number]["cells"];

function EntryRow({
  e,
  w,
  format,
  onOpen,
}: {
  e: EntryDto;
  w: WeekOutput;
  format: "hm" | "decimal";
  onOpen: () => void;
}) {
  const job = w.rows.find((r) => r.job.id === e.jobId)?.job;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-subtle"
      >
        <span className="tabular w-20 text-muted">{formatDate(e.date)}</span>
        <span className="tabular w-14 font-medium">{formatDuration(e.minutes, format)}</span>
        <span className="min-w-0 flex-1 truncate">
          {job?.title ?? "Zakázka"}
          {e.taskTitle && <Chip className="ml-2">{e.taskTitle}</Chip>}
          {e.note && <span className="ml-2 text-muted">{e.note}</span>}
        </span>
      </button>
    </li>
  );
}
