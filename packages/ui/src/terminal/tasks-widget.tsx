"use client";

import { Check, Circle } from "lucide-react";
import { useState } from "react";
import { cn } from "../lib/cn";
import { useCommandQuery } from "../data/hooks";
import { PendingBadge, TerminalCard, TerminalEmpty } from "./kit";
import { reportOutcome, useTerminalQueue } from "./queue-context";
import { Skeleton } from "../components/badges";
import type { TerminalWidgetProps } from "./types";

type Task = {
  id: string;
  title: string;
  dueDate: string | null;
  priority: string;
  overdue: boolean;
  record: string | null;
};
type Mine = { today: string; tasks: Task[] };

const dueLabel = (d: string, today: string) => {
  if (d === today) return "Dnes";
  const [, m, day] = d.split("-");
  return `${Number(day)}. ${Number(m)}.`;
};

/** Moje úkoly: velké řádky, odškrtnutí jedním ťuknutím (funguje i bez signálu, zápis čeká ve frontě). */
export function TasksWidget({ label, variant, pageHref }: TerminalWidgetProps) {
  const q = useCommandQuery<Mine>("core.tasks.mine", {});
  const { submit, pending } = useTerminalQueue();
  const [done, setDone] = useState<Set<string>>(new Set());
  const waiting = new Set(
    pending
      .filter((o) => o.command === "core.tasks.complete")
      .map((o) => (o.input as { taskId?: string }).taskId ?? ""),
  );
  const all = q.data?.tasks ?? [];
  const shown = variant === "card" ? all.slice(0, 5) : all;

  async function complete(t: Task) {
    setDone((s) => new Set(s).add(t.id));
    const out = await submit({
      command: "core.tasks.complete",
      input: { taskId: t.id, done: true },
      label: `Úkol: ${t.title}`,
      group: `task:${t.id}`,
    });
    if (!reportOutcome(out, "Úkol splněn."))
      setDone((s) => {
        const next = new Set(s);
        next.delete(t.id);
        return next;
      });
  }

  return (
    <TerminalCard
      title={label}
      icon="check-square"
      href={variant === "card" ? pageHref : null}
      testId="tile-core.tasks"
      bare={variant === "page"}
    >
      {q.isLoading ? (
        <Skeleton className="h-16" />
      ) : q.isError && !q.data ? (
        <TerminalEmpty>Úkoly se nepodařilo načíst. Zkontrolujte připojení.</TerminalEmpty>
      ) : shown.length === 0 ? (
        <TerminalEmpty>Žádné otevřené úkoly. Dobrá práce.</TerminalEmpty>
      ) : (
        <ul className="-mx-2 divide-y divide-line">
          {shown.map((t) => {
            const isDone = done.has(t.id) || waiting.has(t.id);
            return (
              <li key={t.id}>
                <button
                  type="button"
                  aria-pressed={isDone}
                  aria-label={`${isDone ? "Splněno" : "Splnit"}: ${t.title}`}
                  disabled={isDone}
                  onClick={() => void complete(t)}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left active:bg-hover"
                >
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full border-2",
                      isDone
                        ? "border-success bg-success text-white"
                        : "border-line-strong text-transparent",
                    )}
                  >
                    {isDone ? <Check className="size-5" /> : <Circle className="size-5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block text-[17px] font-medium leading-snug",
                        isDone && "text-muted line-through",
                      )}
                    >
                      {t.title}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-base text-muted">
                      {t.record && <span className="truncate">{t.record}</span>}
                      {t.dueDate && (
                        <span className={cn(t.overdue && "font-medium text-danger")}>
                          {t.overdue ? "Po termínu: " : "Do: "}
                          {dueLabel(t.dueDate, q.data?.today ?? "")}
                        </span>
                      )}
                      {waiting.has(t.id) && <PendingBadge />}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {variant === "card" && all.length > shown.length && (
        <p className="mt-2 text-base text-muted">A dalších {all.length - shown.length}.</p>
      )}
    </TerminalCard>
  );
}
