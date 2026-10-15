"use client";

/*
  Řádek úkolu v seznamu „Moje úkoly“: odškrtnutí, přejmenování a změna termínu, priority i řešitele přímo v řádku,
  nabídka dalších akcí; na telefonu swipe doleva (Odložit, Hotovo). Klávesy: Enter otevře, F2 přejmenuje, šipky
  přecházejí mezi řádky, X vybere.
*/
import {
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  IconButton,
  Input,
  cn,
} from "@rebar/ui";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { TaskDto } from "../contract";
import { CompleteCircle } from "./complete";
import { SWIPE_REVEAL, swipeOffset, swipeOutcome } from "./logic";
import { DueEditor, PriorityMenu, type TaskOps } from "./ops";
import {
  AssigneeAvatar,
  AssigneePicker,
  DueText,
  LinkChip,
  PriorityChip,
  TypeBadge,
} from "./shared";
import { isOpen } from "./logic";

/** Přesune fokus na sousední řádek (`data-task-row`). */
function moveFocus(from: HTMLElement, dir: 1 | -1) {
  const all = [...document.querySelectorAll<HTMLElement>("[data-task-row]")];
  all[all.indexOf(from) + dir]?.focus();
}

/** Řádek úkolu. `selectMode` ukáže zaškrtávátko výběru pro hromadné akce. */
export function TaskRow({
  task: t,
  ops,
  onOpen,
  selectMode,
  selected,
  onSelect,
  isMobile,
  showLinks = true,
}: {
  task: TaskDto;
  ops: TaskOps;
  onOpen: (id: string) => void;
  selectMode?: boolean;
  selected?: boolean;
  onSelect?: (id: string) => void;
  isMobile?: boolean;
  showLinks?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(t.title);
  const closed = !isOpen(t.status);

  async function commit() {
    const title = draft.trim();
    setEditing(false);
    if (title && title !== t.title) await ops.rename(t, title);
    else setDraft(t.title);
  }

  function onKey(e: KeyboardEvent<HTMLLIElement>) {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter") onOpen(t.id);
    else if (e.key === "F2") {
      setDraft(t.title);
      setEditing(true);
    } else if (e.key === "ArrowDown" || e.key === "j") {
      e.preventDefault();
      moveFocus(e.currentTarget, 1);
    } else if (e.key === "ArrowUp" || e.key === "k") {
      e.preventDefault();
      moveFocus(e.currentTarget, -1);
    } else if (e.key === "x") onSelect?.(t.id);
  }

  const body = (
    <li
      data-task-row
      data-testid="task-row"
      data-task-id={t.id}
      data-state={t.state}
      tabIndex={0}
      onClick={() => onOpen(t.id)}
      onKeyDown={onKey}
      className={cn(
        "group relative flex cursor-pointer items-start gap-2.5 bg-bg px-3 py-2.5 outline-none hover:bg-hover focus-visible:bg-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-line)]",
        t.state === "overdue" && "bg-danger-soft/40",
        selected && "bg-accent-soft hover:bg-accent-soft",
      )}
    >
      {selectMode && (
        <span className="pt-0.5" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            aria-label={`Vybrat: ${t.title}`}
            checked={!!selected}
            onCheckedChange={() => onSelect?.(t.id)}
          />
        </span>
      )}
      <div className="pt-0.5">
        <CompleteCircle
          task={t}
          busy={ops.flow.busyId === t.id}
          onComplete={() => void ops.flow.complete(t)}
          onReopen={() => void ops.flow.reopen(t)}
        />
      </div>
      <TypeBadge icon={t.typeIcon} color={t.typeColor} name={t.typeName} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {editing ? (
            <Input
              autoFocus
              aria-label="Název úkolu"
              data-testid="task-title-input"
              value={draft}
              maxLength={300}
              className="h-7"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => void commit()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") void commit();
                if (e.key === "Escape") {
                  setEditing(false);
                  setDraft(t.title);
                }
              }}
            />
          ) : (
            <span
              data-testid="task-title"
              className={cn(
                "min-w-0 truncate text-base font-medium",
                closed && "text-muted line-through",
              )}
              title={t.title}
            >
              {t.title}
            </span>
          )}
          {!editing && (
            <IconButton
              label="Přejmenovat"
              size="sm"
              data-testid="task-rename"
              className="shrink-0 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:hidden"
              onClick={(e) => {
                e.stopPropagation();
                setDraft(t.title);
                setEditing(true);
              }}
            >
              <Icon name="pencil" />
            </IconButton>
          )}
          {t.isPrivate && <Icon name="lock" className="size-3.5 shrink-0 text-faint" />}
          {t.subtasks.total > 0 && (
            <span className="chip shrink-0" data-color="gray" title="Hotové podúkoly">
              {t.subtasks.done}/{t.subtasks.total}
            </span>
          )}
          {t.parentTitle && <span className="truncate text-sm text-faint">v: {t.parentTitle}</span>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <DueEditor due={t.dueDate} disabled={closed} onPick={(d) => void ops.reschedule(t, d)}>
            <button
              type="button"
              data-testid="task-due"
              aria-label={`Termín: ${t.dueDate ? t.dueDate : "bez termínu"}. Změnit`}
              disabled={closed}
              onClick={(e) => e.stopPropagation()}
              className="rounded px-1 hover:bg-active disabled:pointer-events-none"
            >
              <DueText task={t} />
            </button>
          </DueEditor>
          {t.place && <span className="max-w-40 truncate text-faint">{t.place}</span>}
          <PriorityMenu value={t.priority} onPick={(p) => void ops.setPriority(t, p)}>
            <button
              type="button"
              aria-label={`Priorita: ${t.priority}. Změnit`}
              data-testid="task-priority"
              onClick={(e) => e.stopPropagation()}
              className={cn(
                t.priority === "none" &&
                  "opacity-0 group-focus-within:opacity-60 group-hover:opacity-60 pointer-coarse:opacity-60",
              )}
            >
              {t.priority === "none" ? (
                <Icon name="flag" className="size-3.5 text-faint" />
              ) : (
                <PriorityChip priority={t.priority} />
              )}
            </button>
          </PriorityMenu>
          {showLinks && t.job && <LinkChip kind="job" link={t.job} prefix={t.jobNumber} />}
          {showLinks && t.job && <span className="text-faint">{t.jobPhaseName ?? "Bez fáze"}</span>}
          {showLinks && t.deal && <LinkChip kind="deal" link={t.deal} />}
          {showLinks && t.company && <LinkChip kind="company" link={t.company} />}
          {showLinks && t.person && <LinkChip kind="person" link={t.person} />}
          {t.tags.map((g) => (
            <span key={g} className="chip" data-color="gray">
              {g}
            </span>
          ))}
          {t.delegated && <span className="text-faint">zadáno vámi</span>}
        </div>
      </div>
      <span onClick={(e) => e.stopPropagation()} className="mt-0.5">
        <AssigneePicker
          value={t.assigneeId}
          name={t.assigneeName}
          label={`Řešitel: ${t.assigneeName ?? "nepřiřazeno"}`}
          disabled={closed}
          onChange={(id) => void ops.assign([t], id)}
          trigger={
            <button type="button" aria-label="Změnit řešitele" data-testid="task-assignee">
              <AssigneeAvatar name={t.assigneeName} />
            </button>
          }
        />
      </span>
      <RowMenu
        task={t}
        ops={ops}
        onOpen={onOpen}
        onRename={() => {
          setDraft(t.title);
          setEditing(true);
        }}
      />
    </li>
  );

  return isMobile && !closed ? (
    <SwipeRow task={t} ops={ops}>
      {body}
    </SwipeRow>
  ) : (
    body
  );
}

/** Nabídka dalších akcí u řádku. */
function RowMenu({
  task: t,
  ops,
  onOpen,
  onRename,
}: {
  task: TaskDto;
  ops: TaskOps;
  onOpen: (id: string) => void;
  onRename: () => void;
}) {
  const status = (s: TaskDto["status"]) =>
    void ops.actions.setStatus.mutate({ id: t.id, status: s });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          label={`Další akce: ${t.title}`}
          size="sm"
          className="shrink-0"
          data-testid="task-menu"
          onClick={(e) => e.stopPropagation()}
        >
          <Icon name="more" />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onSelect={() => onOpen(t.id)}>
          <Icon name="external-link" /> Otevřít
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onRename}>
          <Icon name="pencil" /> Přejmenovat
        </DropdownMenuItem>
        {t.status === "todo" && (
          <DropdownMenuItem onSelect={() => status("in_progress")}>
            <Icon name="clock" /> Označit jako „Probíhá“
          </DropdownMenuItem>
        )}
        {t.status === "in_progress" && (
          <DropdownMenuItem onSelect={() => status("todo")}>
            <Icon name="rotate-ccw" /> Vrátit do „K řešení“
          </DropdownMenuItem>
        )}
        {isOpen(t.status) && (
          <DropdownMenuItem onSelect={() => status("canceled")}>
            <Icon name="circle-x" /> Zrušit úkol
          </DropdownMenuItem>
        )}
        {!isOpen(t.status) && (
          <DropdownMenuItem onSelect={() => void ops.flow.reopen(t)}>
            <Icon name="rotate-ccw" /> Znovu otevřít
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem danger onSelect={() => void ops.remove([t.id], `Smazáno: ${t.title}`)}>
          <Icon name="trash" /> Smazat
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Swipe doleva na telefonu: odkryje Odložit a Hotovo, dlouhý tah rovnou označí hotovo. */
function SwipeRow({
  task: t,
  ops,
  children,
}: {
  task: TaskDto;
  ops: TaskOps;
  children: ReactNode;
}) {
  const [dx, setDx] = useState(0);
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; lock: "h" | "v" | null } | null>(null);
  const base = open ? -SWIPE_REVEAL : 0;

  return (
    <div className="relative overflow-hidden" data-testid="swipe-row">
      <div
        className="absolute inset-y-0 right-0 flex"
        style={{ width: SWIPE_REVEAL }}
        aria-hidden={!open}
      >
        <DueEditor
          due={t.dueDate}
          onPick={(d) => {
            setOpen(false);
            void ops.reschedule(t, d);
          }}
        >
          <button
            type="button"
            tabIndex={open ? 0 : -1}
            data-testid="swipe-snooze"
            className="flex flex-1 flex-col items-center justify-center gap-1 bg-warning text-sm font-medium text-white"
          >
            <Icon name="alarm-clock" className="size-5 !text-white" />
            Odložit
          </button>
        </DueEditor>
        <button
          type="button"
          tabIndex={open ? 0 : -1}
          data-testid="swipe-done"
          onClick={() => {
            setOpen(false);
            void ops.flow.complete(t);
          }}
          className="flex flex-1 flex-col items-center justify-center gap-1 bg-success text-sm font-medium text-white"
        >
          <Icon name="check" className="size-5 !text-white" />
          Hotovo
        </button>
      </div>
      <div
        style={{
          transform: `translateX(${swipeOffset(base + dx)}px)`,
          transition: dragging ? "none" : "transform 160ms ease-out",
          touchAction: "pan-y",
        }}
        onTouchStart={(e) => {
          const p = e.touches[0]!;
          start.current = { x: p.clientX, y: p.clientY, lock: null };
        }}
        onTouchMove={(e) => {
          const s = start.current;
          if (!s) return;
          const p = e.touches[0]!;
          const ddx = p.clientX - s.x;
          const ddy = p.clientY - s.y;
          if (!s.lock && (Math.abs(ddx) > 8 || Math.abs(ddy) > 8))
            s.lock = Math.abs(ddx) > Math.abs(ddy) ? "h" : "v";
          if (s.lock === "h") {
            setDragging(true);
            setDx(ddx);
          }
        }}
        onTouchEnd={() => {
          const s = start.current;
          start.current = null;
          setDragging(false);
          if (s?.lock !== "h") return;
          const out = swipeOutcome(base + dx);
          setDx(0);
          if (out === "done") {
            setOpen(false);
            void ops.flow.complete(t);
          } else setOpen(out === "open");
        }}
      >
        {children}
      </div>
    </div>
  );
}
