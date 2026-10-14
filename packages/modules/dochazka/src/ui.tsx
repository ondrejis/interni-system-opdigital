"use client";

import { formatDate, formatMinor } from "@rebar/core/shared";
import { addDaysIso, formatClock, formatMinutes, todayIso, weekStartIso } from "@rebar/core/time";
import {
  Button,
  Checkbox,
  Chip,
  Combobox,
  Dialog,
  DialogContent,
  EmptyState,
  Field,
  IconButton,
  Input,
  Skeleton,
  Textarea,
  cn,
  defineModuleUi,
  successToast,
  useCommandMutation,
  useCommandQuery,
  useEntityApi,
  useModuleUi,
  useCan,
  useNav,
} from "@rebar/ui";
import { ChevronLeft, ChevronRight, Coffee, LogIn, LogOut, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { TIME_KINDS, isAbsence } from "./rules";
import { ClockTerminalWidget } from "./terminal-ui";

type Entry = {
  id: string;
  userId: string;
  date: string;
  kind: string;
  startTime: string | null;
  endTime: string | null;
  breakMinutes: number;
  minutes: number;
  jobId: string | null;
  jobTitle: string | null;
  note: string | null;
  status: string;
  source: string;
  reviewNote: string | null;
};
type Week = {
  weekStart: string;
  userId: string;
  userName: string;
  isSelf: boolean;
  entries: Entry[];
  days: { date: string; holiday: string | null; workday: boolean; minutes: number }[];
  totalMinutes: number;
  fundMinutes: number;
  lockedMonths: string[];
  requireApproval: boolean;
  canApprove: boolean;
};

const DAY = ["po", "út", "st", "čt", "pá", "so", "ne"];
const STATUS: Record<string, { label: string; color: string }> = {
  draft: { label: "Rozpracováno", color: "gray" },
  submitted: { label: "Ke schválení", color: "blue" },
  approved: { label: "Schváleno", color: "green" },
  returned: { label: "Vráceno", color: "red" },
};
const kindLabel = (k: string) => TIME_KINDS.find((x) => x.value === k)?.label ?? k;
const kindColor = (k: string) => TIME_KINDS.find((x) => x.value === k)?.color ?? "gray";
const dayLabel = (date: string, i: number) =>
  `${DAY[i]} ${Number(date.slice(8))}. ${Number(date.slice(5, 7))}.`;

function Err({ error }: { error: Error | null }) {
  return error ? (
    <p role="alert" className="mt-2 text-sm text-danger">
      {error.message}
    </p>
  ) : null;
}

/* ---------- píchačka ---------- */

type Clock = {
  running: {
    id: string;
    startedAt: string;
    breakStartedAt: string | null;
    breakMinutes: number;
    kind: string;
    jobId: string | null;
    jobTitle: string | null;
    note: string | null;
  } | null;
  todayMinutes: number;
};

const hms = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/** Píchačka: velká tlačítka pro příchod, přestávku a odchod; čas běží i při zavřené stránce (počítá se z času příchodu). */
export function ClockCard({ compact }: { compact?: boolean }) {
  const q = useCommandQuery<Clock>("dochazka.clock.status", {}, { refetchInterval: 60_000 });
  const api = useEntityApi();
  const hasJobs = useModuleUi().has("zakazky");
  const [job, setJob] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const refresh = () => q.refetch();
  const inn = useCommandMutation<{ jobId: string | null }>("dochazka.clock.in", {
    onSuccess: () => {
      successToast("Příchod zapsán.");
      void refresh();
    },
  });
  const out = useCommandMutation<
    Record<string, unknown>,
    { discarded: boolean; minutes: number; capped: boolean }
  >("dochazka.clock.out", {
    onSuccess: (r) => {
      successToast(
        r.discarded
          ? r.capped
            ? "Píchačka běžela déle, než se do dne vejde, záznam se zahodil. Zapište docházku ručně."
            : "Odchod hned po příchodu, záznam se nevytvořil."
          : r.capped
            ? `Píchačka běžela příliš dlouho, doba je zkrácena na ${formatMinutes(r.minutes)}. Opravte záznam.`
            : `Odchod zapsán: ${formatMinutes(r.minutes)}.`,
      );
      void refresh();
    },
  });
  const brk = useCommandMutation<{ action: "start" | "end" }>("dochazka.clock.break", {
    onSuccess: () => void refresh(),
  });
  const run = q.data?.running;
  const elapsed = run
    ? now -
      new Date(run.startedAt).getTime() -
      run.breakMinutes * 60_000 -
      (run.breakStartedAt ? now - new Date(run.breakStartedAt).getTime() : 0)
    : 0;

  if (q.isLoading) return <Skeleton className="h-28" />;
  return (
    <section
      aria-label="Píchačka"
      data-testid="clock-card"
      className={cn(
        "rounded-lg border border-line p-4",
        run && "border-accent-line bg-accent-soft",
      )}
    >
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-40 flex-1">
          <div className="text-sm text-muted">
            {run
              ? run.breakStartedAt
                ? "Přestávka"
                : "Pracujete od " + formatClock(run.startedAt)
              : `Dnes zapsáno ${formatMinutes(q.data?.todayMinutes ?? 0)}`}
          </div>
          <div
            className={cn("tabular font-semibold", compact ? "text-2xl" : "text-3xl")}
            data-testid="clock-timer"
          >
            {run ? hms(elapsed) : "0:00:00"}
          </div>
          {run?.jobTitle && <div className="text-sm text-muted">{run.jobTitle}</div>}
        </div>
        {!run ? (
          <div className="flex flex-wrap items-center gap-2">
            {hasJobs && (
              <div className="w-56">
                <Combobox
                  aria-label="Zakázka"
                  load={(s) => api.lookups.records("job", s)}
                  value={job}
                  onChange={(v) => setJob(v as string | null)}
                  placeholder="Zakázka (nepovinné)"
                  clearable
                />
              </div>
            )}
            <Button
              size="lg"
              variant="primary"
              loading={inn.isPending}
              onClick={() => inn.mutate({ jobId: job })}
            >
              <LogIn /> Příchod
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              size="lg"
              variant="secondary"
              loading={brk.isPending}
              onClick={() => brk.mutate({ action: run.breakStartedAt ? "end" : "start" })}
            >
              <Coffee /> {run.breakStartedAt ? "Konec přestávky" : "Přestávka"}
            </Button>
            <Button
              size="lg"
              variant="danger"
              loading={out.isPending}
              onClick={() => out.mutate({})}
            >
              <LogOut /> Odchod
            </Button>
          </div>
        )}
      </div>
      <Err
        error={
          (inn.error as Error | null) ?? (out.error as Error | null) ?? (brk.error as Error | null)
        }
      />
    </section>
  );
}

/* ---------- zápis záznamu ---------- */

type Draft = {
  id?: string;
  date: string;
  kind: string;
  mode: "range" | "hours";
  startTime: string;
  endTime: string;
  breakMinutes: string;
  hours: string;
  jobId: string | null;
  jobTitle: string | null;
  note: string;
};

const emptyDraft = (date: string): Draft => ({
  date,
  kind: "work",
  mode: "range",
  startTime: "07:00",
  endTime: "15:30",
  breakMinutes: "30",
  hours: "",
  jobId: null,
  jobTitle: null,
  note: "",
});

function EntryDialog({
  draft,
  userId,
  onClose,
}: {
  draft: Draft | null;
  userId: string;
  onClose: () => void;
}) {
  const api = useEntityApi();
  const hasJobs = useModuleUi().has("zakazky");
  const [d, setD] = useState<Draft>(draft ?? emptyDraft(todayIso()));
  const save = useCommandMutation<Record<string, unknown>>("dochazka.save", {
    onSuccess: () => {
      successToast("Zapsáno.");
      onClose();
    },
  });
  const del = useCommandMutation<{ id: string }>("dochazka.delete", { onSuccess: onClose });
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((s) => ({ ...s, [k]: v }));
  const absence = isAbsence(d.kind);
  return (
    <Dialog open={!!draft} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={d.id ? "Upravit záznam" : "Zapsat docházku"}
        description={formatDate(d.date)}
      >
        <form
          className="space-y-3 px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({
              ...(d.id ? { id: d.id } : {}),
              userId,
              date: d.date,
              kind: d.kind,
              ...(d.mode === "range"
                ? {
                    startTime: d.startTime,
                    endTime: d.endTime,
                    breakMinutes: Number(d.breakMinutes || 0),
                  }
                : { hours: Number(d.hours.replace(",", ".")) }),
              jobId: absence ? null : d.jobId,
              note: d.note || null,
            });
          }}
        >
          <Field label="Druh">
            <Combobox
              aria-label="Druh"
              options={TIME_KINDS.map((k) => ({ value: k.value, label: k.label }))}
              value={d.kind}
              onChange={(v) => v && set("kind", v as string)}
            />
          </Field>
          <div
            className="flex gap-1 rounded-md border border-line-strong p-0.5"
            role="group"
            aria-label="Zadání doby"
          >
            {(["range", "hours"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={d.mode === m}
                onClick={() => set("mode", m)}
                className={cn(
                  "flex-1 rounded px-3 py-1.5 font-medium",
                  d.mode === m ? "bg-accent text-accent-fg" : "text-muted hover:bg-hover",
                )}
              >
                {m === "range" ? "Od – do" : "Počet hodin"}
              </button>
            ))}
          </div>
          {d.mode === "range" ? (
            <div className="grid grid-cols-3 gap-x-3">
              <Field label="Od" htmlFor="te-from">
                <Input
                  id="te-from"
                  type="time"
                  value={d.startTime}
                  onChange={(e) => set("startTime", e.target.value)}
                />
              </Field>
              <Field label="Do" htmlFor="te-to">
                <Input
                  id="te-to"
                  type="time"
                  value={d.endTime}
                  onChange={(e) => set("endTime", e.target.value)}
                />
              </Field>
              <Field label="Přestávka (min)" htmlFor="te-break">
                <Input
                  id="te-break"
                  inputMode="numeric"
                  value={d.breakMinutes}
                  onChange={(e) => set("breakMinutes", e.target.value.replace(/\D/g, ""))}
                />
              </Field>
            </div>
          ) : (
            <Field label="Počet hodin" htmlFor="te-hours">
              <Input
                id="te-hours"
                inputMode="decimal"
                placeholder="např. 7,5"
                value={d.hours}
                onChange={(e) => set("hours", e.target.value)}
              />
            </Field>
          )}
          {!absence && hasJobs && (
            <Field label="Zakázka">
              <Combobox
                aria-label="Zakázka"
                load={(s) => api.lookups.records("job", s)}
                value={d.jobId}
                selectedLabels={d.jobId && d.jobTitle ? { [d.jobId]: d.jobTitle } : {}}
                onChange={(v) => set("jobId", v as string | null)}
                placeholder="Bez zakázky"
                clearable
              />
            </Field>
          )}
          <Field label="Poznámka (co se dělalo)" htmlFor="te-note">
            <Textarea
              id="te-note"
              className="min-h-16"
              value={d.note}
              onChange={(e) => set("note", e.target.value)}
            />
          </Field>
          <Err error={(save.error as Error | null) ?? (del.error as Error | null)} />
          <div className="flex items-center justify-between gap-2">
            {d.id ? (
              <Button
                type="button"
                variant="ghost"
                className="text-danger"
                onClick={() => del.mutate({ id: d.id! })}
              >
                <Trash2 /> Smazat
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Zrušit
              </Button>
              <Button type="submit" variant="primary" loading={save.isPending}>
                Uložit
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- týden ---------- */

function WeekView({ initialWeek, userId }: { initialWeek: string; userId?: string | undefined }) {
  const [weekStart, setWeekStart] = useState(weekStartIso(initialWeek));
  const [draft, setDraft] = useState<Draft | null>(null);
  const q = useCommandQuery<Week>("dochazka.week", { weekStart, ...(userId ? { userId } : {}) });
  const submit = useCommandMutation<{ weekStart: string }>("dochazka.submitWeek", {
    onSuccess: () => successToast("Týden odeslán ke schválení."),
  });
  const withdraw = useCommandMutation<{ weekStart: string }>("dochazka.withdrawWeek", {
    onSuccess: () => successToast("Týden vzat zpět, můžete ho upravit."),
  });
  const w = q.data;
  const today = todayIso();
  const editable = (e: Entry) =>
    !(w?.lockedMonths ?? []).includes(e.date.slice(0, 7)) &&
    (e.status !== "approved" || w?.canApprove) &&
    (e.status !== "submitted" || w?.canApprove);
  const statuses = new Set(w?.entries.map((e) => e.status));
  const canSubmit = w?.isSelf && (statuses.has("draft") || statuses.has("returned"));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <IconButton
          label="Předchozí týden"
          variant="secondary"
          onClick={() => setWeekStart(addDaysIso(weekStart, -7))}
        >
          <ChevronLeft />
        </IconButton>
        <div className="min-w-48 text-center font-medium" data-testid="week-label">
          {formatDate(weekStart)} – {formatDate(addDaysIso(weekStart, 6))}
        </div>
        <IconButton
          label="Další týden"
          variant="secondary"
          onClick={() => setWeekStart(addDaysIso(weekStart, 7))}
        >
          <ChevronRight />
        </IconButton>
        <Button variant="ghost" onClick={() => setWeekStart(weekStartIso(today))}>
          Tento týden
        </Button>
        {w && (
          <span className="ml-auto text-muted tabular" data-testid="week-total">
            Celkem {formatMinutes(w.totalMinutes)} z {formatMinutes(w.fundMinutes)}
          </span>
        )}
        {w && !w.isSelf && <Chip>{w.userName}</Chip>}
      </div>

      {q.isLoading || !w ? (
        <Skeleton className="h-64" />
      ) : (
        <ol className="grid gap-3 lg:grid-cols-7" data-testid="week-days">
          {w.days.map((day, i) => {
            const entries = w.entries.filter((e) => e.date === day.date);
            return (
              <li
                key={day.date}
                className={cn(
                  "flex flex-col rounded-lg border border-line",
                  !day.workday && "bg-subtle",
                  day.date === today && "ring-2 ring-[var(--accent-line)]",
                )}
                data-date={day.date}
              >
                <div className="flex items-center justify-between px-3 py-2">
                  <div>
                    <div className="font-medium capitalize">{dayLabel(day.date, i)}</div>
                    {day.holiday && <div className="text-xs text-muted">{day.holiday}</div>}
                  </div>
                  <span className="tabular text-sm text-muted">
                    {day.minutes ? formatMinutes(day.minutes, false) : ""}
                  </span>
                </div>
                <ul className="flex-1 space-y-1.5 px-2 pb-2">
                  {entries.map((e) => (
                    <li key={e.id}>
                      <button
                        type="button"
                        disabled={!editable(e)}
                        onClick={() =>
                          setDraft({
                            id: e.id,
                            date: e.date,
                            kind: e.kind,
                            mode: e.startTime ? "range" : "hours",
                            startTime: e.startTime ?? "07:00",
                            endTime: e.endTime ?? "15:30",
                            breakMinutes: String(e.breakMinutes),
                            hours: e.startTime ? "" : String(e.minutes / 60).replace(".", ","),
                            jobId: e.jobId,
                            jobTitle: e.jobTitle,
                            note: e.note ?? "",
                          })
                        }
                        className="w-full rounded-md border border-line bg-bg p-2 text-left hover:border-line-strong disabled:opacity-80"
                      >
                        <div className="flex items-center gap-1.5">
                          <Chip color={kindColor(e.kind)}>{kindLabel(e.kind)}</Chip>
                          <span className="tabular ml-auto font-medium">
                            {formatMinutes(e.minutes, false)}
                          </span>
                        </div>
                        {e.startTime && e.endTime && (
                          <div className="tabular mt-0.5 text-xs text-muted">
                            {e.startTime}–{e.endTime}
                            {e.breakMinutes ? ` (−${e.breakMinutes} min)` : ""}
                          </div>
                        )}
                        {e.source === "clock" && (
                          <div className="text-xs text-muted">z píchačky</div>
                        )}
                        {e.jobTitle && <div className="mt-0.5 truncate text-sm">{e.jobTitle}</div>}
                        {e.note && <div className="truncate text-xs text-muted">{e.note}</div>}
                        <div className="mt-1">
                          <Chip color={STATUS[e.status]?.color ?? "gray"}>
                            {STATUS[e.status]?.label ?? e.status}
                          </Chip>
                        </div>
                        {e.status === "returned" && e.reviewNote && (
                          <div className="mt-1 text-xs text-danger">Vráceno: {e.reviewNote}</div>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
                {!w.lockedMonths.includes(day.date.slice(0, 7)) && (
                  <button
                    type="button"
                    aria-label={`Zapsat docházku ${dayLabel(day.date, i)}`}
                    onClick={() => setDraft(emptyDraft(day.date))}
                    className="m-2 mt-0 flex items-center justify-center gap-1 rounded-md border border-dashed border-line py-1.5 text-sm text-muted hover:border-line-strong hover:text-fg"
                  >
                    <Plus className="size-4" /> Zapsat
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {w?.lockedMonths.length ? (
        <p className="text-sm text-muted">
          Měsíc {w.lockedMonths.join(", ")} je uzavřený, záznamy v něm nejde měnit.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {canSubmit && w?.requireApproval && (
          <Button
            variant="primary"
            loading={submit.isPending}
            onClick={() => submit.mutate({ weekStart })}
          >
            Odeslat týden ke schválení
          </Button>
        )}
        {w?.isSelf && statuses.has("submitted") && (
          <Button
            variant="secondary"
            loading={withdraw.isPending}
            onClick={() => withdraw.mutate({ weekStart })}
          >
            Vzít týden zpět
          </Button>
        )}
        {w && !w.requireApproval && (
          <span className="text-sm text-muted">Zápisy se schvalují automaticky.</span>
        )}
      </div>
      <Err error={(submit.error as Error | null) ?? (withdraw.error as Error | null)} />
      {draft && w && (
        <EntryDialog
          key={draft.id ?? draft.date}
          draft={draft}
          userId={w.userId}
          onClose={() => setDraft(null)}
        />
      )}
    </div>
  );
}

/* ---------- schvalování ---------- */

type Pending = { userId: string; name: string; week: string; minutes: number; entries: number }[];

function ReviewRow({ p }: { p: Pending[number] }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const q = useCommandQuery<Week>(
    "dochazka.week",
    { weekStart: p.week, userId: p.userId },
    { enabled: open },
  );
  const review = useCommandMutation<{
    userId: string;
    weekStart: string;
    decision: "approve" | "return";
    note?: string;
  }>("dochazka.reviewWeek", { onSuccess: () => successToast("Hotovo.") });
  return (
    <li className="rounded-lg border border-line">
      <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
        <button
          type="button"
          className="min-w-40 flex-1 text-left"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="font-medium">{p.name}</span>{" "}
          <span className="text-muted">
            · {formatDate(p.week)} – {formatDate(addDaysIso(p.week, 6))}
          </span>
        </button>
        <span className="tabular font-medium">{formatMinutes(p.minutes)}</span>
        <Button
          size="sm"
          variant="primary"
          loading={review.isPending}
          onClick={() =>
            review.mutate({ userId: p.userId, weekStart: p.week, decision: "approve" })
          }
        >
          Schválit
        </Button>
      </div>
      {open && (
        <div className="space-y-3 border-t border-line px-3 py-3">
          {q.isLoading ? (
            <Skeleton className="h-16" />
          ) : (
            <ul className="space-y-1 text-sm">
              {q.data?.entries.map((e) => (
                <li key={e.id} className="flex gap-3">
                  <span className="tabular w-20 text-muted">{formatDate(e.date)}</span>
                  <span className="w-28">{kindLabel(e.kind)}</span>
                  <span className="tabular w-14">{formatMinutes(e.minutes, false)}</span>
                  <span className="flex-1 truncate text-muted">
                    {[e.jobTitle, e.note].filter(Boolean).join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Input
              aria-label={`Důvod vrácení ${p.name}`}
              className="min-w-56 flex-1"
              placeholder="Co je potřeba opravit?"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={!note.trim()}
              onClick={() =>
                review.mutate({ userId: p.userId, weekStart: p.week, decision: "return", note })
              }
            >
              Vrátit k opravě
            </Button>
          </div>
          <Err error={review.error as Error | null} />
        </div>
      )}
    </li>
  );
}

function Approvals() {
  const q = useCommandQuery<Pending>("dochazka.approvals", {});
  if (q.isLoading) return <Skeleton className="h-24" />;
  if (!q.data?.length)
    return (
      <EmptyState title="Nic ke schválení" description="Až někdo odešle týden, objeví se tady." />
    );
  return (
    <ul className="space-y-2" data-testid="approvals">
      {q.data.map((p) => (
        <ReviewRow key={`${p.userId}-${p.week}`} p={p} />
      ))}
    </ul>
  );
}

/* ---------- měsíční přehled ---------- */

type Report = {
  month: string;
  locked: boolean;
  canClose: boolean;
  users: {
    userId: string;
    name: string;
    workedMinutes: number;
    absenceMinutes: number;
    fundMinutes: number;
    balanceMinutes: number;
    pendingMinutes: number;
    costMinor: number | null;
  }[];
};

const prevMonth = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y!, mo! - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const nextMonth = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y!, mo!, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

function MonthReport() {
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const q = useCommandQuery<Report>("dochazka.report", { month });
  const lock = useCommandMutation<{ month: string; locked: boolean }>("dochazka.lockMonth", {
    onSuccess: () => successToast("Hotovo."),
  });
  const r = q.data;
  const showCost = !!r?.users.some((u) => u.costMinor !== null);
  const hm = (n: number) => `${n < 0 ? "−" : ""}${formatMinutes(Math.abs(n), false)}`;
  function csv() {
    if (!r) return;
    const rows = [
      [
        "Zaměstnanec",
        "Odpracováno (h)",
        "Absence (h)",
        "Fond (h)",
        "Rozdíl (h)",
        "Neschváleno (h)",
      ],
      ...r.users.map((u) => [
        u.name,
        hm(u.workedMinutes),
        hm(u.absenceMinutes),
        hm(u.fundMinutes),
        hm(u.balanceMinutes),
        hm(u.pendingMinutes),
      ]),
    ];
    const text =
      "﻿" +
      rows
        .map((x) => x.map((c) => (/[;"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(";"))
        .join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    a.download = `dochazka-${month}.csv`;
    a.click();
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <IconButton
          label="Předchozí měsíc"
          variant="secondary"
          onClick={() => setMonth(prevMonth(month))}
        >
          <ChevronLeft />
        </IconButton>
        <div className="min-w-32 text-center font-medium">
          {month.split("-").reverse().join("/")}
        </div>
        <IconButton
          label="Další měsíc"
          variant="secondary"
          onClick={() => setMonth(nextMonth(month))}
        >
          <ChevronRight />
        </IconButton>
        {r?.locked && (
          <Chip color="orange" dot>
            Uzavřeno
          </Chip>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" onClick={csv} disabled={!r?.users.length}>
            Stáhnout CSV
          </Button>
          {r?.canClose && (
            <Button
              variant={r.locked ? "secondary" : "primary"}
              loading={lock.isPending}
              onClick={() => lock.mutate({ month, locked: !r.locked })}
            >
              {r.locked ? "Znovu otevřít měsíc" : "Uzavřít měsíc"}
            </Button>
          )}
        </div>
      </div>
      {q.isLoading ? (
        <Skeleton className="h-32" />
      ) : !r?.users.length ? (
        <EmptyState title="V tomto měsíci není žádná docházka" />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[40rem] text-left" data-testid="month-report">
            <thead className="bg-subtle text-sm text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Zaměstnanec</th>
                <th className="px-3 py-2 text-right font-medium">Odpracováno</th>
                <th className="px-3 py-2 text-right font-medium">Absence</th>
                <th className="px-3 py-2 text-right font-medium">Fond</th>
                <th className="px-3 py-2 text-right font-medium">Rozdíl</th>
                <th className="px-3 py-2 text-right font-medium">Neschváleno</th>
                {showCost && <th className="px-3 py-2 text-right font-medium">Náklad práce</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {r.users.map((u) => (
                <tr key={u.userId}>
                  <td className="px-3 py-2 font-medium">{u.name}</td>
                  <td className="tabular px-3 py-2 text-right">{hm(u.workedMinutes)} h</td>
                  <td className="tabular px-3 py-2 text-right text-muted">
                    {hm(u.absenceMinutes)} h
                  </td>
                  <td className="tabular px-3 py-2 text-right text-muted">{hm(u.fundMinutes)} h</td>
                  <td
                    className={cn(
                      "tabular px-3 py-2 text-right",
                      u.balanceMinutes < 0 ? "text-danger" : "text-success",
                    )}
                  >
                    {hm(u.balanceMinutes)} h
                  </td>
                  <td className="tabular px-3 py-2 text-right">
                    {u.pendingMinutes ? (
                      <Chip color="orange">{hm(u.pendingMinutes)} h</Chip>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  {showCost && (
                    <td className="tabular px-3 py-2 text-right" data-testid="month-cost">
                      {formatMinor(u.costMinor ?? 0)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Err error={lock.error as Error | null} />
    </div>
  );
}

/* ---------- nastavení ---------- */

type Settings = {
  hoursPerDay: number;
  workDays: number[];
  requireApproval: boolean;
  defaultHourlyCostMinor: number;
  reminder: boolean;
};

function SettingsView() {
  const q = useCommandQuery<Settings>("dochazka.settings.get", {});
  const [s, setS] = useState<Settings | null>(null);
  useEffect(() => {
    if (q.data && !s) setS(q.data);
  }, [q.data, s]);
  const save = useCommandMutation<Settings>("dochazka.settings.save", {
    onSuccess: () => successToast("Nastavení docházky uloženo."),
  });
  if (!s) return <Skeleton className="h-40" />;
  return (
    <form
      className="max-w-xl space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(s);
      }}
    >
      <Field label="Hodin v pracovním dni" htmlFor="ds-hours">
        <Input
          id="ds-hours"
          inputMode="decimal"
          className="w-28"
          value={String(s.hoursPerDay)}
          onChange={(e) =>
            setS({ ...s, hoursPerDay: Number(e.target.value.replace(",", ".")) || 0 })
          }
        />
      </Field>
      <fieldset>
        <legend className="mb-1 text-sm font-medium text-muted">Pracovní dny</legend>
        <div className="flex flex-wrap gap-3">
          {DAY.map((d, i) => (
            <label key={d} className="flex cursor-pointer items-center gap-1.5">
              <Checkbox
                checked={s.workDays.includes(i + 1)}
                onCheckedChange={(v) =>
                  setS({
                    ...s,
                    workDays: v
                      ? [...s.workDays, i + 1].sort()
                      : s.workDays.filter((x) => x !== i + 1),
                  })
                }
              />{" "}
              {d}
            </label>
          ))}
        </div>
      </fieldset>
      <Field
        label="Výchozí náklad hodiny (Kč)"
        hint="Použije se, když zaměstnanec nemá vlastní náklad v kartě zaměstnance."
        htmlFor="ds-cost"
      >
        <Input
          id="ds-cost"
          inputMode="decimal"
          className="w-32"
          value={String(s.defaultHourlyCostMinor / 100).replace(".", ",")}
          onChange={(e) =>
            setS({
              ...s,
              defaultHourlyCostMinor: Math.round(
                (Number(e.target.value.replace(",", ".")) || 0) * 100,
              ),
            })
          }
        />
      </Field>
      <label className="flex cursor-pointer items-center gap-2">
        <Checkbox
          checked={s.requireApproval}
          onCheckedChange={(v) => setS({ ...s, requireApproval: !!v })}
        />{" "}
        Docházku schvaluje vedoucí (jinak se schvaluje sama)
      </label>
      <label className="flex cursor-pointer items-center gap-2">
        <Checkbox checked={s.reminder} onCheckedChange={(v) => setS({ ...s, reminder: !!v })} />{" "}
        Večerní připomínka, když někdo nezapsal docházku
      </label>
      <Err error={save.error as Error | null} />
      <Button type="submit" variant="primary" loading={save.isPending}>
        Uložit
      </Button>
    </form>
  );
}

/* ---------- stránka ---------- */

function DochazkaPage({ rest, query }: { rest: string[]; query: Record<string, string> }) {
  const { Link } = useNav();
  const can = useCan();
  const section = rest[0] ?? "tyden";
  const items = [
    {
      key: "tyden",
      href: "/dochazka",
      label: "Můj týden",
      show: can("dochazka.own") || can("dochazka.approve"),
    },
    {
      key: "schvalovani",
      href: "/dochazka/schvalovani",
      label: "Ke schválení",
      show: can("dochazka.approve"),
    },
    {
      key: "prehled",
      href: "/dochazka/prehled",
      label: "Měsíční přehled",
      show: can(["dochazka.read", "dochazka.approve"]),
    },
    {
      key: "zaznamy",
      href: "/dochazka/zaznamy",
      label: "Všechny záznamy",
      show: can("dochazka.read"),
    },
    {
      key: "nastaveni",
      href: "/dochazka/nastaveni",
      label: "Nastavení",
      show: can("settings.manage"),
    },
  ].filter((i) => i.show);
  return (
    <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
      <nav
        aria-label="Oddíly docházky"
        className="flex gap-1 overflow-x-auto border-b border-line px-1 pt-2 md:px-3"
      >
        {items.map((i) => (
          <Link
            key={i.key}
            href={i.href}
            aria-current={section === i.key ? "page" : undefined}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 font-medium",
              section === i.key
                ? "border-accent text-fg"
                : "border-transparent text-muted hover:text-fg",
            )}
          >
            {i.label}
          </Link>
        ))}
      </nav>
      <div className="space-y-4 p-4 md:p-6">
        {section === "tyden" && (
          <>
            <ClockCard />
            <WeekView initialWeek={query.tyden ?? todayIso()} />
          </>
        )}
        {section === "schvalovani" && <Approvals />}
        {section === "prehled" && <MonthReport />}
        {section === "nastaveni" && <SettingsView />}
      </div>
    </div>
  );
}

export const ui = defineModuleUi({
  terminalWidgets: { "dochazka.clock": { Widget: ClockTerminalWidget } },
  pages: [
    { path: "/dochazka", render: ({ rest, query }) => <DochazkaPage rest={rest} query={query} /> },
  ],
});
