"use client";

/*
  Dokončení úkolu (UKO-07): po hotovém hovoru či schůzce systém jen NABÍDNE zapsat výsledek a naplánovat další aktivitu,
  nic sám nevytváří. Ostatní úkoly se jen odškrtnou (s „Zpět“).
*/
import {
  Button,
  Dialog,
  DialogContent,
  Field,
  Kbd,
  Skeleton,
  Textarea,
  modKey,
  successToast,
  undoToast,
  useEntityApi,
} from "@rebar/ui";
import { useState } from "react";
import type { NextTaskSuggestion, TaskDto } from "../contract";
import {
  ActivityForm,
  submitOnModEnter,
  toCreateInput,
  valuesFromSuggestion,
  type ActivityValues,
} from "./activity-form";
import { guard, useTaskActions, useTaskTypes } from "./shared";

type Prompt = { task: TaskDto; askOutcome: boolean; next: NextTaskSuggestion | null };

/** Dialog „Hotovo“: výsledek (hovor, schůzka) a předvyplněná další aktivita; „Přeskočit“ nic nevytvoří. */
export function CompletePromptDialog({ prompt, onClose }: { prompt: Prompt; onClose: () => void }) {
  const api = useEntityApi();
  const types = useTaskTypes();
  const actions = useTaskActions();
  const { task, next } = prompt;
  const [outcome, setOutcome] = useState(task.outcome ?? "");
  const [values, setValues] = useState<ActivityValues | null>(() =>
    next
      ? valuesFromSuggestion(next, next.assigneeId === api.me.id ? api.me.name : task.assigneeName)
      : null,
  );
  const busy = actions.update.isPending || actions.create.isPending;

  async function saveOutcome(): Promise<boolean> {
    const text = outcome.trim();
    if (!prompt.askOutcome || text === (task.outcome ?? "")) return true;
    return !!(await guard(actions.update.mutateAsync({ id: task.id, outcome: text || null })));
  }

  async function plan() {
    if (busy || !values || !types.data || !next) return;
    if (!(await saveOutcome())) return;
    const input = toCreateInput(values, types.data, next);
    if (await guard(actions.create.mutateAsync(input), "Další aktivita je naplánovaná.")) onClose();
  }

  async function skip() {
    if (busy) return;
    if (await saveOutcome()) {
      if (prompt.askOutcome && outcome.trim()) successToast("Výsledek je uložený.");
      onClose();
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && void skip()}>
      <DialogContent
        title={`Hotovo: ${task.title}`}
        description="Zapište výsledek a naplánujte další krok. Nic se nevytvoří, dokud to nepotvrdíte."
      >
        <form
          className="px-5 py-4"
          data-testid="complete-prompt"
          onSubmit={(e) => {
            e.preventDefault();
            void (values ? plan() : skip());
          }}
          onKeyDown={submitOnModEnter(() => void (values ? plan() : skip()))}
        >
          {prompt.askOutcome && (
            <Field label="Výsledek (nepovinné)" htmlFor="complete-outcome">
              <Textarea
                id="complete-outcome"
                rows={2}
                maxLength={5000}
                autoFocus
                value={outcome}
                placeholder="Co z toho vzešlo? Např. dovolal jsem se, pošle podklady."
                onChange={(e) => setOutcome(e.target.value)}
              />
            </Field>
          )}
          {values &&
            (types.data ? (
              <>
                <p className="mb-2 text-sm font-medium text-muted">Další aktivita</p>
                <ActivityForm
                  idPrefix="next"
                  values={values}
                  onChange={setValues}
                  types={types.data}
                  compact
                />
              </>
            ) : (
              <Skeleton className="h-40" />
            ))}
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
            <span className="hidden items-center gap-1 text-sm text-faint sm:flex">
              <Kbd>{modKey()}</Kbd>
              <Kbd>Enter</Kbd> potvrdí
            </span>
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="ghost" onClick={() => void skip()} disabled={busy}>
                Přeskočit
              </Button>
              {values ? (
                <Button type="submit" variant="primary" loading={busy} disabled={!types.data}>
                  Naplánovat další
                </Button>
              ) : (
                <Button type="submit" variant="primary" loading={busy}>
                  Uložit výsledek
                </Button>
              )}
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Odškrtnutí a znovuotevření úkolu. `dialog` vykreslí volající jednou na úrovni stránky (ne uvnitř popoveru, který se
 * po kliknutí zavírá).
 */
export function useCompleteFlow() {
  const actions = useTaskActions();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<Prompt | null>(null);

  async function complete(t: TaskDto) {
    if (busyId) return;
    setBusyId(t.id);
    try {
      const r = await guard(actions.complete.mutateAsync({ id: t.id }));
      if (!r) return;
      if (r.offer.outcome || r.offer.next)
        setPrompt({ task: r.task, askOutcome: r.offer.outcome, next: r.offer.next });
      else
        undoToast(`Hotovo: ${t.title}`, async () => {
          await guard(actions.setStatus.mutateAsync({ id: t.id, status: "todo" }));
        });
    } finally {
      setBusyId(null);
    }
  }

  async function reopen(t: TaskDto) {
    await guard(
      actions.setStatus.mutateAsync({ id: t.id, status: "todo" }),
      "Úkol je znovu otevřený.",
    );
  }

  const dialog = prompt ? (
    <CompletePromptDialog key={prompt.task.id} prompt={prompt} onClose={() => setPrompt(null)} />
  ) : null;
  return { complete, reopen, busyId, dialog };
}

/** Kolečko k odškrtnutí (na dotyku 44 px); hotový úkol je vyplněný a klik ho znovu otevře. */
export function CompleteCircle({
  task,
  busy,
  onComplete,
  onReopen,
}: {
  task: Pick<TaskDto, "id" | "title" | "status">;
  busy?: boolean;
  onComplete: () => void;
  onReopen?: () => void;
}) {
  const done = task.status === "done";
  const closed = done || task.status === "canceled";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={closed ? `Znovu otevřít: ${task.title}` : `Označit jako hotové: ${task.title}`}
      title={closed ? "Znovu otevřít" : "Označit jako hotové"}
      data-testid="task-complete"
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation();
        if (closed) onReopen?.();
        else onComplete();
      }}
      className="group/check -m-1 flex size-7 shrink-0 items-center justify-center rounded-full pointer-coarse:size-11"
    >
      <span
        className={
          "flex size-[18px] items-center justify-center rounded-full border-2 transition-colors " +
          (done
            ? "border-success bg-success text-bg"
            : task.status === "canceled"
              ? "border-faint bg-hover text-faint"
              : "border-line-strong text-transparent group-hover/check:border-success group-hover/check:text-success") +
          (busy ? " animate-pulse" : "")
        }
      >
        <svg
          viewBox="0 0 12 12"
          className="size-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <path d="M2.5 6.5l2.5 2.5 4.5-5" />
        </svg>
      </span>
    </button>
  );
}
