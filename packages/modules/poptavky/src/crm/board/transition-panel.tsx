"use client";

import {
  Button,
  CellEditor,
  Dialog,
  DialogContent,
  Icon,
  Skeleton,
  useCommandQuery,
  useEntityApi,
  useEntityDescriptor,
  useEntityRecord,
  useUpdateAttribute,
} from "@rebar/ui";
import { useState } from "react";
import { isTypedInline } from "./fields";
import type { MoveCheck, MoveProblem } from "./logic";

/*
  Přesun zakázky do stavu, který brání kontrola (chybí adresa stavby, povinné pole od stavu…): místo toastu se ukáže
  česká věta a u pole, které jde doplnit, rovnou editor. Po doplnění se kontrola znovu spustí a přesun se odemkne.
*/

export type { MoveCheck, MoveProblem };

/** Kontrola přesunu do stavu (nebo do fáze) bez zápisu; po každé úpravě zakázky se sama obnoví. */
export function useMoveCheck(
  jobId: string,
  target: { stageId?: string; toPhase?: "preparation" | "lost" | "offer" | "inquiry" },
  enabled = true,
) {
  return useCommandQuery<MoveCheck>("crm.deal.moveCheck", { jobId, ...target }, { enabled });
}

/** Jedno pole k doplnění: popisek a editor podle typu atributu (textová pole rovnou, ostatní po kliknutí). */
function FixField({ jobId, problem }: { jobId: string; problem: MoveProblem }) {
  const entity = useEntityDescriptor("job");
  const record = useEntityRecord("job", jobId);
  const api = useEntityApi();
  const update = useUpdateAttribute("job");
  const attr = entity.data?.attributes.find((a) => a.key === problem.attr);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!attr || !problem.attr || !entity.data?.can.write || attr.readonly) return null;
  const row = record.data?.row;
  const showEditor = open || isTypedInline(attr);

  async function save(value: unknown) {
    if (!row || value === null || value === undefined || value === "") return;
    setError(null);
    try {
      await update.mutateAsync({
        id: jobId,
        attr: attr!.key,
        value,
        updatedAt: row.updatedAt,
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2" data-testid={`fix-${problem.attr}`}>
      <span className="w-32 shrink-0 text-sm text-muted">{attr.label}</span>
      {showEditor ? (
        <div className="relative h-8 min-w-48 flex-1">
          <CellEditor
            attr={attr}
            value={row?.[attr.key] ?? null}
            labels={record.data?.labels}
            lookups={api.lookups}
            onCommit={(v) => void save(v)}
            onCancel={() => setOpen(false)}
          />
        </div>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          Vyplnit
        </Button>
      )}
      {error && (
        <p role="alert" className="basis-full text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Seznam problémů přesunu: věta a (u pole, které jde doplnit) editor. */
export function ProblemList({ jobId, problems }: { jobId: string; problems: MoveProblem[] }) {
  return (
    <ul className="space-y-2" data-testid="move-problems">
      {problems.map((p) => (
        <li key={`${p.attr ?? ""}:${p.message}`} className="flex gap-2 text-sm">
          <Icon name="alert-triangle" className="mt-0.5 size-4 shrink-0 text-warning" />
          <div className="min-w-0 flex-1">
            <p>{p.message}</p>
            {p.attr && <FixField jobId={jobId} problem={p} />}
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Panel pod pásem fází: co chybí před přesunem do stavu, s editory polí a tlačítkem „Přesunout“, které se odemkne,
 * až kontrola projde. `initialError` je věta, kterou server vrátil při pokusu o přesun.
 */
export function TransitionPanel({
  jobId,
  stageId,
  initialError,
  onMoved,
  onCancel,
}: {
  jobId: string;
  stageId: string;
  initialError?: string | null;
  onMoved: () => void;
  onCancel: () => void;
}) {
  const check = useMoveCheck(jobId, { stageId });
  const update = useUpdateAttribute("job");
  const api = useEntityApi();
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [busy, setBusy] = useState(false);
  const problems = check.data?.problems ?? [];
  const name = check.data?.target.name ?? "";

  async function move() {
    setBusy(true);
    setError(null);
    try {
      // čerstvá verze záznamu: doplněná pole mezitím posunula `updatedAt`
      const fresh = await api.get("job", jobId);
      await update.mutateAsync({
        id: jobId,
        attr: "stage",
        value: stageId,
        updatedAt: fresh.row.updatedAt,
      });
      onMoved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="rounded-lg border border-line bg-warning-soft p-3"
      data-testid="transition-panel"
      role="group"
      aria-label="Před přesunem"
    >
      {check.isLoading ? (
        <Skeleton className="h-10" />
      ) : (
        <>
          <p className="mb-2 text-sm font-medium">
            {problems.length
              ? `Před přesunem do stavu „${name}“ doplňte:`
              : `Vše je vyplněno, zakázku můžete přesunout do stavu „${name}“.`}
          </p>
          {problems.length > 0 && <ProblemList jobId={jobId} problems={problems} />}
        </>
      )}
      {error && !problems.length && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Zrušit
        </Button>
        <Button
          variant="primary"
          size="sm"
          loading={busy}
          disabled={check.isLoading || problems.length > 0}
          onClick={() => void move()}
        >
          Přesunout do „{name}“
        </Button>
      </div>
    </div>
  );
}

/** Dialog s panelem přesunu (přetažení karty na nástěnce, které kontrola nepustila). */
export function MoveFixDialog({
  jobId,
  title,
  stageId,
  onClose,
}: {
  jobId: string | null;
  title: string;
  stageId: string | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!jobId && !!stageId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Přesun zakázky"
        description={title}
        className="top-[16vh] w-[min(34rem,calc(100vw-2rem))]"
      >
        {jobId && stageId && (
          <div className="p-4">
            <TransitionPanel jobId={jobId} stageId={stageId} onMoved={onClose} onCancel={onClose} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
