"use client";

import { formatClock, formatMinutes, todayIso, weekStartIso } from "@rebar/core/time";
import {
  BigButton,
  JobPicker,
  PendingBadge,
  Skeleton,
  TerminalCard,
  cn,
  reportOutcome,
  useActiveJobs,
  useCommandQuery,
  useJobChoice,
  useModuleUi,
  useNav,
  useTerminalQueue,
  type QueuedOp,
  type TerminalWidgetProps,
} from "@rebar/ui";
import { Coffee, LogIn, LogOut } from "lucide-react";
import { useEffect, useState } from "react";

type Running = {
  startedAt: string;
  breakStartedAt: string | null;
  breakMinutes: number;
  jobId: string | null;
  jobTitle: string | null;
} | null;
type Clock = { running: Running; todayMinutes: number };
type Summary = {
  today: string;
  todayMinutes: number;
  weekMinutes: number;
  entries: {
    id: string;
    kind: string;
    from: string | null;
    to: string | null;
    minutes: number;
    running: boolean;
    job: string | null;
  }[];
};

const hms = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Stav píchačky po započtení zápisů, které ještě čekají ve frontě (příchod bez signálu se hned ukáže jako běžící).
 * Zápisy se skládají v pořadí, v jakém je řemeslník pořídil.
 */
export function foldClock(
  server: Running,
  ops: readonly QueuedOp[],
  jobTitle: (id: string | null) => string | null,
): Running {
  let run: Running = server;
  for (const op of [...ops].sort((a, b) => a.createdAt - b.createdAt)) {
    const at = new Date(op.createdAt).toISOString();
    const input = (op.input ?? {}) as { jobId?: string | null; action?: "start" | "end" };
    if (op.command === "dochazka.clock.in" && !run) {
      run = {
        startedAt: at,
        breakStartedAt: null,
        breakMinutes: 0,
        jobId: input.jobId ?? null,
        jobTitle: jobTitle(input.jobId ?? null),
      };
    } else if (op.command === "dochazka.clock.break" && run) {
      if (input.action === "start" && !run.breakStartedAt) run = { ...run, breakStartedAt: at };
      else if (input.action === "end" && run.breakStartedAt) {
        const mins = Math.max(
          0,
          Math.round((op.createdAt - new Date(run.breakStartedAt).getTime()) / 60_000),
        );
        run = { ...run, breakStartedAt: null, breakMinutes: run.breakMinutes + mins };
      }
    } else if (op.command === "dochazka.clock.out") run = null;
  }
  return run;
}

/** Docházka v terminálu: příchod, přestávka a odchod velkými tlačítky, výběr zakázky a dnešní hodiny. */
export function ClockTerminalWidget({ label, settings, variant, pageHref }: TerminalWidgetProps) {
  const { Link } = useNav();
  const hasJobs = useModuleUi().has("zakazky");
  const status = useCommandQuery<Clock>("dochazka.clock.status", {}, { refetchInterval: 60_000 });
  const summary = useCommandQuery<Summary>(
    "dochazka.terminal.summary",
    {},
    { enabled: settings.attendance.showHours || variant === "page" },
  );
  const { jobs, loading } = useActiveJobs(hasJobs);
  const choice = useJobChoice(jobs);
  const { submit, ops, online } = useTerminalQueue();
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);

  const clockOps = ops.filter((o) => o.group === "clock");
  const waiting = clockOps.filter((o) => o.state === "pending");
  const conflict = clockOps.find((o) => o.state === "conflict");
  const titleOf = (id: string | null) => jobs.find((j) => j.value === id)?.label ?? null;
  const run = foldClock(status.data?.running ?? null, waiting, titleOf);

  useEffect(() => {
    if (!run) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [run]);

  const elapsed = run
    ? now -
      new Date(run.startedAt).getTime() -
      run.breakMinutes * 60_000 -
      (run.breakStartedAt ? now - new Date(run.breakStartedAt).getTime() : 0)
    : 0;

  // bez volby změny zakázky se vybírá sama (jediná zakázka, nebo naposledy použitá); jinak se volba nabídne
  const showPicker = hasJobs && (settings.attendance.allowJobChange || !choice.value);
  const needsJob = settings.attendance.requireJob && hasJobs && !choice.value;

  async function act(command: string, input: Record<string, unknown>, text: string, done: string) {
    setBusy(true);
    try {
      const out = await submit({ command, input, label: text, group: "clock" });
      if (
        out.status === "sent" &&
        command === "dochazka.clock.out" &&
        out.result &&
        typeof out.result === "object"
      ) {
        const r = out.result as { discarded?: boolean; capped?: boolean; minutes?: number };
        if (r.discarded) {
          reportOutcome(
            out,
            r.capped
              ? "Píchačka běžela déle, než se do dne vejde, záznam se zahodil. Zapište docházku ručně."
              : "Odchod hned po příchodu, záznam se nevytvořil.",
          );
          return;
        }
        reportOutcome(
          out,
          r.capped
            ? `Píchačka běžela příliš dlouho, doba je zkrácena na ${formatMinutes(r.minutes ?? 0)}. Opravte záznam.`
            : `Odchod zapsán: ${formatMinutes(r.minutes ?? 0)}.`,
        );
        return;
      }
      reportOutcome(out, done);
    } finally {
      setBusy(false);
    }
  }

  return (
    <TerminalCard
      title={label}
      icon="clock"
      href={variant === "card" ? pageHref : null}
      tone={run ? "active" : "default"}
      testId="tile-dochazka.clock"
      bare={variant === "page"}
    >
      {status.isLoading ? (
        <Skeleton className="h-28" />
      ) : (
        <div className="space-y-3">
          <div>
            <div className="text-base text-muted" data-testid="clock-state">
              {run
                ? run.breakStartedAt
                  ? "Přestávka"
                  : `Pracujete od ${formatClock(run.startedAt)}`
                : `Dnes zapsáno ${formatMinutes(status.data?.todayMinutes ?? 0)}`}
            </div>
            <div className="tabular text-4xl font-semibold" data-testid="clock-timer">
              {run ? hms(elapsed) : "0:00:00"}
            </div>
            {run?.jobTitle && <div className="mt-0.5 text-base text-muted">{run.jobTitle}</div>}
            {waiting.length > 0 && (
              <div className="mt-2">
                <PendingBadge />
              </div>
            )}
          </div>

          {conflict && (
            <p role="alert" className="rounded-xl bg-danger-soft p-3 text-base text-danger">
              {conflict.label}: {conflict.error ?? "zápis se nepodařilo odeslat."}{" "}
              <Link href="/t/vice#fronta" className="font-semibold underline">
                Vyřešit
              </Link>
            </p>
          )}

          {!run ? (
            <>
              {showPicker && (
                <JobPicker
                  jobs={jobs}
                  loading={loading}
                  value={choice.value}
                  onChange={choice.set}
                  optional={!settings.attendance.requireJob}
                  placeholder="Vyberte zakázku"
                />
              )}
              {!showPicker && hasJobs && choice.value && (
                <p className="text-base text-muted">Zakázka: {titleOf(choice.value)}</p>
              )}
              <BigButton
                variant="primary"
                loading={busy}
                disabled={needsJob || !!conflict}
                onClick={() =>
                  void act(
                    "dochazka.clock.in",
                    { jobId: choice.value || null },
                    "Příchod",
                    "Příchod zapsán.",
                  )
                }
              >
                <LogIn /> Příchod
              </BigButton>
              {needsJob && <p className="text-base text-muted">Pro příchod vyberte zakázku.</p>}
            </>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <BigButton
                loading={busy}
                disabled={!!conflict}
                onClick={() =>
                  void act(
                    "dochazka.clock.break",
                    { action: run.breakStartedAt ? "end" : "start" },
                    run.breakStartedAt ? "Konec přestávky" : "Přestávka",
                    run.breakStartedAt ? "Přestávka skončila." : "Přestávka začala.",
                  )
                }
              >
                <Coffee /> {run.breakStartedAt ? "Konec přestávky" : "Přestávka"}
              </BigButton>
              <BigButton
                variant="danger"
                loading={busy}
                disabled={!!conflict}
                onClick={() => void act("dochazka.clock.out", {}, "Odchod", "Odchod zapsán.")}
              >
                <LogOut /> Odchod
              </BigButton>
            </div>
          )}
          {!online && (
            <p className="text-base text-muted">
              Bez připojení: zápis se uloží v telefonu a odešle se s přesným časem ťuknutí.
            </p>
          )}

          {settings.attendance.showHours && summary.data && (
            <dl
              className="grid grid-cols-2 gap-2 border-t border-line pt-3 text-base"
              data-testid="clock-hours"
            >
              <div>
                <dt className="text-muted">Dnes</dt>
                <dd className="text-xl font-semibold tabular">
                  {formatMinutes(summary.data.todayMinutes)}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Tento týden</dt>
                <dd className="text-xl font-semibold tabular">
                  {formatMinutes(summary.data.weekMinutes)}
                </dd>
              </div>
            </dl>
          )}
          {variant === "page" && (summary.data?.weekMinutes ?? 0) > 0 && (
            <BigButton
              loading={busy}
              disabled={!!conflict}
              onClick={() =>
                void act(
                  "dochazka.submitWeek",
                  { weekStart: weekStartIso(summary.data?.today ?? todayIso()) },
                  "Odeslání týdne ke schválení",
                  "Týden odeslán ke schválení.",
                )
              }
            >
              Odeslat týden ke schválení
            </BigButton>
          )}
          {variant === "page" && summary.data && summary.data.entries.length > 0 && (
            <section aria-label="Dnešní záznamy" className="border-t border-line pt-3">
              <h3 className="mb-1 text-base font-medium text-muted">Dnešní záznamy</h3>
              <ul className="divide-y divide-line">
                {summary.data.entries.map((e) => (
                  <li key={e.id} className={cn("py-2 text-base", e.running && "font-medium")}>
                    {e.from ?? "—"}–{e.to ?? (e.running ? "běží" : "—")} ·{" "}
                    {e.running ? "probíhá" : formatMinutes(e.minutes)}
                    {e.job && <span className="block text-muted">{e.job}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </TerminalCard>
  );
}
