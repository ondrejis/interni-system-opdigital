"use client";

import { formatDate } from "@rebar/core/shared";
import { Chip, Skeleton, cn, useCommandQuery, type RecordOverviewCard } from "@rebar/ui";
import { fromExecution, fromPreparation } from "@rebar/zakazky";
import { ScheduleCard } from "./schedule-card";
import { weatherSummary } from "./diary-shared";
import type { DiaryEntryData } from "./diary-editor";

const SEVERITY: Record<string, { label: string; color: string }> = {
  minor: { label: "Drobná", color: "gray" },
  normal: { label: "Běžná", color: "orange" },
  major: { label: "Závažná", color: "red" },
};

/** Poslední zápis ze stavebního deníku (Přehled zakázky). */
function LastDiaryCard({ id, openTab }: { id: string; openTab: (t: string, s?: string) => void }) {
  const q = useCommandQuery<{ entries: DiaryEntryData[] }>("realizace.diary.list", { jobId: id });
  const last = q.data?.entries[0];
  return (
    <section aria-label="Poslední zápis z deníku" className="rounded-lg border border-line p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Poslední zápis z deníku</h3>
        <button
          type="button"
          className="text-sm text-accent hover:underline"
          onClick={() => openTab("realizace", "denik")}
        >
          Otevřít deník
        </button>
      </div>
      {q.isLoading ? (
        <Skeleton className="h-12" />
      ) : !last ? (
        <p className="text-sm text-muted">Do deníku se zatím nezapisovalo.</p>
      ) : (
        <div className="space-y-1" data-testid="overview-last-diary">
          <div className="flex flex-wrap items-center gap-2">
            <b>{formatDate(last.date)}</b>
            {last.weatherData && <Chip color="blue">{weatherSummary(last.weatherData)}</Chip>}
            {last.author && <span className="text-sm text-muted">· {last.author}</span>}
          </div>
          {last.work && <p className="line-clamp-3 whitespace-pre-wrap">{last.work}</p>}
          {last.workers.length > 0 && (
            <p className="text-sm text-muted">
              Na stavbě: {last.workers.map((w) => w.name).join(", ")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

type OpenDefects = {
  count: number;
  items: {
    id: string;
    title: string;
    severity: string | null;
    dueDate: string | null;
    stage: string;
  }[];
};

/** Otevřené vady zakázky (Přehled): nejdřív po termínu. */
function OpenDefectsCard({
  id,
  openTab,
}: {
  id: string;
  openTab: (t: string, s?: string) => void;
}) {
  const q = useCommandQuery<OpenDefects>("realizace.defects.open", { jobId: id });
  const today = new Date().toISOString().slice(0, 10);
  return (
    <section aria-label="Otevřené vady" className="rounded-lg border border-line p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          Otevřené vady{q.data?.count ? ` (${q.data.count})` : ""}
        </h3>
        <button
          type="button"
          className="text-sm text-accent hover:underline"
          onClick={() => openTab("realizace", "vady")}
        >
          Všechny vady
        </button>
      </div>
      {q.isLoading ? (
        <Skeleton className="h-10" />
      ) : !q.data?.count ? (
        <p className="text-sm text-muted">Žádné otevřené vady.</p>
      ) : (
        <ul className="space-y-1" data-testid="overview-defects">
          {q.data.items.map((d) => (
            <li key={d.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate">{d.title}</span>
              {d.severity && SEVERITY[d.severity] && (
                <Chip color={SEVERITY[d.severity]!.color}>{SEVERITY[d.severity]!.label}</Chip>
              )}
              {d.dueDate && (
                <span
                  className={cn(
                    "shrink-0 text-sm tabular",
                    d.dueDate < today ? "text-danger" : "text-muted",
                  )}
                >
                  {formatDate(d.dueDate)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Karty Přehledu zakázky, které dodává Realizace. */
export const overviewCards: RecordOverviewCard[] = [
  {
    // zmenšený Gantt; stejná viditelnost jako záložka Harmonogram (od přípravy, v obchodní fázi vede nikam)
    id: "schedule",
    order: 30,
    permission: "realizace.read",
    visible: fromPreparation,
    render: ({ id, entity, openTab }) => (
      <ScheduleCard id={id} canWrite={entity.can.write} openTab={openTab} />
    ),
  },
  {
    id: "last-diary",
    order: 40,
    permission: "realizace.read",
    visible: fromExecution,
    render: ({ id, openTab }) => <LastDiaryCard id={id} openTab={openTab} />,
  },
  {
    id: "open-defects",
    order: 45,
    permission: "realizace.read",
    visible: fromExecution,
    render: ({ id, openTab }) => <OpenDefectsCard id={id} openTab={openTab} />,
  },
];
