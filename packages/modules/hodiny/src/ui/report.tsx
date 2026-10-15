"use client";

import { formatDate } from "@rebar/core/shared";
import { todayIso } from "@rebar/core/time";
import {
  Button,
  EmptyState,
  IconButton,
  SegmentedControl,
  Skeleton,
  useCommandQuery,
  Icon,
} from "@rebar/ui";
import { useState } from "react";
import type { ReportInput, ReportOutput } from "../contract";
import { shiftAnchor } from "../logic/report";
import { formatDuration } from "../logic/parse-time";
import { useDurationFormat } from "./shared";

const MONTHS = [
  "leden",
  "únor",
  "březen",
  "duben",
  "květen",
  "červen",
  "červenec",
  "srpen",
  "září",
  "říjen",
  "listopad",
  "prosinec",
];

/** Přehledy hodin (HOD-02): moje hodiny za týden a měsíc, podle zakázky a osoby (hodiny všech jen s rozsahem „vše“). */
export function ReportView() {
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [by, setBy] = useState<"job" | "person">("job");
  const [anchor, setAnchor] = useState(todayIso());
  const [format, setFormat] = useDurationFormat();
  const q = useCommandQuery<ReportOutput, ReportInput>("hodiny.report", {
    period,
    anchor,
    scope,
    by,
  });
  const r = q.data;
  const max = Math.max(1, ...(r?.rows.map((x) => x.minutes) ?? [1]));
  const label = r
    ? period === "week"
      ? `${formatDate(r.from)} – ${formatDate(r.to)}`
      : `${MONTHS[Number(r.from.slice(5, 7)) - 1]} ${r.from.slice(0, 4)}`
    : "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          label="Období"
          value={period}
          onChange={setPeriod}
          options={[
            { value: "week", label: "Týden" },
            { value: "month", label: "Měsíc" },
          ]}
        />
        <IconButton
          label="Předchozí období"
          variant="secondary"
          onClick={() => setAnchor(shiftAnchor(period, anchor, -1))}
        >
          <Icon name="chevron-left" />
        </IconButton>
        <div className="min-w-44 text-center font-medium capitalize" data-testid="report-label">
          {label}
        </div>
        <IconButton
          label="Další období"
          variant="secondary"
          onClick={() => setAnchor(shiftAnchor(period, anchor, 1))}
        >
          <Icon name="chevron-right" />
        </IconButton>
        <Button variant="ghost" onClick={() => setAnchor(todayIso())}>
          Dnes
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {r?.canSeeAll && (
            <SegmentedControl
              label="Čí hodiny"
              value={scope}
              onChange={setScope}
              options={[
                { value: "mine", label: "Moje" },
                { value: "all", label: "Všech" },
              ]}
            />
          )}
          <SegmentedControl
            label="Podle"
            value={by}
            onChange={setBy}
            options={[
              { value: "job", label: "Zakázky" },
              { value: "person", label: "Osoby" },
            ]}
          />
          <SegmentedControl
            label="Zobrazení času"
            value={format}
            onChange={setFormat}
            options={[
              { value: "hm", label: "1:30" },
              { value: "decimal", label: "1,5" },
            ]}
          />
        </div>
      </div>

      {q.isLoading || !r ? (
        <Skeleton className="h-48" />
      ) : r.rows.length === 0 ? (
        <EmptyState title="V tomto období nic nezapsáno" />
      ) : (
        <>
          <p className="tabular text-lg font-medium" data-testid="report-total">
            Celkem {formatDuration(r.totalMinutes, format)} h
          </p>
          <ul className="space-y-3" data-testid="report-rows">
            {r.rows.map((row) => (
              <li key={row.id} className="rounded-lg border border-line p-3">
                <div className="flex items-baseline gap-3">
                  <span className="min-w-0 flex-1 truncate font-medium">{row.label}</span>
                  <span className="tabular font-medium">
                    {formatDuration(row.minutes, format)} h
                  </span>
                  <span className="tabular w-14 text-right text-sm text-muted">
                    {row.sharePct} %
                  </span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-subtle" aria-hidden>
                  <div
                    className="h-2 rounded-full bg-[var(--accent)]"
                    style={{ width: `${Math.max(2, (row.minutes / max) * 100)}%` }}
                  />
                </div>
                {(r.scope === "all" || r.by === "person") && row.parts.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-sm text-muted">
                    {row.parts.map((p) => (
                      <li key={p.id} className="flex gap-3">
                        <span className="min-w-0 flex-1 truncate">{p.label}</span>
                        <span className="tabular">{formatDuration(p.minutes, format)} h</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
