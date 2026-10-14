"use client";

import type { RecordRow } from "@rebar/core/shared";
import {
  PipelineStepper,
  useCommandQuery,
  useEntityApi,
  useEntityDescriptor,
  useUpdateAttribute,
  type PipelineStage,
} from "@rebar/ui";
import { useMemo, useState } from "react";
import { boardStages, stageDays, stripMode, type MoveCheck } from "./logic";
import { TransitionPanel } from "./transition-panel";

/** Řádek historie stavů z příkazu `crm.deal.history` (jen to, co detail potřebuje). */
export type HistoryRow = {
  id: string;
  stageId: string;
  stageName: string;
  phase: string | null;
  enteredAt: string;
  leftAt: string | null;
  days: number;
};

/** Historie stavů zakázky (dny ve stavech pro pás fází, stáří zakázky). Po změně zakázky se sama obnoví. */
export function useDealHistory(jobId: string) {
  return useCommandQuery<HistoryRow[], { jobId: string }>("crm.deal.history", { jobId });
}

const WON_ID = "__won";

/**
 * Pás fází detailu: stavy fází Poptávka a Nabídka jako šipky s dny ve stavu, klik přesune zakázku. Když přesun
 * nejde (chybí adresa stavby, povinné pole od stavu…), pod pásem se ukáže věta s editory polí, ne jen toast.
 * Vyhraná zakázka má na konci zelené „Vyhráno“, prohraná pás bez aktuálního stavu (banner je v hlavičce).
 */
export function StageStrip({ id, row }: { id: string; row: RecordRow }) {
  const api = useEntityApi();
  const entity = useEntityDescriptor("job");
  const history = useDealHistory(id);
  const update = useUpdateAttribute("job");
  const [pending, setPending] = useState<{ stageId: string; error: string | null } | null>(null);

  const mode = stripMode(row.phase);
  const stages = useMemo(() => {
    const all = entity.data?.attributes.find((a) => a.key === "stage")?.stages ?? [];
    return boardStages(all);
  }, [entity.data]);
  const days = useMemo(() => stageDays(history.data ?? []), [history.data]);

  const steps = useMemo<PipelineStage[]>(() => {
    const out: PipelineStage[] = stages.map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      kind: s.kind,
      daysInStage: days[s.id] ?? null,
    }));
    if (mode === "won" || mode === "other")
      out.push({ id: WON_ID, name: "Vyhráno", color: "green", kind: "won", daysInStage: null });
    return out;
  }, [stages, days, mode]);

  const current = mode === "open" ? String(row.stage ?? "") : mode === "lost" ? null : WON_ID;
  const canMove = mode === "open" && !!entity.data?.can.write;

  async function move(stageId: string) {
    try {
      const check = await api.command<unknown, MoveCheck>("crm.deal.moveCheck", {
        jobId: id,
        stageId,
      });
      if (check.problems.length) {
        setPending({ stageId, error: null });
        return;
      }
      const fresh = await api.get("job", id);
      await update.mutateAsync({
        id,
        attr: "stage",
        value: stageId,
        updatedAt: fresh.row.updatedAt,
      });
      setPending(null);
    } catch (e) {
      // kontrola prošla, ale server přesun odmítl (někdo mezitím zakázku změnil…): věta v panelu místo toastu
      setPending({ stageId, error: (e as Error).message });
    }
  }

  if (!steps.length) return null;
  return (
    <div className="space-y-2" data-testid="deal-stage-strip">
      <PipelineStepper
        stages={steps}
        currentId={current}
        label="Stavy zakázky"
        onSelect={canMove ? (stageId) => void move(stageId) : undefined}
      />
      {pending && (
        <TransitionPanel
          key={pending.stageId}
          jobId={id}
          stageId={pending.stageId}
          initialError={pending.error}
          onMoved={() => setPending(null)}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}
