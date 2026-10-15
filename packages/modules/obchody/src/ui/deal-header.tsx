"use client";

import { formatDate } from "@rebar/core/shared";
import {
  Button,
  Chip,
  Icon,
  PipelineStepper,
  errorToast,
  successToast,
  useCan,
  useCommandMutation,
  useCommandQuery,
  type PipelineStage,
  type RecordHeader,
} from "@rebar/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DealChangeResult, DealDetail } from "../contract";
import { stageDays, stripMode } from "./logic";
import { LoseDealDialog, WinDealFlow } from "./win-lose";

const WON_ID = "__won";

/** Detail obchodu z `obchody.detail` (pás fází se dny, historie, účastníci); po každé změně se sám obnoví. */
export function useDealDetail(dealId: string) {
  return useCommandQuery<DealDetail, { dealId: string }>("obchody.detail", { dealId });
}

/**
 * Pás pod názvem obchodu (OBCH-11): klikací pás fází s dny ve fázi, tlačítka Vyhráno a Prohráno, u uzavřeného
 * obchodu výsledek (datum, důvod prohry, poznámka) a „Znovu otevřít“. Při prvním otevření nového Meta leadu
 * obchod označí jako otevřený (zvýraznění na boardu zmizí, R-42).
 */
export const DealHeaderBand: RecordHeader = ({ id, row, entity }) => {
  const can = useCan();
  const detail = useDealDetail(id);
  const [dialog, setDialog] = useState<"win" | "lose" | null>(null);
  const move = useCommandMutation<
    { dealId: string; stageId: string; expectedUpdatedAt?: string },
    DealChangeResult
  >("obchody.moveStage");
  const reopen = useCommandMutation<{ dealId: string }, DealChangeResult>("obchody.reopen", {
    onSuccess: () => successToast("Obchod je znovu otevřený."),
  });
  const opened = useCommandMutation<{ dealId: string }, DealChangeResult>("obchody.markOpened", {
    invalidate: [["entity", "deal"]],
  });
  const marked = useRef(false);
  const unopened = row.source === "meta" && !row.firstOpenedAt && row.result === "open";
  useEffect(() => {
    if (unopened && !marked.current) {
      marked.current = true;
      opened.mutate({ dealId: id });
    }
  }, [unopened, id, opened]);

  const mode = stripMode(row.result);
  const canWrite = entity.can.write && can("obchody.write");
  const title = String(row[entity.titleKey] ?? "");
  const d = detail.data;
  const days = useMemo(() => stageDays(d?.history ?? []), [d?.history]);

  const steps = useMemo<PipelineStage[]>(() => {
    const out: PipelineStage[] = (d?.stages ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      kind: "open",
      daysInStage: days[s.id] ?? s.daysIn ?? null,
    }));
    if (mode === "won")
      out.push({ id: WON_ID, name: "Vyhráno", color: "green", kind: "won", daysInStage: null });
    return out;
  }, [d?.stages, days, mode]);
  const current = mode === "open" ? String(row.status ?? "") : mode === "won" ? WON_ID : null;

  return (
    <div className="space-y-2" data-testid="deal-header-band" data-mode={mode}>
      <div className="flex flex-wrap items-center gap-2">
        {mode === "open" && canWrite && (
          <>
            <Button
              className="bg-success font-semibold text-bg hover:opacity-90"
              onClick={() => setDialog("win")}
              data-testid="deal-win"
            >
              <Icon name="trophy" /> Vyhráno
            </Button>
            <Button
              variant="danger"
              className="font-semibold"
              onClick={() => setDialog("lose")}
              data-testid="deal-lose"
            >
              <Icon name="thumbs-down" /> Prohráno
            </Button>
          </>
        )}
        {mode === "won" && (
          <Chip color="green" dot data-testid="deal-won-chip">
            Vyhráno{row.wonAt ? ` ${formatDate(String(row.wonAt).slice(0, 10))}` : ""}
          </Chip>
        )}
        {mode === "lost" && (
          <Chip color="red" dot data-testid="deal-lost-chip">
            Prohráno{d?.deal.lostReasonLabel ? `: ${d.deal.lostReasonLabel}` : ""}
          </Chip>
        )}
        {mode !== "open" && canWrite && (
          <Button
            variant="secondary"
            loading={reopen.isPending}
            data-testid="deal-reopen"
            onClick={() => reopen.mutate({ dealId: id }, { onError: (e) => errorToast(e.message) })}
          >
            <Icon name="rotate-ccw" /> Znovu otevřít
          </Button>
        )}
        {d && mode === "open" && (
          <span className="tabular ml-auto text-sm text-muted" data-testid="deal-probability">
            {d.deal.probabilityPct} % pravděpodobnost
          </span>
        )}
      </div>
      {mode === "lost" && d?.deal.lostNote && (
        <p
          className="rounded-md bg-danger-soft px-3 py-1.5 text-sm"
          role="status"
          data-testid="deal-lost-note"
        >
          {d.deal.lostNote}
        </p>
      )}
      {steps.length > 0 && (
        <PipelineStepper
          stages={steps}
          currentId={current}
          label="Fáze obchodu"
          onSelect={
            mode === "open" && canWrite
              ? (stageId) =>
                  move.mutate(
                    { dealId: id, stageId, expectedUpdatedAt: String(row.updatedAt) },
                    { onError: (e) => errorToast(e.message) },
                  )
              : undefined
          }
        />
      )}
      <WinDealFlow deal={dialog === "win" ? { id, title } : null} onClose={() => setDialog(null)} />
      <LoseDealDialog
        deal={dialog === "lose" ? { id, title } : null}
        onClose={() => setDialog(null)}
      />
    </div>
  );
};
