"use client";

import {
  Avatar,
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Field,
  Icon,
  IconButton,
  Kbd,
  Skeleton,
  Textarea,
  cn,
  errorToast,
  modKey,
  successToast,
  useCommandMutation,
  useEntityApi,
} from "@rebar/ui";
import { useState } from "react";
import {
  ActivityForm,
  submitOnModEnter,
  toDraft,
  valuesFromActivity,
  valuesFromSuggestion,
  type FormValues,
} from "./activity-form";
import { daysToNextMonday, suggestNextDue } from "./logic";
import {
  DueText,
  TypeIcon,
  activityMeta,
  useActivityTypes,
  type ActivityTarget,
} from "./ui-shared";
import type {
  ActivityDraft,
  ActivityDto,
  ActivityPriority,
  CompleteResult,
  NextActivitySuggestion,
} from "./types";

const targetOf = (a: {
  jobId: string | null;
  companyId: string | null;
  personId: string | null;
}): ActivityTarget => ({
  ...(a.jobId ? { jobId: a.jobId } : {}),
  ...(a.companyId ? { companyId: a.companyId } : {}),
  ...(a.personId ? { personId: a.personId } : {}),
});

/** Návrh navazující aktivity spočtený v prohlížeči (stejný typ a vazby, nejbližší pracovní den). */
export function suggestionFromActivity(a: ActivityDto): NextActivitySuggestion {
  return {
    typeId: a.typeId,
    typeKey: a.typeKey,
    subject: a.subject,
    dueAt: suggestNextDue(a).toISOString(),
    allDay: a.allDay,
    durationMin: a.durationMin,
    priority: a.priority,
    location: a.location,
    assigneeId: a.assigneeId,
    jobId: a.jobId,
    companyId: a.companyId,
    personId: a.personId,
  };
}

/**
 * Dialog po dokončení aktivity (nebo „Naplánovat navazující“): volitelný výsledek a formulář další aktivity předvyplněný
 * návrhem (stejný typ, nejbližší pracovní den). `Cmd+Enter` naplánuje, „Přeskočit“ jen zavře (výsledek se uloží).
 */
export function NextActivityDialog({
  previous,
  suggestion,
  mode,
  onClose,
  onPlanned,
}: {
  previous: ActivityDto;
  suggestion: NextActivitySuggestion;
  /** `done` = právě dokončeno (nabídne výsledek), `followUp` = jen navazující aktivita. */
  mode: "done" | "followUp";
  onClose: () => void;
  onPlanned?: (a: ActivityDto) => void;
}) {
  const api = useEntityApi();
  const types = useActivityTypes();
  const create = useCommandMutation<ActivityDraft, ActivityDto>("crm.activity.create");
  const update = useCommandMutation<{ id: string; outcome: string | null }, ActivityDto>(
    "crm.activity.update",
  );
  const [outcome, setOutcome] = useState(previous.outcome ?? "");
  const [values, setValues] = useState<FormValues>(() =>
    valuesFromSuggestion(
      suggestion,
      suggestion.assigneeId === api.me.id ? api.me.name : previous.assigneeName,
    ),
  );
  const busy = create.isPending || update.isPending;

  async function saveOutcome() {
    const text = outcome.trim();
    if (mode === "done" && text !== (previous.outcome ?? ""))
      await update.mutateAsync({ id: previous.id, outcome: text || null });
  }

  async function plan() {
    if (!types.data || busy) return;
    try {
      await saveOutcome();
      const next = await create.mutateAsync(toDraft(values, types.data, targetOf(suggestion)));
      successToast("Další aktivita je naplánovaná.");
      onPlanned?.(next);
      onClose();
    } catch (e) {
      errorToast((e as Error).message);
    }
  }

  async function skip() {
    try {
      await saveOutcome();
      onClose();
    } catch (e) {
      errorToast((e as Error).message);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && void skip()}>
      <DialogContent
        title={mode === "done" ? `Hotovo: ${previous.subject}` : "Navazující aktivita"}
        description={
          mode === "done"
            ? "Naplánujte další krok, ať obchod nezůstane bez aktivity."
            : "Další krok navazující na tuto aktivitu."
        }
      >
        <form
          className="px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            void plan();
          }}
          onKeyDown={submitOnModEnter(() => void plan())}
        >
          {mode === "done" && (
            <Field label="Výsledek (nepovinné)" htmlFor="next-outcome">
              <Textarea
                id="next-outcome"
                rows={2}
                maxLength={2000}
                value={outcome}
                placeholder="Co z aktivity vzešlo? Např. dovolal jsem se, pošle podklady."
                onChange={(e) => setOutcome(e.target.value)}
              />
            </Field>
          )}
          {types.data ? (
            <ActivityForm
              idPrefix="next"
              values={values}
              onChange={setValues}
              types={types.data}
              autoFocus
              selectSubject
            />
          ) : (
            <Skeleton className="h-40" />
          )}
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
            <span className="hidden items-center gap-1 text-sm text-faint sm:flex">
              <Kbd>{modKey()}</Kbd>
              <Kbd>Enter</Kbd> naplánuje
            </span>
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="ghost" onClick={() => void skip()} disabled={busy}>
                {mode === "done" ? "Přeskočit" : "Zrušit"}
              </Button>
              <Button type="submit" variant="primary" loading={busy} disabled={!types.data}>
                Naplánovat další
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Úprava existující aktivity v dialogu. */
export function ActivityEditDialog({
  activity,
  onClose,
}: {
  activity: ActivityDto;
  onClose: () => void;
}) {
  const types = useActivityTypes();
  const update = useCommandMutation<Record<string, unknown>, ActivityDto>("crm.activity.update");
  const [values, setValues] = useState<FormValues>(() => valuesFromActivity(activity));

  async function save() {
    if (!types.data || update.isPending) return;
    const d = toDraft(values, types.data, targetOf(activity));
    try {
      await update.mutateAsync({
        id: activity.id,
        typeKey: d.typeKey,
        subject: d.subject,
        dueAt: d.dueAt ?? null,
        allDay: d.allDay ?? false,
        durationMin: d.durationMin ?? null,
        priority: d.priority,
        location: d.location,
        note: d.note,
        assigneeId: d.assigneeId ?? null,
      });
      successToast("Aktivita je uložená.");
      onClose();
    } catch (e) {
      errorToast((e as Error).message);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !update.isPending && onClose()}>
      <DialogContent title="Upravit aktivitu">
        <form
          className="px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          onKeyDown={submitOnModEnter(() => void save())}
        >
          {types.data ? (
            <ActivityForm
              idPrefix="edit"
              values={values}
              onChange={setValues}
              types={types.data}
              autoFocus
            />
          ) : (
            <Skeleton className="h-40" />
          )}
          <div className="mt-3 flex items-center justify-end gap-2 border-t border-line pt-3">
            <Button type="button" variant="ghost" onClick={onClose} disabled={update.isPending}>
              Zrušit
            </Button>
            <Button type="submit" variant="primary" loading={update.isPending}>
              Uložit
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Dokončení aktivity jedním klikem: označí ji jako hotovou a hned nabídne naplánování další (`dialog` vykreslí volající
 * jednou na úrovni komponenty, ne uvnitř popoveru, který se po kliknutí zavírá).
 */
export function useCompleteActivity() {
  const complete = useCommandMutation<{ id: string }, CompleteResult>("crm.activity.complete");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<{
    activity: ActivityDto;
    suggestion: NextActivitySuggestion;
  } | null>(null);

  async function run(a: ActivityDto) {
    if (busyId) return;
    setBusyId(a.id);
    try {
      const r = await complete.mutateAsync({ id: a.id });
      setPrompt({ activity: r.activity, suggestion: r.suggestion });
    } catch (e) {
      errorToast((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  const dialog = prompt ? (
    <NextActivityDialog
      key={prompt.activity.id}
      mode="done"
      previous={prompt.activity}
      suggestion={prompt.suggestion}
      onClose={() => setPrompt(null)}
    />
  ) : null;
  return { complete: run, busyId, dialog };
}

/** Kolečko pro odškrtnutí (dotykem 44 px): hotová aktivita je vyplněná, klik ji znovu otevře. */
export function CompleteCircle({
  activity,
  busy,
  onComplete,
  onReopen,
}: {
  activity: ActivityDto;
  busy?: boolean;
  onComplete: (a: ActivityDto) => void;
  onReopen?: (a: ActivityDto) => void;
}) {
  const done = activity.state === "done";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={
        done ? `Znovu otevřít: ${activity.subject}` : `Označit jako hotové: ${activity.subject}`
      }
      title={done ? "Znovu otevřít" : "Označit jako hotové"}
      disabled={busy || (done && !onReopen)}
      onClick={() => (done ? onReopen?.(activity) : onComplete(activity))}
      className="group/check -m-1 flex size-7 shrink-0 items-center justify-center rounded-full pointer-coarse:size-11"
    >
      <span
        className={cn(
          "flex size-[18px] items-center justify-center rounded-full border-2 transition-colors",
          done
            ? "border-success bg-success text-bg"
            : "border-line-strong text-transparent group-hover/check:border-success group-hover/check:text-success",
          busy && "animate-pulse",
        )}
      >
        <Icon name="check" className="size-3" />
      </span>
    </button>
  );
}

/** Nabídka odložení: o den, na pondělí, o týden (relativně k dnešku, hodina zůstává). */
const SNOOZE = [
  { label: "Odložit na zítra", days: () => 1 },
  { label: "Odložit na příští pondělí", days: () => daysToNextMonday() },
  { label: "Odložit o týden", days: () => 7 },
];

/**
 * Nabídka akcí u řádku aktivity: úprava, navazující aktivita, odložení, znovuotevření a smazání. Dialogy vlastní tato
 * komponenta; v popoveru (`compact`) jsou jen akce bez dialogů, aby je zavření popoveru neodneslo.
 */
export function ActivityRowMenu({
  activity,
  compact,
}: {
  activity: ActivityDto;
  compact?: boolean;
}) {
  const snooze = useCommandMutation<{ id: string; days: number }, ActivityDto>(
    "crm.activity.snooze",
  );
  const reopen = useCommandMutation<{ id: string }, ActivityDto>("crm.activity.reopen");
  const remove = useCommandMutation<{ id: string }, { id: string }>("crm.activity.delete");
  const [dialog, setDialog] = useState<"edit" | "next" | "delete" | null>(null);
  const done = activity.state === "done";

  async function guard<T>(p: Promise<T>, ok: string) {
    try {
      await p;
      successToast(ok);
    } catch (e) {
      errorToast((e as Error).message);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton label={`Další akce: ${activity.subject}`} size="sm" className="shrink-0">
            <Icon name="more" />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!compact && (
            <DropdownMenuItem onSelect={() => setDialog("edit")}>
              <Icon name="pencil" /> Upravit…
            </DropdownMenuItem>
          )}
          {!compact && (
            <DropdownMenuItem onSelect={() => setDialog("next")}>
              <Icon name="calendar-plus" /> Naplánovat navazující…
            </DropdownMenuItem>
          )}
          {!done &&
            SNOOZE.map((s) => (
              <DropdownMenuItem
                key={s.label}
                onSelect={() =>
                  void guard(
                    snooze.mutateAsync({ id: activity.id, days: s.days() }),
                    "Aktivita je odložená.",
                  )
                }
              >
                <Icon name="alarm-clock" /> {s.label}
              </DropdownMenuItem>
            ))}
          {done && (
            <DropdownMenuItem
              onSelect={() =>
                void guard(reopen.mutateAsync({ id: activity.id }), "Aktivita je znovu otevřená.")
              }
            >
              <Icon name="rotate-ccw" /> Znovu otevřít
            </DropdownMenuItem>
          )}
          {!compact && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem danger onSelect={() => setDialog("delete")}>
                <Icon name="trash" /> Smazat…
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {dialog === "edit" && (
        <ActivityEditDialog activity={activity} onClose={() => setDialog(null)} />
      )}
      {dialog === "next" && (
        <NextActivityDialog
          mode="followUp"
          previous={activity}
          suggestion={suggestionFromActivity(activity)}
          onClose={() => setDialog(null)}
        />
      )}
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Smazat aktivitu?"
        description={`„${activity.subject}“ zmizí z kalendáře i z přehledů. Akci nejde vrátit.`}
        confirmLabel="Smazat"
        danger
        onConfirm={async () => {
          try {
            await remove.mutateAsync({ id: activity.id });
            successToast("Aktivita je smazaná.");
          } catch (e) {
            errorToast((e as Error).message);
            return false;
          }
        }}
      />
    </>
  );
}

/**
 * Řádek aktivity v „Dalších krocích“ a v popoveru na kartě: kolečko k odškrtnutí, typ, předmět, termín v barvě stavu,
 * přiřazený a nabídka akcí. `context` přidá zakázku a osobu (souhrnné zobrazení u firmy).
 */
export function ActivityLine({
  activity,
  onComplete,
  busy,
  context,
  compact,
}: {
  activity: ActivityDto;
  onComplete: (a: ActivityDto) => void;
  busy?: boolean;
  context?: boolean;
  compact?: boolean;
}) {
  const meta = activityMeta(activity, context ? { context: true } : {});
  return (
    <li
      className={cn(
        "flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-hover",
        activity.state === "overdue" && "bg-danger-soft/40",
      )}
    >
      <div className="pt-0.5">
        <CompleteCircle activity={activity} busy={busy ?? false} onComplete={onComplete} />
      </div>
      <TypeIcon icon={activity.typeIcon} className="mt-1" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-base font-medium" title={activity.subject}>
          {activity.subject}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 text-sm">
          <DueText activity={activity} />
          {activity.priority === "high" && <PriorityMark priority="high" />}
          {meta && <span className="min-w-0 truncate text-faint">{meta}</span>}
        </div>
      </div>
      {activity.assigneeName && (
        <span title={`Přiřazeno: ${activity.assigneeName}`} className="mt-0.5 shrink-0">
          <Avatar name={activity.assigneeName} size={20} />
        </span>
      )}
      <ActivityRowMenu activity={activity} {...(compact ? { compact } : {})} />
    </li>
  );
}

export function PriorityMark({ priority }: { priority: ActivityPriority }) {
  if (priority === "normal") return null;
  return (
    <span className="chip" data-color={priority === "high" ? "red" : "gray"}>
      {priority === "high" ? "Vysoká" : "Nízká"}
    </span>
  );
}
