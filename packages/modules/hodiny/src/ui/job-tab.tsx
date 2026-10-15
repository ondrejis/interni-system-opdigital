"use client";

import { formatDate, formatMinor } from "@rebar/core/shared";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Skeleton,
  cn,
  useCan,
  useCommandQuery,
  Icon,
} from "@rebar/ui";
import { useState } from "react";
import type { JobSummaryOutput } from "../contract";
import { formatDuration } from "../logic/parse-time";
import { LogTimeDialog, type LogTimeTarget } from "./log-time-dialog";
import { useDurationFormat } from "./shared";

/**
 * Záložka „Hodiny“ zakázky (HOD-03): odpracováno vs. odhad úkolů, efektivní hodinová sazba každého (podíl na příjmech
 * ÷ jeho hodiny) a poslední záznamy. Sazby se ukážou, jen když jsou k dispozici finance a aktér smí vidět peníze.
 */
export function JobHoursTab({ jobId }: { jobId: string }) {
  const can = useCan();
  const [format] = useDurationFormat();
  const [dialog, setDialog] = useState<LogTimeTarget | null>(null);
  const q = useCommandQuery<JobSummaryOutput>("hodiny.job.summary", { jobId });
  const s = q.data;
  if (q.isLoading || !s) return <Skeleton className="h-40" />;
  const h = (m: number) => `${formatDuration(m, format)} h`;
  const over = (s.overrunMinutes ?? 0) > 0;
  return (
    <div className="space-y-4" data-testid="job-hours">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium">Hodiny zakázky</h3>
        {can("hodiny.write") && (
          <Button variant="secondary" onClick={() => setDialog({ job: s.job })}>
            <Icon name="plus" /> Zapsat čas
          </Button>
        )}
      </div>
      {s.scope === "own" && <p className="text-sm text-muted">Vidíte jen své hodiny.</p>}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardBody>
            <div className="text-sm text-muted">Odpracováno</div>
            <div className="tabular text-2xl font-semibold" data-testid="job-worked">
              {h(s.workedMinutes)}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-sm text-muted">Odhad úkolů</div>
            <div className="tabular text-2xl font-semibold" data-testid="job-estimate">
              {s.estimateMin !== null ? h(s.estimateMin) : "–"}
            </div>
            {s.estimateTasks !== null && (
              <div className="text-xs text-muted">z {s.estimateTasks} úkolů</div>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-sm text-muted">{over ? "Přečerpáno" : "Zbývá"}</div>
            <div
              className={cn("tabular text-2xl font-semibold", over && "text-danger")}
              data-testid="job-remaining"
            >
              {s.estimateMin === null
                ? "–"
                : h(over ? (s.overrunMinutes ?? 0) : (s.remainingMinutes ?? 0))}
            </div>
          </CardBody>
        </Card>
      </div>
      {s.progressPct !== null && (
        <div
          className="h-2 rounded-full bg-subtle"
          role="progressbar"
          aria-valuenow={s.progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Odpracováno z odhadu"
        >
          <div
            className={cn("h-2 rounded-full", over ? "bg-danger" : "bg-[var(--accent)]")}
            style={{ width: `${Math.min(100, s.progressPct)}%` }}
          />
        </div>
      )}

      <Card>
        <CardHeader title="Kdo kolik" />
        <CardBody flush>
          {s.users.length === 0 ? (
            <EmptyState title="Zatím nic nezapsáno" />
          ) : (
            <table className="w-full text-sm" data-testid="job-users">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th className="px-4 py-2 font-medium">Osoba</th>
                  <th className="px-4 py-2 text-right font-medium">Hodiny</th>
                  {s.moneyAvailable && (
                    <th className="px-4 py-2 text-right font-medium">Podíl na příjmech</th>
                  )}
                  {s.moneyAvailable && (
                    <th className="px-4 py-2 text-right font-medium">Efektivní sazba</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {s.users.map((u) => (
                  <tr key={u.userId} className="border-b border-line last:border-0">
                    <td className="px-4 py-2">{u.name}</td>
                    <td className="tabular px-4 py-2 text-right">{h(u.minutes)}</td>
                    {s.moneyAvailable && (
                      <td className="tabular px-4 py-2 text-right">
                        {u.incomeMinor !== null ? formatMinor(u.incomeMinor) : "–"}
                      </td>
                    )}
                    {s.moneyAvailable && (
                      <td className="tabular px-4 py-2 text-right" data-testid={`rate-${u.userId}`}>
                        {u.rateMinor !== null ? `${formatMinor(u.rateMinor)} / h` : "–"}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
        {!s.moneyAvailable && (
          <p className="px-4 pb-3 text-sm text-muted">
            Efektivní hodinová sazba se ukáže, až budou k dispozici příjmy zakázky (modul Finance).
          </p>
        )}
        {s.moneyAvailable && s.effectiveRateMinor !== null && (
          <p className="px-4 pb-3 text-sm text-muted">
            Zakázka celkem: {formatMinor(s.effectiveRateMinor)} / h.
          </p>
        )}
      </Card>

      {s.recent.length > 0 && (
        <Card>
          <CardHeader title="Poslední záznamy" />
          <CardBody flush>
            <ul className="divide-y divide-line text-sm">
              {s.recent.map((e) => (
                <li key={e.id} className="flex gap-3 px-4 py-2">
                  <span className="tabular w-20 text-muted">{formatDate(e.date)}</span>
                  <span className="w-28 truncate">{e.userName}</span>
                  <span className="tabular w-14 font-medium">
                    {formatDuration(e.minutes, format)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-muted">
                    {[e.taskTitle, e.note].filter(Boolean).join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
      {dialog && <LogTimeDialog open onOpenChange={(o) => !o && setDialog(null)} target={dialog} />}
    </div>
  );
}
