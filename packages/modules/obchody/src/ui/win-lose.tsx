"use client";

import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import * as zakazkyUi from "@rebar/zakazky/ui";
import {
  Button,
  Combobox,
  DatePicker,
  Dialog,
  DialogContent,
  Field,
  Icon,
  Skeleton,
  Textarea,
  errorToast,
  successToast,
  undoToast,
  useCommandMutation,
  useCommandQuery,
} from "@rebar/ui";
import type {
  DealChangeResult,
  LoseDealInput,
  LostReasonView,
  WinDealInput,
  WinPreview,
  WinResult,
} from "../contract";

/** Obchod, kterého se dialog týká (id a název pro větu v dialogu). */
export type DealRef = { id: string; title: string };

type DoneProps = { onClose: () => void; onDone?: () => void };

const todayIso = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(new Date());

/* ---------- Prohra (OBCH-12) ---------- */

/** Prohra: povinný důvod z číselníku, volitelná poznámka; „Vrátit“ znovu otevře. */
export function LoseDealDialog({ deal, onClose, onDone }: { deal: DealRef | null } & DoneProps) {
  return (
    <Dialog open={!!deal} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Označit obchod jako prohraný"
        description={deal ? `„${deal.title}“` : ""}
        className="top-[16vh] w-[min(30rem,calc(100vw-2rem))]"
      >
        {deal && <LoseBody deal={deal} onClose={onClose} onDone={onDone} />}
      </DialogContent>
    </Dialog>
  );
}

function LoseBody({ deal, onClose, onDone }: { deal: DealRef } & DoneProps) {
  const reasons = useCommandQuery<LostReasonView[]>("obchody.lostReasons", {});
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [shown, setShown] = useState(false);
  const reopen = useCommandMutation<{ dealId: string }, DealChangeResult>("obchody.reopen");
  const lose = useCommandMutation<LoseDealInput, DealChangeResult>("obchody.lose", {
    onSuccess: () => {
      undoToast("Obchod je označený jako prohraný.", async () => {
        await reopen.mutateAsync({ dealId: deal.id });
        onDone?.();
      });
      onClose();
      onDone?.();
    },
  });
  useEffect(() => setReason(null), [deal.id]);
  return (
    <div className="space-y-3 px-5 py-4" data-testid="lose-dialog">
      <Field
        label="Důvod prohry"
        error={shown && !reason ? "Vyberte důvod prohry." : undefined}
      >
        <Combobox
          aria-label="Důvod prohry"
          options={(reasons.data ?? []).map((r) => ({ value: r.value, label: r.label }))}
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
          loading={lose.isPending}
          data-testid="lose-confirm"
          onClick={() => {
            setShown(true);
            if (!reason) return;
            lose.mutate({ dealId: deal.id, reason, ...(note.trim() ? { note: note.trim() } : {}) });
          }}
        >
          <Icon name="thumbs-down" /> Prohráno
        </Button>
      </div>
    </div>
  );
}

/* ---------- Výhra (OBCH-13) ---------- */

type JobsFromDealProps = {
  dealId: string;
  companyId: string;
  services: readonly string[];
  value?: number | null;
  ownerId?: string | null;
  open?: boolean;
  onSubmit?: (rows: WinDealInput["jobs"]) => Promise<{ jobs?: WinResult["jobs"] } | void>;
  onDone: (r: { skipped: boolean; created: WinResult["jobs"] }) => void;
};

/** Dialog „Založit zakázky“ ze ZAK-B (`@rebar/zakazky/ui`); dokud ho modul nevyexportuje, platí záloha bez řádků. */
const JobsFromDealDialog = (zakazkyUi as unknown as { JobsFromDealDialog?: ComponentType<JobsFromDealProps> })
  .JobsFromDealDialog;

/**
 * Výhra: nejdřív potvrzení s datem výhry, potom dialog „Založit zakázky“ (`JobsFromDealDialog` z modulu zakázky;
 * „Přeskočit“ zakázky nezaloží). Výhru provede `obchody.win` s řádky dialogu. Bez dialogu zakázek (modul ho zatím
 * nenabízí) se obchod jen označí jako vyhraný a zakázky jdou založit ručně.
 */
export function WinDealFlow({ deal, onClose, onDone }: { deal: DealRef | null } & DoneProps) {
  return (
    <Dialog open={!!deal} onOpenChange={(o) => !o && onClose()}>
      {deal && <WinBody deal={deal} onClose={onClose} onDone={onDone} />}
    </Dialog>
  );
}

function WinBody({ deal, onClose, onDone }: { deal: DealRef } & DoneProps) {
  const preview = useCommandQuery<WinPreview>("obchody.winPreview", { dealId: deal.id });
  const [wonOn, setWonOn] = useState<string>(todayIso());
  const [step, setStep] = useState<"confirm" | "jobs">("confirm");
  const win = useCommandMutation<WinDealInput, WinResult>("obchody.win");
  const p = preview.data;
  const canJobs = !!JobsFromDealDialog && !!p?.companyId;

  const finish = (created: number) => {
    successToast(
      created ? `Obchod je vyhraný, založeno zakázek: ${created}.` : "Obchod je označený jako vyhraný.",
    );
    onClose();
    onDone?.();
  };

  if (step === "jobs" && p?.companyId && JobsFromDealDialog)
    return (
      <JobsFromDealDialog
        dealId={deal.id}
        companyId={p.companyId}
        services={p.services}
        value={p.valueMinor}
        ownerId={p.ownerId}
        open
        onSubmit={async (rows) => {
          const r = await win.mutateAsync({ dealId: deal.id, wonOn, jobs: rows });
          return { jobs: r.jobs };
        }}
        onDone={(r) => finish(r.created.length)}
      />
    );

  return (
    <DialogContent
      title="Označit obchod jako vyhraný"
      description={`„${deal.title}“`}
      className="top-[16vh] w-[min(30rem,calc(100vw-2rem))]"
    >
      <div className="space-y-3 px-5 py-4" data-testid="win-dialog">
        {preview.isLoading ? (
          <Skeleton className="h-16" />
        ) : p && p.result !== "open" ? (
          <p role="alert" className="text-sm text-danger">
            Obchod už je {p.result === "won" ? "vyhraný" : "prohraný"}.
          </p>
        ) : (
          <>
            <Field label="Datum výhry">
              <DatePicker value={wonOn} onChange={(v) => setWonOn(v ?? todayIso())} clearable={false} />
            </Field>
            <p className="text-sm text-muted">
              {p?.companyName ? `Organizace „${p.companyName}“ se stane aktivním klientem. ` : ""}
              {canJobs
                ? "V dalším kroku nabídneme založení zakázek."
                : "Zakázky nevzniknou automaticky, založíte je ručně."}
            </p>
          </>
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
            disabled={preview.isLoading || (!!p && p.result !== "open")}
            loading={win.isPending}
            data-testid="win-confirm"
            onClick={() => {
              if (canJobs) return setStep("jobs");
              win.mutate(
                { dealId: deal.id, wonOn, jobs: [] },
                { onSuccess: () => finish(0), onError: (e) => errorToast(e.message) },
              );
            }}
          >
            <Icon name="trophy" /> {canJobs ? "Pokračovat" : "Vyhráno"}
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}
