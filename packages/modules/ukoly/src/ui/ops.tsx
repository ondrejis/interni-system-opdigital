"use client";

/*
  Operace nad úkoly sdílené seznamem, boardem, dialogem a kartami záznamů: přesun termínu, priorita, řešitel
  (včetně „Zveřejnit a přiřadit“, VID-06), přejmenování, smazání. Vrací i dialogy, které je třeba vykreslit jednou.
*/
import {
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icon,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  errorToast,
  successToast,
} from "@rebar/ui";
import { useState, type ReactNode } from "react";
import type { TaskDto } from "../contract";
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, type TaskPriority } from "../tasks/constants";
import { useCompleteFlow } from "./complete";
import { datePresets } from "./logic";
import {
  PRIORITY_COLOR,
  codeOf,
  guard,
  messageOf,
  useDeleteWithUndo,
  useTaskActions,
} from "./shared";

type Ask = { ids: string[]; assigneeId: string; name: string | null; title: string };

/** Operace nad úkoly + dialogy k vykreslení (`dialogs`). */
export function useTaskOps() {
  const actions = useTaskActions();
  const flow = useCompleteFlow();
  const del = useDeleteWithUndo();
  const [ask, setAsk] = useState<Ask | null>(null);

  /** Přiřadí řešitele; u soukromého úkolu a uživatele bez práva na soukromé nabídne „Zveřejnit a přiřadit“. */
  async function assign(tasks: TaskDto[], assigneeId: string | null, name: string | null = null) {
    let ok = 0;
    for (const t of tasks) {
      try {
        await actions.assign.mutateAsync({ id: t.id, assigneeId });
        ok += 1;
      } catch (e) {
        if (codeOf(e) === "private_assign" && assigneeId) {
          setAsk({
            ids: tasks.filter((x) => x.isPrivate).map((x) => x.id),
            assigneeId,
            name,
            title: t.title,
          });
          return ok;
        }
        errorToast(messageOf(e));
        return ok;
      }
    }
    if (ok) successToast(assigneeId ? "Řešitel je změněný." : "Úkol je nepřiřazený.");
    return ok;
  }

  /** Nový termín (`null` = bez termínu). Hotový úkol nejde přeplánovat. */
  async function reschedule(t: TaskDto, date: string | null) {
    if (date === null) {
      await guard(actions.update.mutateAsync({ id: t.id, dueDate: null }), "Termín je zrušený.");
      return;
    }
    await guard(actions.reschedule.mutateAsync({ id: t.id, dueDate: date }), "Termín je změněný.");
  }

  const setPriority = (t: TaskDto, priority: TaskPriority) =>
    guard(actions.update.mutateAsync({ id: t.id, priority }));
  const rename = (t: TaskDto, title: string) =>
    guard(actions.update.mutateAsync({ id: t.id, title }));

  const dialogs = (
    <>
      {flow.dialog}
      <ConfirmDialog
        open={!!ask}
        onOpenChange={(o) => !o && setAsk(null)}
        title="Zveřejnit a přiřadit?"
        description={`Soukromý úkol „${ask?.title ?? ""}“ nejde přiřadit uživateli bez přístupu k soukromým záznamům.`}
        confirmLabel="Zveřejnit a přiřadit"
        onConfirm={async () => {
          if (!ask) return;
          for (const id of ask.ids) {
            try {
              await actions.publishAndAssign.mutateAsync({ id, assigneeId: ask.assigneeId });
            } catch (e) {
              errorToast(messageOf(e));
              return false;
            }
          }
          successToast("Úkol je zveřejněný a přiřazený.");
        }}
      >
        Úkol se tím zveřejní a {ask?.name ?? "nový řešitel"} ho uvidí. Chcete pokračovat?
      </ConfirmDialog>
    </>
  );

  return { actions, flow, assign, reschedule, setPriority, rename, remove: del, dialogs };
}

/** Operace nad úkoly (výsledek `useTaskOps`). */
export type TaskOps = ReturnType<typeof useTaskOps>;

/** Popover pro přesun termínu: dnes, zítra, pondělí, za týden, vlastní datum, bez termínu. */
export function DueEditor({
  due,
  onPick,
  children,
  disabled,
}: {
  due: string | null;
  onPick: (date: string | null) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pick = (d: string | null) => {
    setOpen(false);
    onPick(d);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled ?? false}>
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-60 p-1.5" onClick={(e) => e.stopPropagation()}>
        {datePresets().map((p) => (
          <button
            key={p.key}
            type="button"
            data-testid={`due-${p.key}`}
            onClick={() => pick(p.date)}
            className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-base hover:bg-hover pointer-coarse:py-3"
          >
            {p.label}
            <span className="text-sm text-faint">
              {p.date.split("-").reverse().slice(0, 2).join(". ")}.
            </span>
          </button>
        ))}
        <div className="mt-1 border-t border-line px-1 pt-2">
          <Input
            type="date"
            aria-label="Vlastní datum"
            data-testid="due-custom"
            value={due ?? ""}
            onChange={(e) => e.target.value && pick(e.target.value)}
          />
        </div>
        {due && (
          <button
            type="button"
            onClick={() => pick(null)}
            className="mt-1 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-muted hover:bg-hover pointer-coarse:py-3"
          >
            <Icon name="x" className="size-4" /> Bez termínu
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Nabídka priority; `children` je spouštěč. */
export function PriorityMenu({
  value,
  onPick,
  children,
}: {
  value: TaskPriority;
  onPick: (p: TaskPriority) => void;
  children: ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
        {[...TASK_PRIORITIES].reverse().map((p) => (
          <DropdownMenuItem key={p} onSelect={() => onPick(p)} data-testid={`priority-${p}`}>
            <span className="chip size-2 !p-0" data-color={PRIORITY_COLOR[p]} aria-hidden />
            {TASK_PRIORITY_LABELS[p]}
            {p === value && <Icon name="check" className="ml-auto" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
