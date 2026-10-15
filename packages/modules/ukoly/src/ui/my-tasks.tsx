"use client";

/*
  Moje úkoly (UKO-04, SPOL-07, MOB-06): pohledy Dnes / Nadcházejících 7 dní / Bez termínu / Delegované / Hotové,
  seskupení, seznam nebo board podle stavu, rychlé přidání nahoře, hromadné akce a uložené pohledy jádra (`saved_view`
  entity `task`). Na telefonu karty se swipem (Odložit, Hotovo).
*/
import {
  Button,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Field,
  Dialog,
  DialogContent,
  Icon,
  Input,
  SegmentedControl,
  Skeleton,
  cn,
  errorToast,
  successToast,
  useEntityApi,
  useHotkeys,
  useRecordParam,
  type SavedViewInfo,
} from "@rebar/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCommandQuery } from "@rebar/ui";
import type { ListTasksResult, TaskCounts, TaskDto } from "../contract";
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_VIEW_LABELS,
  type TaskPriority,
  type TaskStatus,
  type TaskView,
} from "../tasks/constants";
import { CheckRow } from "./activity-form";
import {
  BOARD_COLUMNS,
  DEFAULT_STATE,
  GROUP_LABELS,
  GROUP_MODES,
  boardColumns,
  datePresets,
  defaultGroupFor,
  fromSavedConfig,
  groupTasks,
  isOpen,
  listInput,
  toSavedConfig,
  type GroupMode,
  type ListState,
} from "./logic";
import { PriorityMenu, useTaskOps, type TaskOps } from "./ops";
import { QuickAdd } from "./quick-add";
import {
  AssigneeAvatar,
  AssigneePicker,
  DueText,
  LinkChip,
  PriorityChip,
  TypeBadge,
  guard,
  messageOf,
  selectClass,
  useIsMobile,
  useTaskTypes,
} from "./shared";
import { TaskDialog } from "./task-dialog";
import { TaskRow } from "./task-row";

const BUILTIN_VIEWS: TaskView[] = ["today", "next7", "nodate", "delegated", "done"];

/* ---------- uložené pohledy ---------- */

function useSavedViews() {
  const api = useEntityApi();
  const [views, setViews] = useState<SavedViewInfo[]>([]);
  const reload = useCallback(async () => {
    try {
      setViews(await api.views.list("task"));
    } catch {
      setViews([]);
    }
  }, [api]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { views, reload };
}

function SaveViewDialog({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (name: string, shared: boolean) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent title="Uložit pohled" description="Uloží filtr, seskupení a rozložení.">
        <form
          className="px-5 py-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return;
            setBusy(true);
            await onSave(name.trim(), shared);
            setBusy(false);
            setName("");
            setShared(false);
          }}
        >
          <Field label="Název pohledu" htmlFor="view-name">
            <Input
              id="view-name"
              autoFocus
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <CheckRow checked={shared} onChange={setShared}>
            Sdílený (uvidí ho i druhý)
          </CheckRow>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Zrušit
            </Button>
            <Button type="submit" variant="primary" loading={busy} disabled={!name.trim()}>
              Uložit
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- hromadné akce ---------- */

function BulkBar({ tasks, ops, onClear }: { tasks: TaskDto[]; ops: TaskOps; onClear: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const open = tasks.filter((t) => isOpen(t.status));

  async function each(label: string, fn: (t: TaskDto) => Promise<unknown>, list = open) {
    setBusy(true);
    const res = await Promise.allSettled(list.map(fn));
    setBusy(false);
    const failed = res.filter((r) => r.status === "rejected").length;
    if (failed) errorToast(`${label}: ${failed} z ${list.length} se nepovedlo.`);
    else successToast(`${label}: ${list.length}×`);
    onClear();
  }

  return (
    <div
      className="sticky bottom-2 z-10 mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-xl border border-line bg-bg p-2 shadow-float"
      data-testid="bulk-bar"
      role="toolbar"
      aria-label="Hromadné akce"
    >
      <span className="px-2 text-base font-medium">Vybráno {tasks.length}</span>
      <Button
        size="sm"
        disabled={busy || !open.length}
        onClick={() => void each("Hotovo", (t) => ops.actions.complete.mutateAsync({ id: t.id }))}
      >
        <Icon name="check" /> Hotovo
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" disabled={busy || !open.length}>
            <Icon name="calendar-clock" /> Termín
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {datePresets().map((p) => (
            <DropdownMenuItem
              key={p.key}
              onSelect={() =>
                void each("Termín změněn", (t) =>
                  ops.actions.reschedule.mutateAsync({ id: t.id, dueDate: p.date }),
                )
              }
            >
              {p.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() =>
              void each("Termín zrušen", (t) =>
                ops.actions.update.mutateAsync({ id: t.id, dueDate: null }),
              )
            }
          >
            Bez termínu
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" disabled={busy || !open.length}>
            <Icon name="flag" /> Priorita
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {[...TASK_PRIORITIES].reverse().map((p) => (
            <DropdownMenuItem
              key={p}
              onSelect={() =>
                void each("Priorita změněna", (t) =>
                  ops.actions.update.mutateAsync({ id: t.id, priority: p }),
                )
              }
            >
              {TASK_PRIORITY_LABELS[p]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <AssigneePicker
        value={null}
        name={null}
        label="Změnit řešitele"
        onChange={(id) => {
          if (id) void ops.assign(open, id).then(onClear);
        }}
        trigger={
          <Button size="sm" disabled={busy || !open.length}>
            <Icon name="user" /> Řešitel
          </Button>
        }
      />
      <Button
        size="sm"
        variant="ghost"
        className="text-danger"
        disabled={busy}
        onClick={() => setConfirm(true)}
      >
        <Icon name="trash" /> Smazat
      </Button>
      <Button size="sm" variant="ghost" className="ml-auto" onClick={onClear}>
        Zrušit výběr
      </Button>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Smazat ${tasks.length} úkolů?`}
        description="Úkoly půjdou do koše, odkud je jde 30 dní vrátit."
        confirmLabel="Smazat"
        danger
        onConfirm={async () => {
          await ops.remove(
            tasks.map((t) => t.id),
            `Smazáno úkolů: ${tasks.length}`,
          );
          onClear();
        }}
      />
    </div>
  );
}

/* ---------- board podle stavu ---------- */

const STATUS_ICON: Record<TaskStatus, string> = {
  todo: "list-todo",
  in_progress: "clock",
  done: "circle-check",
  canceled: "circle-x",
};

function BoardCard({ t, ops, onOpen }: { t: TaskDto; ops: TaskOps; onOpen: (id: string) => void }) {
  return (
    <li
      draggable
      data-testid="board-card"
      data-task-id={t.id}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/task-id", t.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => onOpen(t.id)}
      className="cursor-pointer rounded-lg border border-line bg-bg p-2.5 shadow-sm hover:border-line-strong"
    >
      <div className="flex items-start gap-2">
        <TypeBadge icon={t.typeIcon} color={t.typeColor} name={t.typeName} />
        <span
          className={cn(
            "min-w-0 flex-1 text-base font-medium [overflow-wrap:anywhere]",
            !isOpen(t.status) && "text-muted line-through",
          )}
        >
          {t.title}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Přesunout do stavu: ${t.title}`}
              onClick={(e) => e.stopPropagation()}
              className="rounded p-1 text-muted hover:bg-hover pointer-coarse:p-2.5"
            >
              <Icon name="more" className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
            <DropdownMenuLabel>Přesunout do</DropdownMenuLabel>
            {BOARD_COLUMNS.filter((s) => s !== t.status).map((s) => (
              <DropdownMenuItem key={s} onSelect={() => void moveTo(ops, t, s)}>
                <Icon name={STATUS_ICON[s]} /> {TASK_STATUS_LABELS[s]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <DueText task={t} />
        <PriorityMenu value={t.priority} onPick={(p: TaskPriority) => void ops.setPriority(t, p)}>
          <button type="button" aria-label="Změnit prioritu" onClick={(e) => e.stopPropagation()}>
            <PriorityChip priority={t.priority} />
          </button>
        </PriorityMenu>
        {t.job && <LinkChip kind="job" link={t.job} prefix={t.jobNumber} />}
        {t.company && !t.job && <LinkChip kind="company" link={t.company} />}
        <span className="ml-auto">
          <AssigneeAvatar name={t.assigneeName} size={20} />
        </span>
      </div>
    </li>
  );
}

/** Přesun úkolu do sloupce boardu: Hotovo jde přes dokončení (nabídka výsledku), ostatní změnou stavu. */
async function moveTo(ops: TaskOps, t: TaskDto, status: TaskStatus) {
  if (t.status === status) return;
  if (status === "done") await ops.flow.complete(t);
  else await guard(ops.actions.setStatus.mutateAsync({ id: t.id, status }));
}

function Board({
  rows,
  ops,
  onOpen,
  totalByStatus,
}: {
  rows: TaskDto[];
  ops: TaskOps;
  onOpen: (id: string) => void;
  totalByStatus?: Partial<Record<TaskStatus, number>>;
}) {
  const cols = boardColumns(rows);
  const [over, setOver] = useState<TaskStatus | null>(null);
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  return (
    <div
      className="grid snap-x auto-cols-[minmax(17rem,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2"
      data-testid="board"
    >
      {BOARD_COLUMNS.map((s) => (
        <section
          key={s}
          aria-label={TASK_STATUS_LABELS[s]}
          data-testid={`board-col-${s}`}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(s);
          }}
          onDragLeave={() => setOver((o) => (o === s ? null : o))}
          onDrop={(e) => {
            e.preventDefault();
            setOver(null);
            const t = byId.get(e.dataTransfer.getData("text/task-id"));
            if (t) void moveTo(ops, t, s);
          }}
          className={cn(
            "min-h-40 snap-start rounded-xl bg-subtle p-2 transition-colors",
            over === s && "bg-accent-soft ring-2 ring-[var(--accent-line)]",
          )}
        >
          <h3 className="mb-2 flex items-center gap-1.5 px-1 text-sm font-semibold text-muted">
            <Icon name={STATUS_ICON[s]} className="size-4" />
            {TASK_STATUS_LABELS[s]}
            <span className="tabular rounded-full bg-hover px-1.5 text-xs">
              {totalByStatus?.[s] ?? cols[s].length}
            </span>
          </h3>
          <ul className="space-y-2">
            {cols[s].map((t) => (
              <BoardCard key={t.id} t={t} ops={ops} onOpen={onOpen} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/* ---------- stránka ---------- */

const EMPTY: Record<TaskView, { title: string; text: string }> = {
  today: {
    title: "Na dnes nic nezbývá",
    text: "Žádný úkol není na dnes ani po termínu. Přidejte další v řádku nahoře.",
  },
  next7: {
    title: "Nic v nadcházejících dnech",
    text: "Na dalších 7 dní nemáte žádný úkol s termínem.",
  },
  nodate: { title: "Všechno má termín", text: "Úkoly bez termínu se objeví tady." },
  delegated: {
    title: "Nic nedelegujete",
    text: "Tady uvidíte úkoly, které jste zadal a řeší někdo jiný.",
  },
  done: { title: "Zatím nic hotového", text: "Dokončené úkoly se objeví tady." },
  all: { title: "Žádné úkoly", text: "Přidejte první v řádku nahoře." },
};

/** Stránka „Moje úkoly“ (`/ukoly`). */
export function MyTasksPage({ query }: { query?: Record<string, string> }) {
  const api = useEntityApi();
  const isMobile = useIsMobile();
  const ops = useTaskOps();
  const types = useTaskTypes();
  const { views, reload } = useSavedViews();
  const record = useRecordParam(true);
  const quickRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const [state, setState] = useState<ListState>(DEFAULT_STATE);
  const [search, setSearch] = useState("");
  const [viewId, setViewId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saveOpen, setSaveOpen] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);

  const patch = (p: Partial<ListState>) => setState((s) => ({ ...s, ...p }));
  const pickView = (view: TaskView) => {
    setViewId(null);
    setState((s) => ({
      ...s,
      view,
      group: defaultGroupFor(view),
      scope: view === "all" ? "all" : s.scope,
    }));
    setSelected(new Set());
  };

  useEffect(() => {
    const t = setTimeout(() => patch({ q: search }), 250);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    if (query?.novy === "1") quickRef.current?.focus();
  }, [query?.novy]);

  const input = useMemo(() => listInput(state), [state]);
  const list = useCommandQuery<ListTasksResult>("ukoly.list", input, { refetchInterval: 20_000 });
  const counts = useCommandQuery<TaskCounts>("ukoly.counts", {}, { refetchInterval: 20_000 });
  const board = state.layout === "board";
  const done = useCommandQuery<ListTasksResult>(
    "ukoly.list",
    { view: "done", scope: state.scope, limit: 30 },
    { enabled: board },
  );
  const canceled = useCommandQuery<ListTasksResult>(
    "ukoly.list",
    { view: "all", scope: state.scope, status: ["canceled"], limit: 30 },
    { enabled: board },
  );

  const rows = list.data?.rows ?? [];
  const boardRows = useMemo(() => {
    const m = new Map<string, TaskDto>();
    for (const r of [...rows, ...(done.data?.rows ?? []), ...(canceled.data?.rows ?? [])])
      m.set(r.id, r);
    return [...m.values()];
  }, [rows, done.data, canceled.data]);
  const groups = useMemo(() => groupTasks(rows, state.group), [rows, state.group]);
  const selectedTasks = rows.filter((r) => selected.has(r.id));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  useHotkeys({
    c: () => quickRef.current?.focus(),
    "/": () => searchRef.current?.focus(),
    b: () => patch({ layout: board ? "list" : "board" }),
    "1": () => pickView("today"),
    "2": () => pickView("next7"),
    "3": () => pickView("nodate"),
    "4": () => pickView("delegated"),
    "5": () => pickView("done"),
    Escape: () => {
      if (selected.size) setSelected(new Set());
    },
  });

  const activeView = views.find((v) => v.id === viewId);
  async function saveNew(name: string, shared: boolean) {
    try {
      const r = await api.views.save("task", { name, shared, config: toSavedConfig(state) });
      await reload();
      setViewId(r.id);
      setSaveOpen(false);
      successToast("Pohled je uložený.");
    } catch (e) {
      errorToast(messageOf(e));
    }
  }
  async function updateView() {
    if (!activeView) return;
    try {
      await api.views.update("task", activeView.id, { config: toSavedConfig(state) });
      await reload();
      successToast("Pohled je aktualizovaný.");
    } catch (e) {
      errorToast(messageOf(e));
    }
  }

  const countOf = (v: TaskView): number | undefined =>
    v === "today"
      ? counts.data?.today
      : v === "next7"
        ? counts.data?.next7
        : v === "nodate"
          ? counts.data?.nodate
          : v === "delegated"
            ? counts.data?.delegated
            : undefined;

  const empty = EMPTY[state.view];
  const filtered = !!state.q || !!state.typeKey || state.priority.length > 0;

  return (
    <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto" data-testid="my-tasks">
      <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
        <header className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">Moje úkoly</h1>
          <div className="ml-auto">
            <SegmentedControl
              label="Rozložení"
              value={state.layout}
              onChange={(layout) => patch({ layout })}
              options={[
                { value: "list", label: "Seznam" },
                { value: "board", label: "Board" },
              ]}
            />
          </div>
        </header>

        <QuickAdd inputRef={quickRef} />

        <div
          className="flex flex-wrap items-center gap-1 border-b border-line"
          role="tablist"
          aria-label="Pohledy"
        >
          {BUILTIN_VIEWS.map((v, i) => {
            const on = !viewId && state.view === v;
            const n = countOf(v);
            return (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={on}
                data-testid={`view-${v}`}
                title={`${TASK_VIEW_LABELS[v]} (${i + 1})`}
                onClick={() => pickView(v)}
                className={cn(
                  "-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-base font-medium transition-colors pointer-coarse:py-3",
                  on ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg",
                )}
              >
                {TASK_VIEW_LABELS[v]}
                {n !== undefined && n > 0 && (
                  <span
                    className={cn(
                      "tabular rounded-full px-1.5 text-xs",
                      v === "today" && (counts.data?.overdue ?? 0) > 0
                        ? "bg-danger-soft text-danger"
                        : "bg-hover text-muted",
                    )}
                  >
                    {n}
                  </span>
                )}
              </button>
            );
          })}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                data-testid="saved-views"
                className={cn(
                  "-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-base font-medium pointer-coarse:py-3",
                  viewId ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg",
                )}
              >
                <Icon name="star" className="size-4" />
                {activeView ? activeView.name : "Pohledy"}
                <Icon name="chevron-down" className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {views.length === 0 && (
                <DropdownMenuLabel>Zatím žádné uložené pohledy</DropdownMenuLabel>
              )}
              {views.map((v) => (
                <DropdownMenuItem
                  key={v.id}
                  onSelect={() => {
                    setViewId(v.id);
                    setState(fromSavedConfig(v.config));
                    setSearch(fromSavedConfig(v.config).q);
                  }}
                >
                  {v.name}
                  {v.shared && <span className="ml-auto text-xs text-faint">sdílený</span>}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setSaveOpen(true)}>
                <Icon name="plus" /> Uložit aktuální pohled…
              </DropdownMenuItem>
              {activeView?.mine && (
                <>
                  <DropdownMenuItem onSelect={() => void updateView()}>
                    <Icon name="check" /> Aktualizovat „{activeView.name}“
                  </DropdownMenuItem>
                  <DropdownMenuItem danger onSelect={() => setDropOpen(true)}>
                    <Icon name="trash" /> Smazat pohled
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Filtry a seskupení"
        >
          <div className="relative min-w-40 flex-1 basis-48">
            <Icon
              name="search"
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-faint"
            />
            <Input
              ref={searchRef}
              aria-label="Hledat v úkolech"
              placeholder="Hledat (/)"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            aria-label="Typ"
            className={cn(selectClass, "!w-auto")}
            value={state.typeKey}
            onChange={(e) => patch({ typeKey: e.target.value })}
          >
            <option value="">Všechny typy</option>
            {(types.data ?? []).map((t) => (
              <option key={t.key} value={t.key}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Priorita"
            className={cn(selectClass, "!w-auto")}
            value={state.priority[0] ?? ""}
            onChange={(e) =>
              patch({ priority: e.target.value ? [e.target.value as TaskPriority] : [] })
            }
          >
            <option value="">Každá priorita</option>
            {[...TASK_PRIORITIES].reverse().map((p) => (
              <option key={p} value={p}>
                {TASK_PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
          {!board && (
            <select
              aria-label="Seskupení"
              data-testid="group-by"
              className={cn(selectClass, "!w-auto")}
              value={state.group}
              onChange={(e) => patch({ group: e.target.value as GroupMode })}
            >
              {GROUP_MODES.map((g) => (
                <option key={g} value={g}>
                  {GROUP_LABELS[g]}
                </option>
              ))}
            </select>
          )}
          {state.view !== "delegated" && (
            <SegmentedControl
              label="Čí úkoly"
              value={state.scope}
              onChange={(scope) => patch({ scope })}
              options={[
                { value: "mine", label: "Moje" },
                { value: "all", label: "Vše" },
              ]}
            />
          )}
          {!board && (
            <Button
              size="md"
              variant={selectMode ? "secondary" : "ghost"}
              aria-pressed={selectMode}
              onClick={() => {
                setSelectMode((m) => !m);
                setSelected(new Set());
              }}
            >
              <Icon name="check-square" /> Vybrat
            </Button>
          )}
        </div>

        {list.isLoading ? (
          <div className="space-y-2" aria-busy>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : list.isError ? (
          <EmptyState
            title="Úkoly se nepodařilo načíst"
            description={list.error instanceof Error ? list.error.message : "Zkuste to znovu."}
            action={
              <Button variant="primary" onClick={() => void list.refetch()}>
                Zkusit znovu
              </Button>
            }
          />
        ) : board ? (
          <Board rows={boardRows} ops={ops} onOpen={record.open} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Icon name="circle-check" />}
            title={filtered ? "Nic nenalezeno" : empty.title}
            description={filtered ? "Zkuste upravit hledání nebo filtry." : empty.text}
          />
        ) : (
          <div className="space-y-5" data-testid="task-list">
            {groups.map((g) => (
              <section
                key={g.key}
                aria-label={g.title || "Úkoly"}
                data-testid="task-group"
                data-group={g.key}
              >
                {g.title && (
                  <h2
                    className={cn(
                      "mb-1.5 flex items-center gap-2 text-sm font-semibold",
                      g.tone === "danger"
                        ? "text-danger"
                        : g.tone === "accent"
                          ? "text-accent"
                          : g.tone === "muted"
                            ? "text-faint"
                            : "text-muted",
                    )}
                  >
                    {g.title}
                    {g.subtitle && <span className="font-normal text-faint">· {g.subtitle}</span>}
                    <span className="tabular rounded-full bg-hover px-1.5 text-xs font-medium text-muted">
                      {g.rows.length}
                    </span>
                  </h2>
                )}
                <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                  {g.rows.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      ops={ops}
                      onOpen={record.open}
                      selectMode={selectMode}
                      selected={selected.has(t.id)}
                      onSelect={toggle}
                      isMobile={isMobile}
                    />
                  ))}
                </ul>
              </section>
            ))}
            {list.data && list.data.total > rows.length && (
              <p className="text-center text-sm text-muted">
                Zobrazeno {rows.length} z {list.data.total}. Zúžte výběr filtrem.
              </p>
            )}
          </div>
        )}

        {selectMode && selected.size > 0 && (
          <BulkBar tasks={selectedTasks} ops={ops} onClear={() => setSelected(new Set())} />
        )}
      </div>

      {ops.dialogs}
      {record.id && <TaskDialog taskId={record.id} onClose={record.close} onSwitch={record.open} />}
      <SaveViewDialog open={saveOpen} onClose={() => setSaveOpen(false)} onSave={saveNew} />
      <ConfirmDialog
        open={dropOpen}
        onOpenChange={setDropOpen}
        title="Smazat pohled?"
        description={`Pohled „${activeView?.name ?? ""}“ zmizí. Úkoly zůstanou.`}
        confirmLabel="Smazat pohled"
        danger
        onConfirm={async () => {
          if (!activeView) return;
          try {
            await api.views.remove(activeView.id);
            setViewId(null);
            await reload();
          } catch (e) {
            errorToast(messageOf(e));
            return false;
          }
        }}
      />
    </div>
  );
}
