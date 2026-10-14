"use client";

import { todayIso } from "@rebar/core/time";
import { Button, Chip, Skeleton, cn, useCommandQuery } from "@rebar/ui";
import { CalendarRange } from "lucide-react";
import { StateIcon } from "./schedule-parts";
import {
  compactTimeline,
  dueText,
  nextUp,
  scheduleHealth,
  type CompactBar,
  type CompactTimeline,
} from "./schedule-compact";
import { jobProgress, scheduleSummary } from "./schedule";
import {
  STATE_LABEL,
  STATE_TONE,
  fmtRange,
  fmtShort,
  phaseState,
  workdaysLabel,
  type PhasesData,
} from "./schedule-shared";

/** Řádek pásu: výška se zvětší na dotykovém zařízení, aby se pruhy dobře trefovaly (celý pás je jedno tlačítko). */
const ROW = "h-5 @md:h-6";

function barTitle(b: CompactBar): string {
  const label = b.milestone && b.state === "done" ? "Splněno" : STATE_LABEL[b.state];
  const delay = b.state === "late" && b.delay > 0 ? ` +${b.delay} d` : "";
  return `${b.name}: ${fmtRange(b.startDate, b.endDate)} · ${label}${delay}`;
}

function Bar({ b }: { b: CompactBar }) {
  const tone = STATE_TONE[b.state];
  if (b.milestone) {
    return (
      <span
        title={barTitle(b)}
        className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] border-2"
        style={{
          left: `${b.left}%`,
          borderColor: tone.edge,
          background: b.state === "done" ? tone.edge : tone.track,
        }}
      />
    );
  }
  return (
    <span
      title={barTitle(b)}
      className={cn(
        "absolute top-1/2 block h-3 -translate-y-1/2 overflow-hidden @md:h-3.5",
        b.cutLeft ? "rounded-l-none" : "rounded-l-[4px]",
        b.cutRight ? "rounded-r-none" : "rounded-r-[4px]",
      )}
      style={{
        left: `${b.left}%`,
        width: `${b.width}%`,
        background: tone.track,
        boxShadow: `inset 0 0 0 1px ${tone.edge}`,
      }}
    >
      <span
        className="block h-full"
        style={{ width: `${b.state === "done" ? 100 : b.progress}%`, background: tone.fill }}
      />
    </span>
  );
}

/** Pás: měsíce nahoře, řádek na fázi, svislá značka „dnes“. Všechno uvnitř je jen obraz (celý pás je tlačítko). */
function Strip({ t, onOpen, label }: { t: CompactTimeline; onOpen: () => void; label: string }) {
  const todayHides = (left: number) => t.today !== null && Math.abs(left - t.today) < 11;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      data-testid="schedule-card-strip"
      className="block w-full rounded-md bg-subtle p-2 text-left transition-colors duration-150 hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span className="flex gap-2" aria-hidden>
        <span className="hidden w-36 shrink-0 @lg:block">
          <span className="block h-5" />
          {t.bars.map((b) => (
            <span
              key={b.id}
              className={cn(
                ROW,
                "flex items-center gap-1.5 truncate text-sm",
                b.state === "done" ? "text-muted" : "text-fg",
              )}
            >
              <span className="truncate">{b.name}</span>
            </span>
          ))}
        </span>
        <span className="relative block min-w-0 flex-1">
          <span className="relative block h-5 text-xs text-muted">
            {t.ticks.map((m) =>
              todayHides(m.left) ? null : (
                <span
                  key={m.label + m.left}
                  className="absolute top-0 whitespace-nowrap"
                  style={{ left: `${m.left}%` }}
                >
                  {m.label}
                </span>
              ),
            )}
            {t.today !== null && (
              <span
                className="absolute top-0 -translate-x-1/2 whitespace-nowrap rounded-full bg-accent px-1.5 text-xs font-medium leading-4 text-accent-fg"
                style={{ left: `clamp(1rem, ${t.today}%, calc(100% - 1rem))` }}
              >
                Dnes
              </span>
            )}
          </span>
          {t.bars.map((b) => (
            <span key={b.id} className={cn(ROW, "relative block")}>
              <Bar b={b} />
            </span>
          ))}
          {t.today !== null && (
            <span
              className="pointer-events-none absolute bottom-0 top-5 w-px -translate-x-1/2 bg-accent"
              style={{ left: `${t.today}%` }}
            />
          )}
        </span>
      </span>
    </button>
  );
}

function CardShell({ action, children }: { action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-label="Harmonogram" className="rounded-lg border border-line p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Harmonogram</h3>
        {action}
      </div>
      <div className="@container">{children}</div>
    </section>
  );
}

/**
 * Karta Přehledu zakázky: zmenšený Gantt z fází harmonogramu (čtení, žádné peníze). Pás i seznam nejbližších fází
 * vedou do plného harmonogramu (Realizace → Harmonogram), kde se plánuje a upravuje.
 */
export function ScheduleCard({
  id,
  canWrite,
  openTab,
}: {
  id: string;
  canWrite: boolean;
  openTab: (t: string, s?: string) => void;
}) {
  const q = useCommandQuery<PhasesData>("realizace.phases.list", { jobId: id });
  const open = () => openTab("realizace", "harmonogram");

  if (q.isLoading)
    return (
      <CardShell>
        <Skeleton className="h-28" />
      </CardShell>
    );
  if (q.isError || !q.data)
    return (
      <CardShell>
        <div role="alert" className="flex items-center justify-between gap-3 text-sm text-danger">
          <span>Harmonogram se nepodařilo načíst.</span>
          <Button size="sm" variant="secondary" onClick={() => void q.refetch()}>
            Zkusit znovu
          </Button>
        </div>
      </CardShell>
    );

  const phases = q.data.phases;
  if (!phases.length)
    return (
      <CardShell>
        <div
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
          data-testid="schedule-card-empty"
        >
          <div className="flex min-w-0 flex-1 basis-60 items-start gap-3">
            <CalendarRange className="mt-0.5 size-4 shrink-0 text-faint" aria-hidden />
            <div className="min-w-0">
              <p className="font-medium">Harmonogram zatím není naplánovaný</p>
              <p className="text-sm text-muted">
                Rozdělte zakázku na fáze a milníky, ať je vidět, co kdy začíná a kdo za co odpovídá.
              </p>
            </div>
          </div>
          {canWrite && (
            <Button variant="secondary" onClick={open}>
              Naplánovat
            </Button>
          )}
        </div>
      </CardShell>
    );

  const today = todayIso();
  const timeline = compactTimeline(phases, today)!;
  const health = scheduleHealth(phases);
  const summary = scheduleSummary(phases, today);
  const progress = jobProgress(phases);
  const upcoming = nextUp(phases, 3);
  const dates =
    summary.start && summary.end
      ? fmtRange(summary.start, summary.end) +
        (summary.end.slice(0, 4) !== today.slice(0, 4) ? ` ${summary.end.slice(0, 4)}` : "")
      : "";
  const remaining =
    health.kind === "done"
      ? "vše hotovo"
      : summary.overdue > 0
        ? `po termínu o ${workdaysLabel(summary.overdue)}`
        : summary.end === today
          ? "končí dnes"
          : `zbývá ${workdaysLabel(summary.remaining)}`;

  return (
    <CardShell
      action={
        <button
          type="button"
          className="text-sm text-accent hover:underline"
          onClick={open}
          data-testid="schedule-card-open"
        >
          Otevřít harmonogram
        </button>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="tabular text-lg font-semibold">{progress} %</span>
          <span className="tabular min-w-0 text-sm text-muted">
            {dates} · {remaining}
          </span>
          <span className="ml-auto" data-testid="schedule-card-health">
            {health.kind === "late" ? (
              <Chip color="red" dot title={health.names.join(", ")}>
                {health.count === 1
                  ? `Zpoždění ${workdaysLabel(health.delay)}`
                  : `${health.count} fáze se zpožděním`}
              </Chip>
            ) : health.kind === "done" ? (
              <Chip color="green" dot>
                Hotovo
              </Chip>
            ) : (
              <Chip color="green" dot>
                Podle plánu
              </Chip>
            )}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={`Průběh zakázky ${progress} %`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          className="h-1.5 overflow-hidden rounded-full bg-hover"
        >
          <div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
        </div>

        <div>
          <Strip
            t={timeline}
            onOpen={open}
            label={`Otevřít harmonogram: ${phases.length} ${phases.length === 1 ? "fáze" : "fází"}, průběh ${progress} %`}
          />
          {(timeline.hidden > 0 || timeline.window.windowed) && (
            <p className="mt-1.5 text-sm text-faint" data-testid="schedule-card-note">
              {timeline.window.windowed ? "Výřez kolem dneška." : ""}
              {timeline.window.windowed && timeline.hidden > 0 ? " " : ""}
              {timeline.hidden > 0 ? `Dalších fází mimo pás: ${timeline.hidden}.` : ""}
            </p>
          )}
        </div>

        {upcoming.length > 0 && (
          <div>
            <h4 className="mb-1 text-sm font-medium text-muted">Nejbližší</h4>
            <ul className="space-y-2 @md:space-y-1" data-testid="schedule-card-next">
              {upcoming.map((p) => {
                const st = phaseState(p);
                return (
                  <li
                    key={p.id}
                    className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 @md:grid-cols-[auto_minmax(0,1fr)_auto]"
                  >
                    <StateIcon state={st} milestone={p.milestone} />
                    <span className="min-w-0 truncate" title={p.name}>
                      {p.name}
                    </span>
                    <span className="tabular col-start-2 flex items-baseline gap-x-2 text-sm text-muted @md:col-start-3 @md:justify-end">
                      {st === "late" && p.delay > 0 && (
                        <span className="font-medium text-danger">+{p.delay} d</span>
                      )}
                      <span className="hidden @md:inline">
                        {p.milestone ? fmtShort(p.startDate) : fmtRange(p.startDate, p.endDate)}
                      </span>
                      <span>
                        {dueText(
                          st === "planned",
                          st === "planned" ? p.startDate : p.endDate,
                          today,
                        )}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </CardShell>
  );
}
