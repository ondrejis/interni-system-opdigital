"use client";

import type { RecordRow } from "@rebar/core/shared";
import {
  Button,
  Chip,
  Combobox,
  Dialog,
  DialogContent,
  Field,
  Skeleton,
  successToast,
  useCommandMutation,
  useCommandQuery,
  type ModulePage,
  type RecordAction,
  type RecordTab,
} from "@rebar/ui";
import { useState } from "react";
import { PHASES, isPhaseKey, primaryActionFor, type PhaseKey } from "./phases";

/** UI oblasti „lifecycle“: dialog přechodu fáze, štítek fáze a hlavní tlačítko podle fáze. Klientský kód: žádné importy serverových částí. */

export type PhaseOption = {
  to: PhaseKey;
  label: string;
  allowed: boolean;
  problems: string[];
  needsReason: boolean;
};
export type PhasePreview = {
  phase: PhaseKey;
  pausedFrom: PhaseKey | null;
  options: PhaseOption[];
  lostReasons: { value: string; label: string }[];
};

/** Štítek fáze zakázky (barva a název z `PHASES`). */
export function PhaseChip({ phase }: { phase: unknown }) {
  if (!isPhaseKey(phase)) return null;
  return (
    <Chip color={PHASES[phase].color} dot>
      {PHASES[phase].label}
    </Chip>
  );
}

/** Dotaz na možné přechody zakázky (nesplněné kontroly); sdílí ho dialog, výběr fáze i tlačítko. */
export function usePhasePreview(jobId: string, enabled = true) {
  return useCommandQuery<PhasePreview, { jobId: string }>(
    "zakazky.phase.preview",
    { jobId },
    { enabled },
  );
}

/**
 * Dialog přechodu do fáze `to`: ukáže, co brání (nesplněné kontroly), u prohry vyžádá důvod a po potvrzení
 * zavolá `zakazky.transition`. Server stejné kontroly provede znovu, takže dialog je jen vysvětlení.
 */
export function TransitionDialog({
  jobId,
  to,
  open,
  onOpenChange,
  onDone,
}: {
  jobId: string;
  to: PhaseKey;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}) {
  const q = usePhasePreview(jobId, open);
  const [reason, setReason] = useState<string | null>(null);
  const option = q.data?.options.find((o) => o.to === to);
  const run = useCommandMutation<{ jobId: string; to: PhaseKey; reason?: string }>(
    "zakazky.transition",
    {
      onSuccess: () => {
        successToast(`Zakázka je ve fázi „${PHASES[to].label}“.`);
        setReason(null);
        onOpenChange(false);
        onDone?.();
      },
    },
  );
  const blocked = !option || !option.allowed || (option.needsReason && !reason);
  if (!open) return null; // zavřený dialog se nevykresluje a nic nenačítá (dotaz je vypnutý)
  const current = q.data?.phase && isPhaseKey(q.data.phase) ? q.data.phase : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !run.isPending && onOpenChange(o)}>
      <DialogContent
        title={`Přesunout do fáze „${PHASES[to].label}“`}
        description={PHASES[to].hint}
        className="top-[18vh] w-[min(30rem,calc(100vw-2rem))]"
      >
        <div className="space-y-3 px-5 py-4">
          {q.isLoading || (!q.data && !q.error) ? (
            <Skeleton className="h-16" />
          ) : q.error ? (
            <p role="alert" className="text-danger">
              {q.error.message}
            </p>
          ) : !option ? (
            <p role="alert" className="rounded-md bg-danger-soft p-3 text-danger">
              {current
                ? `Z fáze „${PHASES[current].label}“ nejde přejít do fáze „${PHASES[to].label}“.`
                : `Do fáze „${PHASES[to].label}“ nejde přejít.`}
            </p>
          ) : (
            <>
              {option.problems.length > 0 && (
                <div role="alert" className="rounded-md bg-warning-soft p-3 text-sm">
                  <p className="mb-1.5 font-medium">Než zakázku přesunete, doplňte:</p>
                  <ul className="list-disc space-y-0.5 pl-5">
                    {option.problems.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
              {option.needsReason && (
                <Field label="Důvod prohry">
                  <Combobox
                    aria-label="Důvod prohry"
                    options={q.data?.lostReasons ?? []}
                    value={reason}
                    onChange={(v) => setReason(v as string | null)}
                    placeholder="Vyberte důvod…"
                  />
                </Field>
              )}
              {option.allowed && !option.needsReason && (
                <p className="text-muted">
                  Všechny podmínky jsou splněné. Změna se zapíše do aktivity zakázky.
                </p>
              )}
            </>
          )}
          {run.error && (
            <p role="alert" className="text-sm text-danger">
              {run.error.message}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4">
          <Button variant="ghost" disabled={run.isPending} onClick={() => onOpenChange(false)}>
            Zrušit
          </Button>
          <Button
            variant={to === "lost" ? "danger" : "primary"}
            disabled={blocked}
            loading={run.isPending}
            onClick={() => run.mutate({ jobId, to, ...(reason ? { reason } : {}) })}
          >
            Přesunout
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Hlavní tlačítko zakázky podle fáze (Vytvořit nabídku, Zahájit realizaci, …; u pozastavené Obnovit zakázku).
 * Otevře dialog přechodu s vysvětlením kontrol. Bez hlavní akce (uzavřeno) se nevykreslí nic.
 */
export function PhaseButton({
  jobId,
  row,
  size,
  onDone,
}: {
  jobId: string;
  row: RecordRow;
  size?: "sm" | "md";
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const phase = row.phase;
  const action = isPhaseKey(phase)
    ? primaryActionFor(phase, typeof row.pausedFrom === "string" ? row.pausedFrom : null)
    : null;
  if (!action) return null;
  return (
    <>
      <Button variant="primary" {...(size ? { size } : {})} onClick={() => setOpen(true)}>
        {action.label}
      </Button>
      <TransitionDialog
        jobId={jobId}
        to={action.to}
        open={open}
        onOpenChange={setOpen}
        {...(onDone ? { onDone } : {})}
      />
    </>
  );
}

/** Výběr libovolné povolené fáze: seznam možných dalších fází s vysvětlením, co brání. */
function ChangePhase({ jobId, close }: { jobId: string; close: () => void }) {
  const q = usePhasePreview(jobId);
  const [to, setTo] = useState<PhaseKey | null>(null);
  if (q.isLoading) return <Skeleton className="m-5 h-16" />;
  if (!q.data) return null;
  const options = q.data.options ?? [];
  if (to)
    return (
      <TransitionDialog
        jobId={jobId}
        to={to}
        open
        onOpenChange={(o) => {
          if (!o) {
            setTo(null);
            close();
          }
        }}
      />
    );
  return (
    <ul className="divide-y divide-line">
      {options.map((o) => (
        <li key={o.to}>
          <button
            type="button"
            className="flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-hover"
            onClick={() => setTo(o.to)}
          >
            <PhaseChip phase={o.to} />
            <span className="min-w-0 flex-1 text-sm text-muted">
              {o.allowed ? PHASES[o.to].hint : o.problems[0]}
            </span>
          </button>
        </li>
      ))}
      {options.length === 0 && <li className="px-5 py-3 text-muted">Odsud už není kam přejít.</li>}
    </ul>
  );
}

export const tabs: RecordTab[] = [];
export const actions: RecordAction[] = [
  {
    id: "change-phase",
    label: "Změnit fázi",
    permission: "zakazky.write",
    dialog: {
      title: "Změnit fázi zakázky",
      render: ({ id, close }) => <ChangePhase jobId={id} close={close} />,
    },
  },
];
export const pages: ModulePage[] = [];
