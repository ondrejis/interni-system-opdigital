"use client";

import {
  Button,
  Dialog,
  DialogContent,
  Field,
  Input,
  Textarea,
  successToast,
  useCommandMutation,
} from "@rebar/ui";
import { useState } from "react";
import type { EntryDto, JobRef, SaveInput, SaveOutput } from "../contract";
import { formatDuration, parseDuration } from "../logic/parse-time";
import { todayIso } from "@rebar/core/time";
import { Err, JobPicker } from "./shared";

/** Údaje, ze kterých dialog vychází: zakázka, úkol, záznam k úpravě, výchozí den. */
export type LogTimeTarget = {
  job?: Pick<JobRef, "id" | "title" | "number"> | null;
  taskId?: string | null;
  taskTitle?: string | null;
  entry?: EntryDto | undefined;
  date?: string | undefined;
};

/**
 * Formulář „Zapsat čas“ (HOD-01): zakázka (nebo úkol), den, čas ve tvaru `1,5` / `1:30` / `90m` s okamžitým náhledem
 * a poznámka. Použije ho dialog týdenního výkazu, záložka zakázky, akce v hlavičce zakázky i dialog úkolu.
 */
export function LogTimeForm({
  target,
  onDone,
  onCancel,
}: {
  target: LogTimeTarget;
  onDone: (saved?: SaveOutput) => void;
  onCancel?: () => void;
}) {
  const { entry } = target;
  const [job, setJob] = useState<{ id: string; label: string } | null>(
    target.job
      ? {
          id: target.job.id,
          label: target.job.number
            ? `${target.job.number} · ${target.job.title}`
            : target.job.title,
        }
      : null,
  );
  const [date, setDate] = useState(entry?.date ?? target.date ?? todayIso());
  const [time, setTime] = useState(entry ? formatDuration(entry.minutes) : "");
  const [note, setNote] = useState(entry?.note ?? "");
  const taskId = target.taskId ?? entry?.taskId ?? null;
  const lockedJob = !!taskId || !!entry || !!target.job;

  const save = useCommandMutation<SaveInput, SaveOutput>("hodiny.save", {
    onSuccess: (out) => {
      successToast(entry ? "Záznam uložen." : "Čas zapsán.");
      onDone(out);
    },
  });
  const del = useCommandMutation<{ id: string }>("hodiny.delete", {
    onSuccess: () => {
      successToast("Záznam smazán.");
      onDone();
    },
  });
  const parsed = time.trim() ? parseDuration(time) : null;
  const canSave = !!parsed?.ok && parsed.minutes > 0 && (!!job || !!taskId) && !!date;

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSave) return;
        save.mutate({
          ...(entry ? { id: entry.id } : {}),
          ...(taskId ? { taskId } : {}),
          ...(job && !taskId ? { jobId: job.id } : {}),
          date,
          time,
          note: note.trim() || null,
        });
      }}
    >
      <Field label="Zakázka">
        {lockedJob ? (
          <p className="py-1.5" data-testid="log-job">
            {job?.label ?? "Zakázka úkolu"}
          </p>
        ) : (
          <JobPicker
            value={job?.id ?? null}
            label={job?.label}
            onChange={(j) => setJob(j ? { id: j.id, label: j.title } : null)}
          />
        )}
      </Field>
      {target.taskTitle && (
        <Field label="Úkol">
          <p className="py-1.5">{target.taskTitle}</p>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Den" htmlFor="log-date">
          <Input id="log-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field
          label="Čas"
          htmlFor="log-time"
          error={parsed && !parsed.ok ? parsed.error : undefined}
          hint={parsed?.ok ? `= ${formatDuration(parsed.minutes)} h` : "např. 1,5 nebo 1:30"}
        >
          <Input
            id="log-time"
            inputMode="text"
            autoComplete="off"
            placeholder="1,5"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            autoFocus
          />
        </Field>
      </div>
      <Field label="Poznámka" htmlFor="log-note">
        <Textarea
          id="log-note"
          rows={2}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <Err error={(save.error as Error | null) ?? (del.error as Error | null)} />
      <div className="flex items-center justify-between gap-2">
        {entry ? (
          <Button
            type="button"
            variant="ghost"
            loading={del.isPending}
            onClick={() => del.mutate({ id: entry.id })}
          >
            Smazat
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Zrušit
            </Button>
          )}
          <Button type="submit" variant="primary" disabled={!canSave} loading={save.isPending}>
            Uložit
          </Button>
        </div>
      </div>
    </form>
  );
}

/** Dialog „Zapsat čas“ kolem `LogTimeForm`. */
export function LogTimeDialog({
  open,
  onOpenChange,
  target,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: LogTimeTarget;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={target.entry ? "Upravit záznam" : "Zapsat čas"}>
        <div className="p-4">
          <LogTimeForm
            target={target}
            onDone={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
