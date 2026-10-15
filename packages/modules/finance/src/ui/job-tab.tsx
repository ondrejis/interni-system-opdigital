"use client";

import type { SplitRuleInput } from "@rebar/core/contracts";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  EmptyState,
  Icon,
  Notice,
  Skeleton,
  useCommandQuery,
} from "@rebar/ui";
import { useEffect, useState } from "react";
import type { JobFinanceOverview, SplitSetResult } from "../contract";
import { monthName, money, personName, useConfirmedMutation, usePeople } from "./common";
import { PaymentDetailDialog, PaymentFormDialog, TransitionDialog } from "./payment-dialogs";
import { PaymentsTable } from "./payments-table";
import type { PaymentRow } from "../contract";
import {
  RetainerChangeDialog,
  RetainerContinueDialog,
  RetainerEndDialog,
} from "./retainer-dialogs";
import { SplitEditor } from "./split-editor";
import { blocking, ruleIssues } from "./split-logic";

/*
  Záložka „Finance“ v detailu zakázky (ZAK-12, ZAK-13/14/17 – UI): souhrn plateb, volba po vyhodnocení úvodní fáze,
  retainer, pravidla rozdělení (SplitEditor) a platby zakázky se stavovým tokem.
*/

const asInput = (rules: JobFinanceOverview["rules"]): SplitRuleInput[] =>
  rules.map((r) => ({
    userId: r.userId,
    mode: r.mode,
    ...(r.percent !== undefined ? { percent: Number(r.percent) } : {}),
    ...(r.fixedMinor !== undefined ? { fixedMinor: r.fixedMinor } : {}),
    appliesTo: r.appliesTo,
    validFrom: r.validFrom ?? null,
    validTo: r.validTo ?? null,
  }));

/** Obsah záložky Finance v zakázce. */
export function JobFinanceTab({ jobId }: { jobId: string }) {
  const q = useCommandQuery<JobFinanceOverview, { jobId: string }>("finance.job.overview", {
    jobId,
  });
  const o = q.data;
  const people = usePeople(o?.people);
  const [draft, setDraft] = useState<SplitRuleInput[] | null>(null);
  const [dialog, setDialog] = useState<"continue" | "change" | "end" | "new" | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<PaymentRow | null>(null);
  const [transition, setTransition] = useState<{
    row: PaymentRow;
    to: "planned" | "issued" | "paid" | "canceled";
  } | null>(null);

  const rulesKey = JSON.stringify(o?.rules ?? null);
  useEffect(() => setDraft(null), [rulesKey]);
  const shown = draft ?? (o ? asInput(o.rules) : []);
  const dirty = draft !== null;
  const blocked = blocking(ruleIssues(shown));

  const save = useConfirmedMutation<
    { jobId: string; rules: SplitRuleInput[]; confirmRecalc?: boolean },
    SplitSetResult
  >("finance.split.set", {
    success: "Pravidla rozdělení uložena.",
    onOk: () => setDraft(null),
    people,
  });

  if (q.isLoading) return <Skeleton className="h-40 w-full" />;
  if (q.isError || !o)
    return (
      <EmptyState
        title="Finance zakázky se nepodařilo načíst"
        description={(q.error as Error | null)?.message ?? ""}
      />
    );

  const t = o.totals;
  return (
    <div className="space-y-4" data-testid="job-finance-tab">
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Plánováno", t.byStatus.planned.amountMinor, ""],
          ["Vystaveno", t.byStatus.issued.amountMinor, ""],
          ["Zaplaceno", t.byStatus.paid.amountMinor, "text-success"],
          ["Po splatnosti", t.overdue.amountMinor, t.overdue.count > 0 ? "text-danger" : ""],
        ].map(([label, v, tone]) => (
          <Card key={label as string}>
            <CardBody className="py-3">
              <p className="text-sm text-muted">{label}</p>
              <p className={`text-lg font-semibold tabular-nums ${tone}`}>{money(v as number)}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      {o.decisionPending && (
        <Notice tone="info" title="Úvodní fáze je vyhodnocená">
          <p className="mb-2">Pokračujte na měsíční retainer, nebo zakázku ukončete.</p>
          {o.canWrite && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                onClick={() => setDialog("continue")}
                data-testid="finance-continue"
              >
                Pokračovat na retainer
              </Button>
              <Button onClick={() => setDialog("end")} data-testid="finance-end-intro">
                Ukončit
              </Button>
            </div>
          )}
        </Notice>
      )}

      {o.retainer && (
        <Card>
          <CardHeader
            title="Retainer"
            icon={<Icon name="rotate-ccw" />}
            action={
              o.canWrite && o.retainer.active ? (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => setDialog("change")}
                    data-testid="retainer-change"
                  >
                    Změnit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDialog("end")}
                    data-testid="retainer-end"
                  >
                    Ukončit
                  </Button>
                </div>
              ) : undefined
            }
          />
          <CardBody className="space-y-1 text-base">
            <p>
              <strong className="tabular-nums">{money(o.retainer.amountMinor)}</strong> měsíčně od{" "}
              {monthName(o.retainer.fromMonth)}
              {o.retainer.toMonth ? `, do ${monthName(o.retainer.toMonth)}` : ""}.
              {!o.retainer.active && <Chip className="ml-2">Ukončen</Chip>}
            </p>
            <p className="text-muted">
              Faktura se vystavuje {o.retainer.issueDay}. dne v měsíci; fakturuje{" "}
              {o.retainer.issuerMode === "alternate"
                ? `střídavě (začíná ${personName(people, o.retainer.firstIssuerId ?? o.retainer.issuerId)})`
                : personName(people, o.retainer.issuerId)}
              .
            </p>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Rozdělení plateb"
          icon={<Icon name="scale" />}
          action={
            o.canEditSplit && dirty ? (
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
                  Zahodit změny
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={blocked}
                  loading={save.pending}
                  onClick={() => save.run({ jobId, rules: shown })}
                  data-testid="split-save"
                >
                  Uložit pravidla
                </Button>
              </div>
            ) : undefined
          }
        />
        <CardBody>
          {!o.canEditSplit && (
            <p className="mb-3 text-sm text-muted">Pravidla rozdělení může měnit jen vlastník.</p>
          )}
          <SplitEditor
            value={shown}
            onChange={(v) => setDraft(v ?? [])}
            disabled={!o.canEditSplit}
            {...(o.job.billingModel === "retainer" ? { previewKind: "retainer" as const } : {})}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Platby zakázky"
          icon={<Icon name="wallet" />}
          count={o.payments.length}
          action={
            o.canWrite ? (
              <Button size="sm" onClick={() => setDialog("new")} data-testid="job-payment-new">
                <Icon name="plus" /> Zapsat platbu
              </Button>
            ) : undefined
          }
        />
        <PaymentsTable
          rows={o.payments}
          people={people}
          totals={o.totals}
          compact
          showJob={false}
          showClient={false}
          onOpen={setOpenId}
          emptyText="Zakázka zatím nemá žádné platby."
        />
      </Card>

      {dialog === "continue" && (
        <RetainerContinueDialog jobId={jobId} rules={o.rules} onClose={() => setDialog(null)} />
      )}
      {dialog === "change" && o.retainer && (
        <RetainerChangeDialog
          retainer={o.retainer}
          rules={o.rules}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "end" && (
        <RetainerEndDialog
          jobId={jobId}
          retainer={o.retainer?.active ? o.retainer : null}
          companyId={o.job.companyId}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "new" && (
        <PaymentFormDialog
          jobId={jobId}
          jobLabel={`${o.job.number} ${o.job.title}`}
          onClose={() => setDialog(null)}
        />
      )}
      {openId && (
        <PaymentDetailDialog
          id={openId}
          onClose={() => setOpenId(null)}
          onEdit={(r) => setEditing(r)}
          onTransition={(r, to) => setTransition({ row: r, to })}
        />
      )}
      {editing && <PaymentFormDialog row={editing} onClose={() => setEditing(null)} />}
      {transition && (
        <TransitionDialog
          row={transition.row}
          to={transition.to}
          people={people}
          onClose={() => setTransition(null)}
        />
      )}
      {save.dialog}
    </div>
  );
}
