"use client";

import type { SplitRuleInput } from "@rebar/core/contracts";
import { Button, Chip, useCan, useCommandQuery } from "@rebar/ui";
import { useState } from "react";
import type { JobFinanceOverview } from "../contract";
import { money } from "./common";
import { RetainerChangeDialog, RetainerEndDialog } from "./retainer-dialogs";
import { SplitEditor } from "./split-editor";

/** Slot `job.header.extra`: u zakázky s aktivním retainerem ukáže částku a akce Změnit / Ukončit retainer. */
export function JobHeaderExtra({ jobId }: { jobId: string }) {
  const can = useCan();
  const read = can("finance.read");
  const q = useCommandQuery<JobFinanceOverview, { jobId: string }>(
    "finance.job.overview",
    { jobId },
    { enabled: read },
  );
  const [dialog, setDialog] = useState<"change" | "end" | null>(null);
  const o = q.data;
  if (!read || !o?.retainer?.active) return null;
  return (
    <>
      <span className="inline-flex flex-wrap items-center gap-1.5" data-testid="job-retainer-extra">
        <Chip color="teal" title="Aktivní měsíční retainer">
          Retainer {money(o.retainer.amountMinor)}/měs.
        </Chip>
        {o.canWrite && (
          <>
            <Button size="sm" variant="ghost" onClick={() => setDialog("change")}>
              Změnit retainer
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDialog("end")}>
              Ukončit retainer
            </Button>
          </>
        )}
      </span>
      {dialog === "change" && (
        <RetainerChangeDialog
          retainer={o.retainer}
          rules={o.rules}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "end" && (
        <RetainerEndDialog
          jobId={jobId}
          retainer={o.retainer}
          companyId={o.job.companyId}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}

/** Slot `job.create.extras`: rozdělení plateb při zakládání zakázky (výchozí z Nastavení, nebo vlastní) s živým náhledem. */
export function JobCreateExtras({
  value,
  onChange,
  ownerId,
}: {
  value: SplitRuleInput[] | null;
  onChange: (value: SplitRuleInput[] | null) => void;
  ownerId: string;
}) {
  const can = useCan();
  return (
    <SplitEditor
      value={value}
      onChange={onChange}
      issuerId={ownerId}
      allowDefault
      disabled={!can("finance.splits_edit")}
    />
  );
}
