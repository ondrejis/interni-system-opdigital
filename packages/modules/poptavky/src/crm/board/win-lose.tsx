"use client";

import {
  Button,
  Combobox,
  Dialog,
  DialogContent,
  Field,
  Icon,
  Skeleton,
  Textarea,
  successToast,
  undoToast,
  useCommandMutation,
  useCommandQuery,
} from "@rebar/ui";
import { useEffect, useState } from "react";
import { ProblemList, useMoveCheck } from "./transition-panel";

/** Zakázka, které se dialog týká (id a název pro větu v dialogu). */
export type DealRef = { id: string; title: string };

type DoneProps = { onClose: () => void; onDone?: () => void };

/**
 * Výhra: potvrzení a výsledek kontrol přechodu do přípravy realizace (chybějící pole jdou doplnit rovnou, jiné kontroly
 * ukážou větu). Tlačítko „Vyhráno“ se odemkne, až kontrola projde. Server kontroly provede znovu.
 */
export function WinDealDialog({ deal, onClose, onDone }: { deal: DealRef | null } & DoneProps) {
  return (
    <Dialog open={!!deal} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Označit zakázku jako vyhranou"
        description={deal ? `„${deal.title}“ přejde do přípravy realizace.` : ""}
        className="top-[16vh] w-[min(34rem,calc(100vw-2rem))]"
      >
        {deal && <WinBody deal={deal} onClose={onClose} onDone={onDone} />}
      </DialogContent>
    </Dialog>
  );
}

function WinBody({ deal, onClose, onDone }: { deal: DealRef } & DoneProps) {
  const check = useMoveCheck(deal.id, { toPhase: "preparation" });
  const win = useCommandMutation<{ jobId: string }>("crm.deal.win", {
    onSuccess: () => {
      successToast("Zakázka je vyhraná a přešla do přípravy.");
      onClose();
      onDone?.();
    },
  });
  const problems = check.data?.problems ?? [];
  return (
    <div className="space-y-3 px-5 py-4" data-testid="win-dialog">
      {check.isLoading ? (
        <Skeleton className="h-12" />
      ) : problems.length ? (
        <div className="rounded-lg border border-line bg-warning-soft p-3">
          <p className="mb-2 text-sm font-medium">Než zakázku vyhrajete, doplňte:</p>
          <ProblemList jobId={deal.id} problems={problems} />
        </div>
      ) : (
        <p className="flex items-center gap-2 text-muted">
          <Icon name="circle-check" className="size-4 text-success" />
          Všechny kontroly přechodu jsou splněné.
        </p>
      )}
      {win.error && (
        <p role="alert" className="text-sm text-danger">
          {win.error.message}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Zrušit
        </Button>
        <Button
          className="bg-success text-bg hover:opacity-90"
          loading={win.isPending}
          disabled={check.isLoading || problems.length > 0}
          onClick={() => win.mutate({ jobId: deal.id })}
          data-testid="win-confirm"
        >
          <Icon name="trophy" /> Vyhráno
        </Button>
      </div>
    </div>
  );
}

/** Prohra: povinný důvod z číselníku a volitelná poznámka. */
export function LoseDealDialog({ deal, onClose, onDone }: { deal: DealRef | null } & DoneProps) {
  return (
    <Dialog open={!!deal} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Označit zakázku jako prohranou"
        description={deal ? `„${deal.title}“` : ""}
        className="top-[16vh] w-[min(30rem,calc(100vw-2rem))]"
      >
        {deal && <LoseBody deal={deal} onClose={onClose} onDone={onDone} />}
      </DialogContent>
    </Dialog>
  );
}

function LoseBody({ deal, onClose, onDone }: { deal: DealRef } & DoneProps) {
  const reasons = useCommandQuery<{ value: string; label: string }[]>("crm.deal.lostReasons", {});
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const reopen = useCommandMutation<{ jobId: string }>("crm.deal.reopen");
  const lose = useCommandMutation<{ jobId: string; reasonKey: string; note?: string }>(
    "crm.deal.lose",
    {
      onSuccess: () => {
        undoToast("Zakázka je označená jako prohraná.", async () => {
          await reopen.mutateAsync({ jobId: deal.id });
          onDone?.();
        });
        onClose();
        onDone?.();
      },
    },
  );
  useEffect(() => setReason(null), [deal.id]);
  return (
    <div className="space-y-3 px-5 py-4" data-testid="lose-dialog">
      <Field label="Důvod prohry">
        <Combobox
          aria-label="Důvod prohry"
          options={reasons.data ?? []}
          value={reason}
          onChange={(v) => setReason(v as string | null)}
          placeholder="Vyberte důvod…"
        />
      </Field>
      <Field label="Poznámka (nepovinná)">
        <Textarea
          aria-label="Poznámka k prohře"
          value={note}
          maxLength={2000}
          rows={3}
          placeholder="Např. vybrali levnější nabídku o 8 %."
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      {lose.error && (
        <p role="alert" className="text-sm text-danger">
          {lose.error.message}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Zrušit
        </Button>
        <Button
          variant="danger"
          disabled={!reason}
          loading={lose.isPending}
          data-testid="lose-confirm"
          onClick={() =>
            reason &&
            lose.mutate({
              jobId: deal.id,
              reasonKey: reason,
              ...(note.trim() ? { note: note.trim() } : {}),
            })
          }
        >
          <Icon name="thumbs-down" /> Prohráno
        </Button>
      </div>
    </div>
  );
}
