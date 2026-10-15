"use client";

import { formatDate } from "@rebar/core/shared";
import {
  Avatar,
  Checkbox,
  Chip,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  Input,
  Skeleton,
  cn,
  errorToast,
  useCommandMutation,
  useEntityApi,
  useNav,
} from "@rebar/ui";
import { CheckSquare, ChevronRight, GripVertical, MoveRight } from "lucide-react";
import { useState } from "react";
import type { PhaseView } from "../contract";
import { useJobDetail, useJobTasks } from "./hooks";
import { groupTasksByPhase, isTaskOverdue, plural, taskMovePatch } from "./logic";
import { DueText, LoadError } from "./parts";
import type { TaskGroup, TaskLite } from "./types";

const PRIORITY: Record<TaskLite["priority"], { label: string; color: string } | null> = {
  none: null,
  low: { label: "Nízká", color: "gray" },
  medium: null,
  high: { label: "Vysoká", color: "orange" },
  urgent: { label: "Urgentní", color: "red" },
};

/**
 * Záložka Úkoly na zakázce: úkoly seskupené podle fází (včetně skupiny „Bez fáze“), přetahování mezi fázemi myší
 * i přes nabídku „Přesunout do fáze“, odškrtnutí a rychlé přidání do fáze. Data dodává modul Úkoly (`ukoly.*`).
 */
export function JobTasksTab({ jobId, canWrite }: { jobId: string; canWrite: boolean }) {
  const detail = useJobDetail(jobId);
  const { enabled, query } = useJobTasks(jobId);
  const move = useCommandMutation<{ id: string; jobPhaseId: string | null }>("ukoly.update");
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  if (!enabled)
    return (
      <EmptyState
        icon={<CheckSquare />}
        title="Modul Úkoly není zapnutý"
        description="Úkoly zakázky se zobrazí, jakmile modul zapnete v Nastavení."
      />
    );
  if (detail.isLoading || query.isLoading) return <Skeleton className="h-40" />;
  if (detail.error || !detail.data)
    return <LoadError message={detail.error?.message ?? "Zakázka nenalezena."} />;
  if (query.error)
    return <LoadError message={query.error.message} onRetry={() => void query.refetch()} />;

  const tasks = query.data?.rows ?? [];
  const phases = detail.data.phases;
  const groups = groupTasksByPhase(tasks, phases);
  const visible = groups.filter((g) => g.phase || g.open.length || g.closed.length || dragging);
  const doneCount = groups.reduce((n, g) => n + g.closed.length, 0);

  function moveTask(taskId: string, phaseId: string | null) {
    const task = tasks.find((t) => t.id === taskId);
    const patch = task && taskMovePatch(task, phaseId);
    if (patch) move.mutate(patch, { onError: (e) => errorToast(e.message) });
  }

  return (
    <div className="space-y-4" data-testid="job-tasks">
      {tasks.length === 0 && phases.length === 0 && (
        <EmptyState icon={<CheckSquare />} title="Zakázka zatím nemá úkoly ani fáze" />
      )}
      <div className="flex items-center justify-between gap-2 text-sm text-muted">
        <span>
          {plural(
            tasks.filter((t) => t.status === "todo" || t.status === "in_progress").length,
            "otevřený úkol",
            "otevřené úkoly",
            "otevřených úkolů",
          )}
        </span>
        {doneCount > 0 && (
          <label className="flex items-center gap-2">
            <Checkbox
              checked={showDone}
              onCheckedChange={(v) => setShowDone(v === true)}
              aria-label="Zobrazit hotové úkoly"
            />
            Zobrazit hotové ({doneCount})
          </label>
        )}
      </div>
      {visible.map((g) => (
        <GroupSection
          key={g.key}
          group={g}
          phases={phases}
          jobId={jobId}
          canWrite={canWrite}
          showDone={showDone}
          dragging={dragging}
          isOver={over === g.key}
          onOver={(o) => setOver(o ? g.key : null)}
          onDragStart={setDragging}
          onDragEnd={() => {
            setDragging(null);
            setOver(null);
          }}
          onDropTask={(id) => {
            setOver(null);
            setDragging(null);
            moveTask(id, g.phaseId);
          }}
          onMove={moveTask}
        />
      ))}
    </div>
  );
}

function GroupSection({
  group,
  phases,
  jobId,
  canWrite,
  showDone,
  dragging,
  isOver,
  onOver,
  onDragStart,
  onDragEnd,
  onDropTask,
  onMove,
}: {
  group: TaskGroup;
  phases: readonly PhaseView[];
  jobId: string;
  canWrite: boolean;
  showDone: boolean;
  dragging: string | null;
  isOver: boolean;
  onOver: (over: boolean) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDropTask: (id: string) => void;
  onMove: (taskId: string, phaseId: string | null) => void;
}) {
  const [open, setOpen] = useState(true);
  const [text, setText] = useState("");
  const add = useCommandMutation<{ text: string; jobId: string; jobPhaseId?: string }>(
    "ukoly.quickAdd",
  );
  const rows = showDone ? [...group.open, ...group.closed] : group.open;
  const current = group.phase?.status === "in_progress";
  return (
    <section
      aria-label={`Fáze ${group.name}`}
      data-testid="task-group"
      data-group={group.key}
      className={cn(
        "rounded-lg border border-line transition-colors",
        isOver && "border-accent bg-accent-soft",
      )}
      onDragOver={(e) => {
        if (!dragging || !canWrite) return;
        e.preventDefault();
        onOver(true);
      }}
      onDragLeave={() => onOver(false)}
      onDrop={(e) => {
        if (!canWrite) return;
        e.preventDefault();
        const id = e.dataTransfer.getData("text/plain") || dragging;
        if (id) onDropTask(id);
      }}
    >
      <header className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${open ? "Sbalit" : "Rozbalit"} fázi ${group.name}`}
          className="rounded p-0.5 text-muted hover:bg-hover"
          onClick={() => setOpen((o) => !o)}
        >
          <ChevronRight className={cn("size-4 transition-transform", open && "rotate-90")} />
        </button>
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{group.name}</h3>
        {current && <Chip color="blue">Aktuální</Chip>}
        {group.phase?.status === "done" && <Chip color="green">Hotová</Chip>}
        <span className="tabular text-sm text-muted">
          {group.open.length}
          {group.closed.length > 0 && ` / ${group.open.length + group.closed.length}`}
        </span>
      </header>
      {open && (
        <div className="border-t border-line-soft">
          {rows.length === 0 ? (
            <p className="px-3 py-2 text-sm text-faint">
              {dragging ? "Pusťte úkol sem." : "Žádné otevřené úkoly."}
            </p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {rows.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  phases={phases}
                  canWrite={canWrite}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onMove={onMove}
                />
              ))}
            </ul>
          )}
          {canWrite && (
            <form
              className="border-t border-line-soft px-3 py-2"
              onSubmit={(e) => {
                e.preventDefault();
                const t = text.trim();
                if (!t) return;
                add.mutate(
                  { text: t, jobId, ...(group.phaseId ? { jobPhaseId: group.phaseId } : {}) },
                  { onSuccess: () => setText(""), onError: (err) => errorToast(err.message) },
                );
              }}
            >
              <Input
                aria-label={`Přidat úkol do fáze ${group.name}`}
                placeholder="Přidat úkol… (Enter)"
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={add.isPending}
              />
            </form>
          )}
        </div>
      )}
    </section>
  );
}

function TaskRow({
  task,
  phases,
  canWrite,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  task: TaskLite;
  phases: readonly PhaseView[];
  canWrite: boolean;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onMove: (taskId: string, phaseId: string | null) => void;
}) {
  const api = useEntityApi();
  const { Link } = useNav();
  const complete = useCommandMutation<{ id: string }>("ukoly.complete");
  const reopen = useCommandMutation<{ id: string; status: "todo" }>("ukoly.setStatus");
  const open = task.status === "todo" || task.status === "in_progress";
  const href = api.hrefFor("task", task.id);
  const prio = PRIORITY[task.priority];
  const overdue = isTaskOverdue(task);
  return (
    <li
      data-testid="task-row"
      draggable={canWrite}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(task.id);
      }}
      onDragEnd={onDragEnd}
      className="group flex items-center gap-2 px-3 py-1.5 hover:bg-hover/50"
    >
      {canWrite && (
        <GripVertical
          className="size-4 shrink-0 cursor-grab text-faint max-md:hidden"
          aria-hidden
        />
      )}
      <Checkbox
        aria-label={open ? `Hotovo: ${task.title}` : `Znovu otevřít: ${task.title}`}
        checked={!open}
        disabled={!canWrite}
        onCheckedChange={() =>
          open
            ? complete.mutate({ id: task.id }, { onError: (e) => errorToast(e.message) })
            : reopen.mutate(
                { id: task.id, status: "todo" },
                { onError: (e) => errorToast(e.message) },
              )
        }
      />
      <span className={cn("min-w-0 flex-1 truncate", !open && "text-muted line-through")}>
        {href ? (
          <Link href={href} className="hover:underline">
            {task.title}
          </Link>
        ) : (
          task.title
        )}
      </span>
      {prio && <Chip color={prio.color}>{prio.label}</Chip>}
      {task.estimateMin ? (
        <span className="tabular text-xs text-muted max-sm:hidden">
          {task.estimateMin >= 60
            ? `${Math.round((task.estimateMin / 60) * 10) / 10} h`
            : `${task.estimateMin} min`}
        </span>
      ) : null}
      {task.assigneeName && (
        <span title={task.assigneeName} className="max-sm:hidden">
          <Avatar name={task.assigneeName} size={20} />
        </span>
      )}
      <span
        className={cn("text-sm", overdue && "font-medium text-danger")}
        title={task.dueDate ? formatDate(task.dueDate) : "Bez termínu"}
      >
        <DueText due={task.dueDate} live={open} />
      </span>
      {canWrite && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton label={`Přesunout úkol ${task.title} do fáze`} size="sm">
              <MoveRight />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Přesunout do fáze</DropdownMenuLabel>
            {phases.map((p) => (
              <DropdownMenuItem
                key={p.id}
                disabled={task.jobPhaseId === p.id}
                onSelect={() => onMove(task.id, p.id)}
              >
                {p.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem disabled={!task.jobPhaseId} onSelect={() => onMove(task.id, null)}>
              Bez fáze
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}
