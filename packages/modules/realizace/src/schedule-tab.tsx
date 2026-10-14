"use client";

import { addDaysIso, isWorkday, todayIso } from "@rebar/core/time";
import {
  Avatar,
  Button,
  DatePicker,
  Dialog,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
  cn,
  errorToast,
  successToast,
  undoToast,
  useCommandMutation,
  useCommandQuery,
} from "@rebar/ui";
import {
  CalendarRange,
  ChartGantt,
  CornerDownRight,
  Ellipsis,
  Flag,
  List,
  LocateFixed,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Gantt } from "./gantt";
import { PhaseDialog, blankDraft, draftFromPhase, type PhaseDraft } from "./phase-dialog";
import { ProgressBar, Segmented, StateIcon } from "./schedule-parts";
import {
  conflictFixes,
  dependencyConflicts,
  endAfter,
  jobProgress,
  lengthInWorkdays,
  scheduleSummary,
  shiftDependents,
  statusFromProgress,
  toWorkday,
} from "./schedule";
import {
  STATE_LABEL,
  STATE_TONE,
  ZOOMS,
  clamp,
  fitZoom,
  fmtRange,
  fmtShort,
  phaseState,
  relativeDay,
  workdaysLabel,
  type Phase,
  type PhasesData,
  type Zoom,
} from "./schedule-shared";

type View = "gantt" | "list";
type Filter = "all" | "active" | "late" | "done";
type Patch = Partial<Pick<Phase, "startDate" | "endDate" | "progress" | "status">>;

/* ---------- uložení volby pohledu v prohlížeči (jen pohodlí) ---------- */

const store = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* soukromé okno nebo zablokované úložiště: volba platí jen do zavření stránky */
    }
  },
};
const VIEW_KEY = "realizace.schedule.view";
const ZOOM_KEY = "realizace.schedule.zoom";

function initialView(): View {
  if (typeof window === "undefined") return "gantt";
  const saved = store.get(VIEW_KEY);
  if (saved === "gantt" || saved === "list") return saved;
  return window.matchMedia("(max-width: 639px)").matches ? "list" : "gantt";
}
function initialZoom(): Zoom | null {
  if (typeof window === "undefined") return null;
  const saved = store.get(ZOOM_KEY);
  return saved === "week" || saved === "month" || saved === "quarter" ? saved : null;
}

/* ---------- souhrn ---------- */

function Stat({
  icon,
  label,
  value,
  sub,
  tone,
  children,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "danger";
  /** Když je tile klikací, přijde sem tlačítko, které obalí obsah. */
  children?: (content: ReactNode) => ReactNode;
}) {
  const content = (
    <>
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted [&_svg]:size-3.5">
        {icon}
        {label}
      </span>
      <span
        title={typeof value === "string" ? value : undefined}
        className={cn(
          "mt-1 block break-words text-lg font-semibold leading-snug max-sm:line-clamp-2 sm:truncate",
          tone === "danger" && "text-danger",
        )}
      >
        {value}
      </span>
      {sub && (
        <span className="mt-0.5 block text-sm text-muted max-sm:line-clamp-2 sm:truncate">
          {sub}
        </span>
      )}
    </>
  );
  return (
    <div role="group" aria-label={label} className="min-w-0 rounded-md bg-subtle">
      {children ? children(content) : <div className="p-3">{content}</div>}
    </div>
  );
}

function Summary({
  phases,
  today,
  onOpen,
}: {
  phases: Phase[];
  today: string;
  onOpen: (id: string) => void;
}) {
  const s = scheduleSummary(phases, today);
  const progress = jobProgress(phases);
  const allDone = s.done === s.total;
  const m = s.nextMilestone;
  const [lateOpen, setLateOpen] = useState(false);
  return (
    <section aria-label="Souhrn harmonogramu" className="rounded-lg border border-line p-4">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium text-muted">Celkový postup zakázky</h3>
        <span className="tabular text-2xl font-semibold">{progress} %</span>
      </div>
      <div
        role="progressbar"
        aria-label={`Průběh zakázky ${progress} %`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        className="h-2.5 overflow-hidden rounded-full bg-hover"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-150"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={<CalendarRange />}
          label="Termín"
          value={s.start && s.end ? fmtRange(s.start, s.end) : "–"}
          sub={
            allDone
              ? "Vše hotovo"
              : s.overdue > 0
                ? `Po termínu o ${workdaysLabel(s.overdue)}`
                : s.end === today
                  ? "Končí dnes"
                  : `Zbývá ${workdaysLabel(s.remaining)}`
          }
          {...(s.overdue > 0 && !allDone ? { tone: "danger" as const } : {})}
        />
        <Stat
          icon={<ChartGantt />}
          label="Fáze"
          value={`${s.done} z ${s.total} hotovo`}
          sub={`${phases.filter((p) => phaseState(p) === "active" || phaseState(p) === "late").length} rozpracovaných`}
        />
        <Stat
          icon={<TriangleAlert />}
          label="Zpožděné fáze"
          value={s.late.length}
          sub={s.late.length ? s.late.map((p) => p.name).join(", ") : "Vše v termínu"}
          {...(s.late.length ? { tone: "danger" as const } : {})}
        >
          {s.late.length
            ? (content) => (
                <Popover open={lateOpen} onOpenChange={setLateOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Zpožděné fáze: ${s.late.length}, zobrazit seznam`}
                      className="block w-full min-w-0 rounded-md p-3 text-left transition-colors duration-150 hover:bg-hover"
                    >
                      {content}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72" align="start">
                    <p className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted">
                      Zpožděné fáze
                    </p>
                    {s.late.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setLateOpen(false);
                          onOpen(p.id);
                        }}
                        className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left hover:bg-hover"
                      >
                        <span className="min-w-0 truncate">{p.name}</span>
                        <span className="tabular shrink-0 text-sm font-medium text-danger">
                          +{p.delay} d
                        </span>
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
              )
            : undefined}
        </Stat>
        <Stat
          icon={<Flag />}
          label="Nejbližší milník"
          value={m ? m.name : "Žádný"}
          sub={
            m
              ? `${fmtShort(m.startDate)} · ${relativeDay(m.startDate, today)}`
              : "Milník přidáte tlačítkem výše"
          }
        />
      </div>
    </section>
  );
}

/* ---------- seznam fází ---------- */

function ProgressControl({
  p,
  onProgress,
}: {
  p: Phase;
  onProgress: (p: Phase, v: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState(p.progress);
  const st = phaseState(p);
  useEffect(() => setLocal(p.progress), [p.progress]);
  const commit = (v: number) => onProgress(p, v);
  return (
    <div className="flex items-center gap-1">
      <IconButton
        size="sm"
        label={`Ubrat 10 % u fáze ${p.name}`}
        disabled={p.progress <= 0}
        onClick={() => commit(p.progress - 10)}
      >
        <Minus />
      </IconButton>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Postup fáze ${p.name}: ${p.progress} %, upravit`}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 transition-colors duration-150 hover:bg-hover"
          >
            <ProgressBar value={p.progress} state={st} className="flex-1" />
            <span className="tabular w-12 whitespace-nowrap text-right text-sm font-medium">
              {p.progress} %
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3" align="center">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-sm font-medium text-muted">{p.name}</span>
            <span className="tabular text-lg font-semibold">{local} %</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={local}
            aria-label="Postup v procentech"
            onChange={(e) => setLocal(Number(e.target.value))}
            onPointerUp={() => commit(local)}
            onKeyUp={() => commit(local)}
            className="w-full accent-[var(--accent)]"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {[0, 25, 50, 75, 100].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  commit(v);
                  setOpen(false);
                }}
                className="inline-flex h-6 items-center rounded-full border border-line-strong px-2.5 text-xs font-medium text-muted transition-colors duration-150 hover:bg-hover hover:text-fg"
              >
                {v === 100 ? "Hotovo" : `${v} %`}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      <IconButton
        size="sm"
        label={`Přidat 10 % u fáze ${p.name}`}
        disabled={p.progress >= 100}
        onClick={() => commit(p.progress + 10)}
      >
        <Plus />
      </IconButton>
    </div>
  );
}

function DateButton({ date, children }: { date: string; children: ReactNode }) {
  return (
    <span className="tabular rounded px-1 py-0.5" title={date}>
      {children}
    </span>
  );
}

function PhaseList({
  phases,
  canWrite,
  onOpen,
  onProgress,
  onDates,
}: {
  phases: Phase[];
  canWrite: boolean;
  onOpen: (id: string) => void;
  onProgress: (p: Phase, v: number) => void;
  onDates: (p: Phase, start: string, end: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const counts = useMemo(
    () => ({
      all: phases.length,
      active: phases.filter((p) => ["active", "late"].includes(phaseState(p))).length,
      late: phases.filter((p) => phaseState(p) === "late").length,
      done: phases.filter((p) => phaseState(p) === "done").length,
    }),
    [phases],
  );
  const shown = phases.filter((p) => {
    const st = phaseState(p);
    return (
      filter === "all" || (filter === "active" ? st === "active" || st === "late" : st === filter)
    );
  });
  const byId = new Map(phases.map((p) => [p.id, p]));

  return (
    <div className="space-y-3">
      <Segmented<Filter>
        label="Filtr fází"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "Vše", count: counts.all },
          { value: "active", label: "Probíhá", count: counts.active },
          { value: "late", label: "Zpožděné", count: counts.late },
          { value: "done", label: "Hotové", count: counts.done },
        ]}
        className="max-w-full overflow-x-auto"
      />
      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong p-6 text-center text-muted">
          V tomto filtru nejsou žádné fáze.
        </p>
      ) : (
        <ul
          className="@container divide-y divide-line overflow-hidden rounded-lg border border-line"
          data-testid="phase-list"
        >
          {shown.map((p) => {
            const st = phaseState(p);
            const pred = p.dependsOnId ? byId.get(p.dependsOnId) : undefined;
            const len = lengthInWorkdays(p.startDate, p.endDate);
            return (
              <li
                key={p.id}
                data-phase-row={p.id}
                className="grid gap-x-4 gap-y-3 p-4 @2xl:grid-cols-[minmax(0,1fr)_16rem] @2xl:items-center"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <StateIcon state={st} milestone={p.milestone} className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onOpen(p.id)}
                        className="min-w-0 truncate text-left font-medium hover:underline"
                        title={p.name}
                      >
                        {p.name}
                      </button>
                      <span
                        className={cn(
                          "shrink-0 text-xs font-medium",
                          st === "planned" ? "text-muted" : STATE_TONE[st].text,
                        )}
                      >
                        {p.milestone && st === "done" ? "Splněno" : STATE_LABEL[st]}
                        {st === "late" && p.delay > 0 ? ` +${p.delay} d` : ""}
                      </span>
                      <IconButton
                        size="sm"
                        label={`Upravit ${p.milestone ? "milník" : "fázi"} ${p.name}`}
                        className="ml-auto shrink-0"
                        onClick={() => onOpen(p.id)}
                      >
                        <Pencil />
                      </IconButton>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                      {canWrite ? (
                        <span className="flex items-center gap-1">
                          <DatePicker
                            value={p.startDate}
                            clearable={false}
                            onChange={(v) => v && onDates(p, v, p.endDate)}
                            trigger={
                              <button
                                type="button"
                                aria-label={`${p.milestone ? "Datum" : "Začátek"} fáze ${p.name}: ${fmtShort(p.startDate)}`}
                                className="tabular rounded px-1 py-0.5 hover:bg-hover hover:text-fg"
                              >
                                {fmtShort(p.startDate)}
                              </button>
                            }
                          />
                          {!p.milestone && (
                            <>
                              –
                              <DatePicker
                                value={p.endDate}
                                clearable={false}
                                onChange={(v) => v && onDates(p, p.startDate, v)}
                                trigger={
                                  <button
                                    type="button"
                                    aria-label={`Konec fáze ${p.name}: ${fmtShort(p.endDate)}`}
                                    className="tabular rounded px-1 py-0.5 hover:bg-hover hover:text-fg"
                                  >
                                    {fmtShort(p.endDate)}
                                  </button>
                                }
                              />
                            </>
                          )}
                        </span>
                      ) : (
                        <DateButton date={p.startDate}>
                          {fmtRange(p.startDate, p.endDate)}
                        </DateButton>
                      )}
                      {!p.milestone && <span className="tabular">{workdaysLabel(len)}</span>}
                      {pred && (
                        <span
                          className="inline-flex min-w-0 items-center gap-1"
                          title={`Navazuje na ${pred.name}`}
                        >
                          <CornerDownRight className="size-3.5 shrink-0" aria-hidden />
                          <span className="truncate">{pred.name}</span>
                        </span>
                      )}
                      {p.responsibleName && (
                        <span className="inline-flex min-w-0 items-center gap-1.5">
                          <Avatar name={p.responsibleName} size={18} />
                          <span className="truncate">{p.responsibleName}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {p.milestone ? (
                  <div className="@2xl:justify-self-end">
                    <Button
                      size="sm"
                      variant={st === "done" ? "ghost" : "secondary"}
                      onClick={() => onProgress(p, st === "done" ? 0 : 100)}
                    >
                      {st === "done" ? "Vrátit na nesplněno" : "Označit jako splněno"}
                    </Button>
                  </div>
                ) : (
                  <ProgressControl p={p} onProgress={onProgress} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ---------- legenda ---------- */

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
      {(["planned", "active", "late", "done"] as const).map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-3 rounded-[3px]"
            style={{
              background: STATE_TONE[s].track,
              boxShadow: `inset 0 0 0 1px ${STATE_TONE[s].edge}`,
            }}
          />
          {STATE_LABEL[s]}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden
          className="size-2.5 rotate-45 rounded-[2px] border-2 border-accent bg-accent-soft"
        />
        Milník
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-[3px] w-4 rounded-full bg-faint/70" />
        Výchozí plán
      </span>
    </div>
  );
}

/* ---------- záložka ---------- */

export function ScheduleTab({ id, canWrite = true }: { id: string; canWrite?: boolean }) {
  const q = useCommandQuery<PhasesData>("realizace.phases.list", { jobId: id });
  const [view, setViewState] = useState<View>(initialView);
  const [zoomChoice, setZoomChoice] = useState<Zoom | null>(initialZoom);
  const [autoZoom, setAutoZoom] = useState<Zoom | null>(null);
  const [todayToken, setTodayToken] = useState(0);
  const [draft, setDraft] = useState<PhaseDraft | null>(null);
  const [confirmBaseline, setConfirmBaseline] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [opt, setOpt] = useState<{ at: number; patches: Record<string, Patch> } | null>(null);
  const [inflight, setInflight] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const today = todayIso();

  const move = useCommandMutation<
    { jobId: string; id: string; startDate: string; endDate: string; shift: boolean },
    { shifted: number }
  >("realizace.phases.move");
  const setProgress = useCommandMutation<{ jobId: string; id: string; progress: number }>(
    "realizace.phases.setProgress",
  );
  const baseline = useCommandMutation<{ jobId: string }>("realizace.phases.setBaseline", {
    onSuccess: () => {
      successToast("Harmonogram je uložen jako výchozí plán.");
      setConfirmBaseline(false);
    },
  });

  /** Změny se hned ukážou (bez poskakování), než server odpoví a seznam se znovu načte. */
  const phases = useMemo<Phase[]>(() => {
    const server = q.data?.phases ?? [];
    const patches = opt && (inflight > 0 || opt.at === q.dataUpdatedAt) ? opt.patches : null;
    return server.map((p) => {
      const patch = patches?.[p.id];
      return {
        ...p,
        ...(patch ?? {}),
        responsibleName: p.responsibleId ? q.data?.users[p.responsibleId] : undefined,
      };
    });
  }, [q.data, q.dataUpdatedAt, opt, inflight]);

  const zoom: Zoom = zoomChoice ?? autoZoom ?? "month";
  useEffect(() => {
    if (autoZoom || !phases.length) return;
    const start = phases.map((p) => p.startDate).sort()[0]!;
    const end = phases
      .map((p) => p.endDate)
      .sort()
      .reverse()[0]!;
    const width = (wrap.current?.clientWidth ?? 900) - 250;
    setAutoZoom(fitZoom(start, end, Math.max(320, width)));
  }, [phases, autoZoom]);

  const setView = (v: View) => {
    setViewState(v);
    store.set(VIEW_KEY, v);
  };
  const setZoom = (z: Zoom) => {
    setZoomChoice(z);
    store.set(ZOOM_KEY, z);
  };

  const patch = (patches: Record<string, Patch>) =>
    setOpt((o) => ({
      at: q.dataUpdatedAt,
      patches: { ...(o && o.at === q.dataUpdatedAt ? o.patches : {}), ...patches },
    }));

  async function run(label: string, task: () => Promise<unknown>) {
    setInflight((n) => n + 1);
    try {
      await task();
      return true;
    } catch (e) {
      setOpt(null);
      errorToast((e as Error).message || `${label} se nepovedlo.`);
      return false;
    } finally {
      setInflight((n) => n - 1);
    }
  }

  function commitMove(pid: string, startDate: string, endDate: string) {
    const p = phases.find((x) => x.id === pid);
    if (!p || (p.startDate === startDate && p.endDate === endDate)) return;
    const next = phases.map((x) => (x.id === pid ? { ...x, startDate, endDate } : x));
    const moved = shiftDependents(next, pid);
    const patches: Record<string, Patch> = { [pid]: { startDate, endDate } };
    for (const m of moved) patches[m.id] = { startDate: m.startDate, endDate: m.endDate };
    const original = [p, ...moved.map((m) => phases.find((x) => x.id === m.id)!)];
    patch(patches);
    void (async () => {
      const ok = await run("Přesun fáze", () =>
        move.mutateAsync({ jobId: id, id: pid, startDate, endDate, shift: true }),
      );
      if (!ok) return;
      undoToast(
        `„${p.name}“ přesunuto na ${fmtRange(startDate, endDate)}${
          moved.length ? `, posunuto navazujících: ${moved.length}` : ""
        }.`,
        async () => {
          const back: Record<string, Patch> = {};
          for (const o of original) back[o.id] = { startDate: o.startDate, endDate: o.endDate };
          patch(back);
          await run("Vrácení změny", async () => {
            for (const o of original)
              await move.mutateAsync({
                jobId: id,
                id: o.id,
                startDate: o.startDate,
                endDate: o.endDate,
                shift: false,
              });
          });
        },
      );
    })();
  }

  function commitDates(p: Phase, start: string, end: string) {
    if (!p.milestone && end < start) return errorToast("Konec fáze nesmí být před začátkem.");
    if (start !== p.startDate) {
      // změna začátku posune celou fázi, délka v pracovních dnech zůstane
      const s = toWorkday(start);
      return commitMove(
        p.id,
        s,
        p.milestone ? s : endAfter(s, lengthInWorkdays(p.startDate, p.endDate)),
      );
    }
    let e = end;
    while (!isWorkday(e) && e > p.startDate) e = addDaysIso(e, -1);
    commitMove(p.id, p.startDate, e);
  }

  function commitProgress(p: Phase, value: number) {
    const v = clamp(Math.round(value), 0, 100);
    if (v === p.progress) return;
    patch({ [p.id]: { progress: v, status: statusFromProgress(v) } });
    void run("Změna postupu", () => setProgress.mutateAsync({ jobId: id, id: p.id, progress: v }));
  }

  async function fixConflicts() {
    const fixes = conflictFixes(phases);
    if (!fixes.length) return;
    setFixing(true);
    const ok = await run("Přepočet návazností", async () => {
      for (const f of fixes)
        await move.mutateAsync({
          jobId: id,
          id: f.id,
          startDate: f.startDate,
          endDate: f.endDate,
          shift: true,
        });
    });
    setFixing(false);
    if (ok) successToast("Návaznosti jsou přepočítané.");
  }

  const openPhase = (pid: string) => {
    const p = phases.find((x) => x.id === pid);
    if (p) setDraft(draftFromPhase(p));
  };
  const conflicts = dependencyConflicts(phases);

  return (
    <div ref={wrap} className="space-y-4">
      {q.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-64" />
        </div>
      ) : q.isError ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger-soft p-4 text-danger"
        >
          <span>Harmonogram se nepodařilo načíst.</span>
          <Button size="sm" variant="secondary" onClick={() => void q.refetch()}>
            Zkusit znovu
          </Button>
        </div>
      ) : phases.length === 0 ? (
        <EmptyState
          icon={<CalendarRange />}
          title="Harmonogram je prázdný"
          description="Rozdělte zakázku na fáze, ať je vidět, co kdy začíná a kdo za co odpovídá. Víkendy a svátky se v plánu přeskakují."
          action={
            canWrite ? (
              <Button variant="primary" onClick={() => setDraft(blankDraft())}>
                <Plus /> Přidat první fázi
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <Summary phases={phases} today={today} onOpen={openPhase} />

          {conflicts.length > 0 && canWrite && (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border border-warning/30 bg-warning-soft p-3 text-warning"
            >
              <span className="flex min-w-0 items-center gap-2">
                <TriangleAlert className="size-4 shrink-0" aria-hidden />
                <span>
                  {conflicts.length === 1
                    ? `Fáze „${conflicts[0]!.name}“ začíná dřív, než skončí fáze, na kterou navazuje.`
                    : `${conflicts.length} fáze začínají dřív, než skončí fáze, na které navazují.`}
                </span>
              </span>
              <Button
                size="sm"
                variant="secondary"
                loading={fixing}
                onClick={() => void fixConflicts()}
              >
                <RefreshCw /> Přepočítat návaznosti
              </Button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Segmented<View>
              label="Pohled"
              value={view}
              onChange={setView}
              options={[
                { value: "gantt", label: "Gantt", icon: <ChartGantt /> },
                { value: "list", label: "Seznam", icon: <List /> },
              ]}
            />
            {view === "gantt" && (
              <>
                <Segmented<Zoom>
                  label="Přiblížení"
                  value={zoom}
                  onChange={setZoom}
                  options={ZOOMS.map((z) => ({ value: z.id, label: z.label }))}
                />
                <Button variant="secondary" onClick={() => setTodayToken((n) => n + 1)}>
                  <LocateFixed /> Dnes
                </Button>
              </>
            )}
            <div className="flex items-center gap-2 sm:ml-auto">
              {canWrite && (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => setDraft(blankDraft({ milestone: true }))}
                  >
                    <Flag /> Přidat milník
                  </Button>
                  <Button variant="primary" onClick={() => setDraft(blankDraft())}>
                    <Plus /> Přidat fázi
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <IconButton label="Další akce s harmonogramem" variant="secondary">
                        <Ellipsis />
                      </IconButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem
                        disabled={conflicts.length === 0}
                        onSelect={() => void fixConflicts()}
                      >
                        <RefreshCw /> Přepočítat návaznosti
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setConfirmBaseline(true)}>
                        <Save /> Uložit jako výchozí plán
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </div>
          </div>

          {view === "gantt" ? (
            <>
              <Gantt
                phases={phases}
                zoom={zoom}
                readOnly={!canWrite}
                todayToken={todayToken}
                onOpen={openPhase}
                onMove={commitMove}
              />
              <div className="flex flex-col gap-2">
                <Legend />
                <p className="hidden text-sm text-muted [@media(pointer:fine)]:block">
                  {canWrite
                    ? "Pruh přetáhněte nebo natáhněte za okraje, klik otevře úpravu. Šipky ←/→ posunou fázi o pracovní den, Shift+←/→ změní její konec."
                    : "Klik na pruh ukáže podrobnosti fáze."}
                </p>
              </div>
            </>
          ) : (
            <PhaseList
              phases={phases}
              canWrite={canWrite}
              onOpen={openPhase}
              onProgress={commitProgress}
              onDates={commitDates}
            />
          )}
        </>
      )}

      {draft && (
        <PhaseDialog
          key={draft.id ?? "new"}
          jobId={id}
          draft={draft}
          phases={phases}
          users={q.data?.users ?? {}}
          readOnly={!canWrite}
          onClose={() => setDraft(null)}
        />
      )}

      <Dialog open={confirmBaseline} onOpenChange={setConfirmBaseline}>
        <DialogContent
          title="Uložit jako výchozí plán?"
          description="Aktuální termíny všech fází se stanou výchozím plánem. Zpoždění se pak bude počítat od nich."
        >
          <div className="flex justify-end gap-2 px-5 py-4">
            <Button variant="ghost" onClick={() => setConfirmBaseline(false)}>
              Zrušit
            </Button>
            <Button
              variant="primary"
              loading={baseline.isPending}
              onClick={() => baseline.mutate({ jobId: id })}
            >
              Uložit výchozí plán
            </Button>
          </div>
          {baseline.error && (
            <p role="alert" className="px-5 pb-4 text-sm text-danger">
              {(baseline.error as Error).message}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
