"use client";

import {
  Button,
  Checkbox,
  DatePicker,
  Dialog,
  DialogContent,
  Field,
  Input,
  Notice,
  Skeleton,
  errorToast,
  successToast,
  useCommandMutation,
  useEntityApi,
} from "@rebar/ui";
import { useState, type ReactNode } from "react";
import type {
  CompletePreview,
  CompleteResult,
  JobDetail,
  PhaseChangeResult,
  PhasePreview,
  PhaseView,
} from "../contract";
import { COMPLETE_REASON_LABELS, todayPrague, type CompleteReason } from "../shared";
import { useCompletePreview } from "./hooks";
import { completeWarnings, phaseChangeMessage, planPhaseChange, plural } from "./logic";
import { LoadError } from "./parts";

/*
  Postupy, které potřebuje víc míst najednou: změna fáze s dotazem na otevřené úkoly (pás fází v hlavičce, board podle fází,
  tlačítko Dokončit fázi) a dokončení zakázky s upozorněním (hlavička, akce, board).
*/

type AskState = {
  jobId: string;
  /** Cílová fáze, kterou po potvrzení nastavit; u „Dokončit fázi“ je to dokončovaná fáze. */
  phaseId: string;
  targetName: string;
  mode: "set" | "complete";
  phases: { id: string; name: string; openTasks: number }[];
  totalOpenTasks: number;
};

/**
 * Změna fáze zakázky. `request` zjistí na serveru, co se změnou dokončí, a když jsou v dokončovaných fázích otevřené
 * úkoly, zeptá se, zda je dokončit také (ZAK-08, R-38). `completeCurrent` dokončí aktuální fázi a posune zakázku dál.
 * `dialog` je třeba vykreslit někde v komponentě.
 */
export function usePhaseFlow() {
  const api = useEntityApi();
  const [ask, setAsk] = useState<AskState | null>(null);
  const [busy, setBusy] = useState(false);
  const setPhase = useCommandMutation<
    { jobId: string; phaseId: string; completeOpenTasks: boolean },
    PhaseChangeResult
  >("zakazky.setPhase");
  const complete = useCommandMutation<
    { jobId: string; phaseId: string; completeOpenTasks: boolean },
    PhaseChangeResult
  >("zakazky.phase.complete");

  async function apply(
    mode: "set" | "complete",
    jobId: string,
    phaseId: string,
    name: string,
    completeOpenTasks: boolean,
  ) {
    const m = mode === "set" ? setPhase : complete;
    const r = await m.mutateAsync({ jobId, phaseId, completeOpenTasks });
    successToast(
      mode === "set"
        ? phaseChangeMessage(name, r)
        : `Fáze „${name}“ je dokončená.${r.completedTasks ? ` Dokončeno: ${plural(r.completedTasks, "úkol", "úkoly", "úkolů")}.` : ""}`,
    );
  }

  async function request(jobId: string, target: { phaseId: string } | { phaseName: string }) {
    setBusy(true);
    try {
      let phaseId = "phaseId" in target ? target.phaseId : "";
      if (!phaseId) {
        const name = (target as { phaseName: string }).phaseName;
        const detail = await api.command<{ jobId: string }, JobDetail>("zakazky.detail", { jobId });
        const hit = detail.phases.find((p) => p.name === name);
        if (!hit) throw new Error(`Zakázka nemá fázi „${name}“.`);
        phaseId = hit.id;
      }
      const preview = await api.command<{ jobId: string; phaseId: string }, PhasePreview>(
        "zakazky.phase.preview",
        { jobId, phaseId },
      );
      const plan = planPhaseChange(preview);
      if (plan.kind === "blocked") return errorToast(plan.reason);
      if (plan.kind === "direct")
        return await apply("set", jobId, phaseId, preview.target.name, false);
      setAsk({
        jobId,
        phaseId,
        targetName: preview.target.name,
        mode: "set",
        phases: plan.phases,
        totalOpenTasks: plan.totalOpenTasks,
      });
    } catch (e) {
      errorToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function completeCurrent(jobId: string, phase: PhaseView) {
    if ((phase.openTasks ?? 0) > 0) {
      setAsk({
        jobId,
        phaseId: phase.id,
        targetName: phase.name,
        mode: "complete",
        phases: [{ id: phase.id, name: phase.name, openTasks: phase.openTasks ?? 0 }],
        totalOpenTasks: phase.openTasks ?? 0,
      });
      return;
    }
    setBusy(true);
    try {
      await apply("complete", jobId, phase.id, phase.name, false);
    } catch (e) {
      errorToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function answer(completeOpenTasks: boolean) {
    if (!ask) return;
    const a = ask;
    setBusy(true);
    try {
      await apply(a.mode, a.jobId, a.phaseId, a.targetName, completeOpenTasks);
      setAsk(null);
    } catch (e) {
      errorToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const dialog: ReactNode = (
    <Dialog open={!!ask} onOpenChange={(o) => !o && !busy && setAsk(null)}>
      {ask && (
        <DialogContent
          title={
            ask.mode === "complete" ? "Dokončit fázi" : `Přesunout do fáze „${ask.targetName}“`
          }
          description="Dokončovaná fáze má otevřené úkoly."
          className="top-[18vh] w-[min(30rem,calc(100vw-2rem))]"
          data-testid="phase-tasks-dialog"
        >
          <div className="space-y-3 px-5 py-4">
            <p>
              {ask.phases.length === 1
                ? `Fáze „${ask.phases[0]!.name}“ má ${plural(ask.phases[0]!.openTasks, "otevřený úkol", "otevřené úkoly", "otevřených úkolů")}.`
                : `Dokončované fáze mají dohromady ${plural(ask.totalOpenTasks, "otevřený úkol", "otevřené úkoly", "otevřených úkolů")}.`}{" "}
              Dokončit je také?
            </p>
            {ask.phases.length > 1 && (
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted">
                {ask.phases.map((p) => (
                  <li key={p.id}>
                    {p.name}: {plural(p.openTasks, "úkol", "úkoly", "úkolů")}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-2 px-5 py-4">
            <Button variant="ghost" disabled={busy} onClick={() => setAsk(null)}>
              Zrušit
            </Button>
            <Button disabled={busy} onClick={() => void answer(false)}>
              Dokončit jen fázi
            </Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={() => void answer(true)}
              data-testid="phase-complete-tasks"
            >
              Dokončit i úkoly ({ask.totalOpenTasks})
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );

  return { request, completeCurrent, dialog, busy };
}

/** Tlačítka a text, co zakázka potřebuje při dokončení podle důvodu. */
const COMPLETE_TEXT: Record<
  CompleteReason,
  { title: string; confirm: string; danger: boolean; done: string }
> = {
  finished: {
    title: "Dokončit zakázku",
    confirm: "Dokončit zakázku",
    danger: false,
    done: "Zakázka je dokončená.",
  },
  retainer_ended: {
    title: "Ukončit retainer a dokončit zakázku",
    confirm: "Ukončit a dokončit",
    danger: false,
    done: "Zakázka je ukončená.",
  },
  cancelled: {
    title: "Zrušit zakázku",
    confirm: "Zrušit zakázku",
    danger: true,
    done: "Zakázka je zrušená.",
  },
};

/** Název okna dokončení podle důvodu (pro `DialogContent`). */
export function completeTitle(reason: CompleteReason): string {
  return COMPLETE_TEXT[reason].title;
}

/**
 * Obsah okna dokončení nebo zrušení zakázky: upozornění na otevřené úkoly a neuhrazené platby (nezablokuje, ZAK-18)
 * a nabídka stavu Bývalý pro klienta, který nemá jinou živou zakázku (ZAK-16).
 */
export function CompleteForm({
  jobId,
  reason,
  onDone,
  onCancel,
}: {
  jobId: string;
  reason: CompleteReason;
  onDone: (r: CompleteResult) => void;
  onCancel: () => void;
}) {
  const preview = useCompletePreview(jobId, true);
  const [former, setFormer] = useState(false);
  const [formerReason, setFormerReason] = useState("");
  const [endedOn, setEndedOn] = useState<string | null>(todayPrague());
  const [error, setError] = useState<string | null>(null);
  const complete = useCommandMutation<{ jobId: string; reason: CompleteReason }, CompleteResult>(
    "zakazky.complete",
  );
  const setFormerClient = useCommandMutation<{ jobId: string; reason?: string; endedOn?: string }>(
    "zakazky.client.setFormer",
  );
  const text = COMPLETE_TEXT[reason];
  const p: CompletePreview | undefined = preview.data;
  const offerFormer = !!p && !p.clientHasOtherActiveJob;
  const warnings = p ? completeWarnings(p) : [];
  const busy = complete.isPending || setFormerClient.isPending;
  const missingReason = former && !formerReason.trim();

  async function submit() {
    setError(null);
    try {
      const result = await complete.mutateAsync({ jobId, reason });
      if (former && offerFormer)
        await setFormerClient.mutateAsync({
          jobId,
          reason: formerReason.trim(),
          ...(endedOn ? { endedOn } : {}),
        });
      successToast(text.done);
      onDone(result);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div data-testid="complete-form">
      <div className="space-y-3 px-5 py-4">
        {preview.isLoading ? (
          <Skeleton className="h-16" />
        ) : preview.error ? (
          <LoadError message={preview.error.message} onRetry={() => void preview.refetch()} />
        ) : (
          <>
            {warnings.length > 0 ? (
              <Notice tone="warning" title="Pozor, zakázka není úplně uzavřená">
                <ul className="list-disc space-y-0.5 pl-4">
                  {warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
                <p className="mt-1">Dokončení to nezablokuje, jen na to upozorňujeme.</p>
              </Notice>
            ) : (
              <p className="text-muted">Zakázka nemá otevřené úkoly ani neuhrazené platby.</p>
            )}
            {offerFormer && (
              <div className="space-y-2 rounded-lg border border-line p-3">
                <label className="flex items-start gap-2">
                  <Checkbox
                    checked={former}
                    onCheckedChange={(v) => setFormer(v === true)}
                    aria-label="Nastavit klienta jako bývalého"
                    data-testid="complete-former"
                  />
                  <span>
                    Nastavit klienta {p.clientName ? <strong>{p.clientName}</strong> : ""} jako
                    bývalého
                    <span className="block text-sm text-muted">
                      Klient nemá žádnou další živou zakázku.
                    </span>
                  </span>
                </label>
                {former && (
                  <div className="grid gap-x-3 sm:grid-cols-[1fr_11rem]">
                    <Field label="Důvod ukončení spolupráce">
                      <Input
                        value={formerReason}
                        onChange={(e) => setFormerReason(e.target.value)}
                        placeholder="Např. projekt dokončen, klient nemá další potřebu"
                      />
                    </Field>
                    <Field label="Ke dni">
                      <DatePicker value={endedOn} onChange={setEndedOn} clearable={false} />
                    </Field>
                  </div>
                )}
              </div>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
      <div className="flex justify-end gap-2 px-5 py-4">
        <Button variant="ghost" disabled={busy} onClick={onCancel}>
          Zpět
        </Button>
        <Button
          variant={text.danger ? "danger" : "primary"}
          loading={busy}
          disabled={!p || missingReason}
          onClick={() => void submit()}
          data-testid="complete-confirm"
        >
          {text.confirm}
        </Button>
      </div>
    </div>
  );
}

/** Okno dokončení nebo zrušení zakázky (obal kolem `CompleteForm`). */
export function CompleteDialog({
  jobId,
  reason,
  open,
  onOpenChange,
  onDone,
}: {
  jobId: string;
  reason: CompleteReason;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: (r: CompleteResult) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent
          title={completeTitle(reason)}
          description={COMPLETE_REASON_LABELS[reason]}
          className="top-[14vh] w-[min(34rem,calc(100vw-2rem))]"
        >
          <CompleteForm
            jobId={jobId}
            reason={reason}
            onCancel={() => onOpenChange(false)}
            onDone={(r) => {
              onOpenChange(false);
              onDone?.(r);
            }}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}
