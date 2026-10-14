"use client";

import { formatDate, formatMinor } from "@rebar/core/shared";
import {
  Button,
  Chip,
  ConfirmDialog,
  EmptyState,
  Notice,
  SegmentedControl,
  Skeleton,
  Textarea,
  successToast,
  useCommandMutation,
  useCommandQuery,
  useNav,
  type ModulePage,
  type RecordAction,
  type RecordOverviewCard,
  type RecordTab,
} from "@rebar/ui";
import { Check, X } from "lucide-react";
import { useState } from "react";

/** UI oblasti „approvals“: fronta „Ke schválení“, panel schvalování dokladu a karta na Přehledu zakázky. */
export const tabs: RecordTab[] = [];
export const actions: RecordAction[] = [];

type ApprovalState = {
  approvalId: string | null;
  jobId: string | null;
  status: "none" | "pending" | "approved" | "rejected" | "cancelled";
  requestedByName: string | null;
  requestedAt: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  comment: string | null;
  canDecide: boolean;
  canReopen: boolean;
};

type Dialog = null | "reject" | "reopen" | "approve";

/**
 * Stav schvalování jednoho dokladu s tlačítky podle toho, co smí přihlášený uživatel (schválit, zamítnout, vrátit do
 * konceptu). Používají ho editory změn a soupisů. `lockedText` doplní vysvětlení, proč je schválený doklad zamčený.
 */
export function ApprovalPanel({
  docType,
  docId,
  lockedText = "Schválený doklad je zamčený. Chcete-li ho upravit, vraťte ho do konceptu.",
}: {
  docType: "change" | "statement" | "order" | "received_invoice";
  docId: string;
  lockedText?: string;
}) {
  const q = useCommandQuery<ApprovalState>("zakazky.approval.state", { docType, docId });
  const [dialog, setDialog] = useState<Dialog>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const decide = useCommandMutation<{ approvalId: string; approve: boolean; comment?: string }>(
    "zakazky.approval.decide",
  );
  const reopen = useCommandMutation<{ docType: string; docId: string; reason?: string }>(
    "zakazky.approval.reopen",
  );
  const s = q.data;
  if (q.isLoading) return <Skeleton className="h-12" />;
  if (!s || s.status === "none" || s.status === "cancelled") return null;

  const close = () => {
    setDialog(null);
    setText("");
    setError(null);
  };
  async function run(fn: () => Promise<unknown>): Promise<boolean> {
    try {
      await fn();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }

  const when = (iso: string | null) => (iso ? formatDate(iso) : "");
  return (
    <div className="space-y-2" data-testid="approval-panel" data-status={s.status}>
      {s.status === "pending" && (
        <Notice tone="warning" title="Čeká na schválení">
          Odeslal(a) {s.requestedByName ?? "někdo"} dne {when(s.requestedAt)}.
          {s.canDecide
            ? " O dokladu můžete rozhodnout."
            : " Rozhodnout může schvalovatel podle pravidel schvalování."}
        </Notice>
      )}
      {s.status === "approved" && (
        <Notice tone="success" title="Schváleno a zamčeno">
          {s.decidedByName ? `${s.decidedByName}, ` : "Automaticky, "}
          {when(s.decidedAt)}
          {s.comment ? `: ${s.comment}` : ""}. {lockedText}
        </Notice>
      )}
      {s.status === "rejected" && (
        <Notice tone="error" title="Zamítnuto">
          {s.decidedByName ?? "Schvalovatel"} dne {when(s.decidedAt)}
          {s.comment ? `: ${s.comment}` : ""}. Doklad opravte a odešlete znovu.
        </Notice>
      )}
      {(s.canDecide || s.canReopen) && (
        <div className="flex flex-wrap items-center gap-2">
          {s.canDecide && (
            <>
              <Button variant="primary" onClick={() => setDialog("approve")}>
                <Check /> Schválit
              </Button>
              <Button variant="secondary" onClick={() => setDialog("reject")}>
                <X /> Zamítnout
              </Button>
            </>
          )}
          {s.canReopen && (
            <Button variant="secondary" onClick={() => setDialog("reopen")}>
              {s.status === "pending" ? "Vzít zpět do konceptu" : "Vrátit do konceptu"}
            </Button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={dialog === "approve"}
        onOpenChange={(o) => !o && close()}
        title="Schválit doklad"
        description="Schválený doklad se zamkne a propíše do zakázky."
        confirmLabel="Schválit"
        onConfirm={() =>
          run(() =>
            decide.mutateAsync({
              approvalId: s.approvalId!,
              approve: true,
              ...(text.trim() ? { comment: text.trim() } : {}),
            }),
          ).then((ok) => {
            if (ok) successToast("Doklad je schválený.");
            return ok;
          })
        }
      >
        <Textarea
          autoFocus
          aria-label="Komentář ke schválení"
          placeholder="Komentář (nepovinný)"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {error && <p className="mt-1.5 text-sm text-danger">{error}</p>}
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === "reject"}
        onOpenChange={(o) => !o && close()}
        title="Zamítnout doklad"
        description="Autor dostane upozornění a doklad opraví."
        confirmLabel="Zamítnout"
        danger
        onConfirm={() => {
          if (!text.trim()) {
            setError("Napište důvod zamítnutí.");
            return false;
          }
          return run(() =>
            decide.mutateAsync({ approvalId: s.approvalId!, approve: false, comment: text.trim() }),
          );
        }}
      >
        <Textarea
          autoFocus
          aria-label="Důvod zamítnutí"
          placeholder="Důvod zamítnutí"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {error && <p className="mt-1.5 text-sm text-danger">{error}</p>}
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === "reopen"}
        onOpenChange={(o) => !o && close()}
        title="Vrátit do konceptu"
        description="Doklad se odemkne, žádost o schválení se zruší a změna se zapíše do historie."
        confirmLabel="Vrátit do konceptu"
        onConfirm={() =>
          run(() =>
            reopen.mutateAsync({
              docType,
              docId,
              ...(text.trim() ? { reason: text.trim() } : {}),
            }),
          )
        }
      >
        <Textarea
          autoFocus
          aria-label="Důvod vrácení"
          placeholder="Důvod vrácení (nepovinný)"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {error && <p className="mt-1.5 text-sm text-danger">{error}</p>}
      </ConfirmDialog>
    </div>
  );
}

/* ---------- fronta „Ke schválení“ ---------- */

type QueueItem = {
  id: string;
  docType: string;
  docTypeLabel: string;
  docLabel: string;
  jobId: string | null;
  jobNumber: string | null;
  jobTitle: string | null;
  amountMinor: number | null;
  status: string;
  requestedByName: string | null;
  requestedAt: string;
  decidedByName: string | null;
  decidedAt: string | null;
  comment: string | null;
  canDecide: boolean;
  mine: boolean;
};

const DOC_TAB: Record<string, string> = {
  change: "zmeny",
  statement: "fakturace",
  order: "naklady",
  received_invoice: "naklady",
};

function QueueRow({ item }: { item: QueueItem }) {
  const { Link } = useNav();
  const [dialog, setDialog] = useState<"approve" | "reject" | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const decide = useCommandMutation<{ approvalId: string; approve: boolean; comment?: string }>(
    "zakazky.approval.decide",
  );
  const done = item.status !== "pending";
  const close = () => {
    setDialog(null);
    setText("");
    setError(null);
  };
  async function send(approve: boolean): Promise<boolean> {
    if (!approve && !text.trim()) {
      setError("Napište důvod zamítnutí.");
      return false;
    }
    try {
      await decide.mutateAsync({
        approvalId: item.id,
        approve,
        ...(text.trim() ? { comment: text.trim() } : {}),
      });
      successToast(approve ? "Doklad je schválený." : "Doklad je zamítnutý.");
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }
  const href = item.jobId ? `/zakazky/${item.jobId}?tab=${DOC_TAB[item.docType] ?? "zmeny"}` : "#";
  return (
    <li
      className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
      data-testid="approval-item"
    >
      <div className="min-w-48 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <Chip>{item.docTypeLabel}</Chip>
          <Link href={href} className="font-medium hover:underline">
            {item.docLabel}
          </Link>
        </p>
        <p className="mt-1 text-sm text-muted">
          {item.jobNumber ? `${item.jobNumber} ${item.jobTitle ?? ""}, ` : ""}
          {item.requestedByName ?? "někdo"}, {formatDate(item.requestedAt)}
          {done &&
            ` · ${item.status === "approved" ? "schválil(a)" : "zamítl(a)"} ${item.decidedByName ?? "automaticky"}, ${formatDate(item.decidedAt)}`}
          {item.comment ? ` · „${item.comment}“` : ""}
        </p>
      </div>
      {item.amountMinor !== null && (
        <span className="tabular text-base font-medium">{formatMinor(item.amountMinor)}</span>
      )}
      {done ? (
        <Chip color={item.status === "approved" ? "green" : "red"}>
          {item.status === "approved" ? "Schváleno" : "Zamítnuto"}
        </Chip>
      ) : item.canDecide ? (
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => setDialog("approve")}>
            <Check /> Schválit
          </Button>
          <Button variant="secondary" onClick={() => setDialog("reject")}>
            <X /> Zamítnout
          </Button>
        </div>
      ) : (
        <Chip color="yellow">Čeká na schvalovatele</Chip>
      )}
      <ConfirmDialog
        open={dialog === "approve"}
        onOpenChange={(o) => !o && close()}
        title="Schválit doklad"
        description={`${item.docLabel}${item.amountMinor !== null ? `, ${formatMinor(item.amountMinor)}` : ""}`}
        confirmLabel="Schválit"
        onConfirm={() => send(true)}
      >
        <Textarea
          autoFocus
          aria-label="Komentář ke schválení"
          placeholder="Komentář (nepovinný)"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {error && <p className="mt-1.5 text-sm text-danger">{error}</p>}
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === "reject"}
        onOpenChange={(o) => !o && close()}
        title="Zamítnout doklad"
        description={item.docLabel}
        confirmLabel="Zamítnout"
        danger
        onConfirm={() => send(false)}
      >
        <Textarea
          autoFocus
          aria-label="Důvod zamítnutí"
          placeholder="Důvod zamítnutí"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {error && <p className="mt-1.5 text-sm text-danger">{error}</p>}
      </ConfirmDialog>
    </li>
  );
}

function ApprovalQueue() {
  const [view, setView] = useState<"pending" | "decided">("pending");
  const q = useCommandQuery<QueueItem[]>("zakazky.approval.queue", { status: view });
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Ke schválení</h1>
          <p className="text-base text-muted">
            Změny, soupisy prací, objednávky a faktury, o kterých smíte rozhodnout.
          </p>
        </div>
        <SegmentedControl
          label="Zobrazení"
          value={view}
          onChange={setView}
          options={[
            { value: "pending", label: "Čeká" },
            { value: "decided", label: "Vyřízené" },
          ]}
        />
      </div>
      {q.isLoading ? (
        <Skeleton className="h-24" />
      ) : !q.data?.length ? (
        <EmptyState
          title={view === "pending" ? "Nic ke schválení" : "Zatím nic vyřízeno"}
          description={
            view === "pending"
              ? "Až někdo odešle doklad ke schválení, objeví se tady."
              : "Schválené a zamítnuté doklady se zobrazí tady."
          }
        />
      ) : (
        <ul
          className="divide-y divide-line rounded-lg border border-line"
          data-testid="approval-queue"
        >
          {q.data.map((it) => (
            <QueueRow key={it.id} item={it} />
          ))}
        </ul>
      )}
    </div>
  );
}

export const pages: ModulePage[] = [
  { path: "/zakazky/schvalovani", render: () => <ApprovalQueue /> },
];

/* ---------- karta na Přehledu zakázky ---------- */

function PendingApprovalsCard({ id }: { id: string }) {
  const { Link } = useNav();
  const q = useCommandQuery<QueueItem[]>("zakazky.approval.queue", { status: "pending" });
  const items = (q.data ?? []).filter((x) => x.jobId === id);
  if (!items.length) return null;
  return (
    <section className="rounded-lg border border-line p-4" data-testid="overview-approvals">
      <h3 className="mb-2 text-sm font-semibold">Čeká na schválení</h3>
      <ul className="space-y-1.5">
        {items.map((x) => (
          <li key={x.id} className="flex items-center justify-between gap-3 text-base">
            <span className="min-w-0 truncate">
              <span className="text-muted">{x.docTypeLabel}</span> {x.docLabel}
            </span>
            {x.amountMinor !== null && (
              <span className="tabular shrink-0">{formatMinor(x.amountMinor)}</span>
            )}
          </li>
        ))}
      </ul>
      <Link
        href="/zakazky/schvalovani"
        className="mt-2 inline-block text-sm text-accent hover:underline"
      >
        Otevřít frontu schvalování
      </Link>
    </section>
  );
}

export const overviewCards: RecordOverviewCard[] = [
  {
    id: "pending-approvals",
    order: 65,
    permission: ["zakazky.approve", "zakazky.approve_all"],
    render: ({ id }) => <PendingApprovalsCard id={id} />,
  },
];
