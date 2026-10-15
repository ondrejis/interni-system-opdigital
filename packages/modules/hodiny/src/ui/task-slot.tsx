"use client";

import { formatDate } from "@rebar/core/shared";
import { Button, Skeleton, useCan, useCommandQuery, Icon } from "@rebar/ui";
import { useState } from "react";
import type { ForTaskOutput } from "../contract";
import { formatDuration } from "../logic/parse-time";
import { LogTimeDialog, type LogTimeTarget } from "./log-time-dialog";
import { useDurationFormat } from "./shared";

/**
 * Příspěvek do dialogu úkolu (`slots["task.dialog.extras"]`): tlačítko „Zapsat čas“, souhrn zapsaného času proti odhadu
 * úkolu a poslední záznamy (klik = úprava). U úkolu bez zakázky se čas zapsat nedá.
 */
export function TaskTimeExtra({ taskId }: { taskId: string }) {
  const can = useCan();
  const [format] = useDurationFormat();
  const [dialog, setDialog] = useState<LogTimeTarget | null>(null);
  const q = useCommandQuery<ForTaskOutput>("hodiny.forTask", { taskId });
  if (!can("hodiny.read")) return null;
  const t = q.data;
  if (q.isLoading) return <Skeleton className="h-8" />;
  if (!t) return null;
  const h = (m: number) => `${formatDuration(m, format)} h`;
  return (
    <section aria-label="Čas u úkolu" className="space-y-2" data-testid="task-hours">
      <div className="flex flex-wrap items-center gap-3">
        {can("hodiny.write") && (
          <Button
            variant="secondary"
            disabled={!t.job}
            title={t.job ? undefined : "Čas jde zapsat jen u úkolů zakázky"}
            onClick={() => setDialog({ job: t.job, taskId: t.taskId, taskTitle: t.taskTitle })}
          >
            <Icon name="clock" /> Zapsat čas
          </Button>
        )}
        <span className="tabular text-sm text-muted" data-testid="task-hours-summary">
          Zapsáno {h(t.totalMinutes)}
          {t.estimateMin ? ` z odhadu ${h(t.estimateMin)}` : ""}
        </span>
      </div>
      {t.entries.length > 0 && (
        <ul className="space-y-0.5 text-sm">
          {t.entries.slice(0, 5).map((e) => (
            <li key={e.id}>
              <button
                type="button"
                className="flex w-full gap-3 rounded px-1 py-0.5 text-left hover:bg-subtle"
                onClick={() =>
                  setDialog({ entry: e, job: t.job, taskId: t.taskId, taskTitle: t.taskTitle })
                }
              >
                <span className="tabular w-20 text-muted">{formatDate(e.date)}</span>
                <span className="tabular w-14 font-medium">
                  {formatDuration(e.minutes, format)}
                </span>
                <span className="min-w-0 flex-1 truncate text-muted">
                  {[e.userName, e.note].filter(Boolean).join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {dialog && <LogTimeDialog open onOpenChange={(o) => !o && setDialog(null)} target={dialog} />}
    </section>
  );
}
