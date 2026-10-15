"use client";

import { formatDate, formatMinor } from "@rebar/core/shared";
import {
  Button,
  Chip,
  ConfirmDialog,
  Dialog,
  DialogContent,
  Field,
  Icon,
  MoneyInput,
  errorToast,
  successToast,
  useCommandMutation,
  useNav,
} from "@rebar/ui";
import { useState } from "react";
import { INVOICE_STATUS_LABELS, type InvoiceStatus } from "../labels";
import type { ApproveResult, InvoiceRow } from "./types";

/** Barvy stavů návrhu: koncept šedý, schválený (čeká na dokončení) oranžový, hotový zelený, zrušený světlý. */
export const INVOICE_STATUS_COLORS: Record<InvoiceStatus, string> = {
  draft: "blue",
  approved: "orange",
  sent_to_fakturoid: "green",
  canceled: "gray",
};

function EditDialog({ row, onClose }: { row: InvoiceRow; onClose: () => void }) {
  const [amount, setAmount] = useState<number | null>(row.amountMinor);
  const save = useCommandMutation<{ id: string; amountMinor: number }>(
    "muj-prostor.invoices.update",
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Upravit návrh faktury"
        description={`${row.serviceName}, ${formatDate(row.periodFrom)} až ${formatDate(row.periodTo)}`}
        className="w-[min(26rem,calc(100vw-2rem))]"
        data-testid="invoice-edit-dialog"
      >
        <form
          className="space-y-3 px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!amount || amount <= 0) return;
            save.mutate(
              { id: row.id, amountMinor: amount },
              { onSuccess: onClose, onError: (err) => errorToast(err.message) },
            );
          }}
        >
          <Field label="Částka v Kč">
            <MoneyInput value={amount} onChange={setAmount} aria-label="Částka v Kč" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>Zrušit</Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!amount || amount <= 0}
              loading={save.isPending}
              data-testid="invoice-edit-save"
            >
              Uložit
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Jeden řádek návrhu faktury: klient, služba, období, částka, stav a akce (upravit, **Schválit a vytvořit ve
 * Fakturoidu**, zrušit, obnovit, doplnit platbu). Schválení se vždy potvrzuje v dialogu se souhrnem.
 */
export function InvoiceLine({ row, showClient = true }: { row: InvoiceRow; showClient?: boolean }) {
  const { Link } = useNav();
  const [edit, setEdit] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const approve = useCommandMutation<{ id: string; expectedAmountMinor: number }, ApproveResult>(
    "muj-prostor.invoices.approve",
  );
  const cancel = useCommandMutation<{ id: string }>("muj-prostor.invoices.cancel");
  const reopen = useCommandMutation<{ id: string }>("muj-prostor.invoices.reopen");
  const retry = useCommandMutation<
    { id: string },
    { paymentCreated: boolean; warning: string | null }
  >("muj-prostor.invoices.retryPayment");
  const fail = (e: Error) => errorToast(e.message);

  return (
    <li
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-soft px-3 py-2 first:border-t-0"
      data-testid="invoice-row"
      data-status={row.status}
    >
      <div className="min-w-0 flex-1">
        <Link
          href={`/muj-prostor/faktury/vse/${row.id}`}
          className="block truncate font-medium hover:underline"
        >
          {row.serviceName}
        </Link>
        <p className="truncate text-sm text-muted">
          {showClient && row.companyName ? `${row.companyName} · ` : ""}
          {formatDate(row.periodFrom)} až {formatDate(row.periodTo)}
        </p>
        {row.error && (
          <p className="text-sm text-danger" data-testid="invoice-error">
            {row.error}
          </p>
        )}
      </div>
      <span className="tabular font-medium" data-testid="invoice-amount">
        {formatMinor(row.amountMinor)}
      </span>
      <Chip color={INVOICE_STATUS_COLORS[row.status]} data-testid="invoice-status">
        {INVOICE_STATUS_LABELS[row.status]}
      </Chip>
      {row.fakturoidNumber && (
        <a
          href={row.fakturoidUrl ?? undefined}
          target="_blank"
          rel="noreferrer"
          className="tabular text-sm underline"
          data-testid="invoice-number"
        >
          {row.fakturoidNumber}
        </a>
      )}
      {row.status === "sent_to_fakturoid" && (
        <Chip color={row.hasPayment ? "green" : "red"}>
          {row.hasPayment ? "Platba založena" : "Bez platby"}
        </Chip>
      )}
      <span className="flex flex-wrap gap-2">
        {row.canEdit && (
          <Button size="sm" onClick={() => setEdit(true)} data-testid="invoice-edit">
            <Icon name="pencil" /> Upravit
          </Button>
        )}
        {row.canApprove && (
          <Button
            size="sm"
            variant="primary"
            onClick={() => setConfirm(true)}
            data-testid="invoice-approve"
          >
            <Icon name="check" />{" "}
            {row.status === "approved"
              ? "Zopakovat vytvoření"
              : "Schválit a vytvořit ve Fakturoidu"}
          </Button>
        )}
        {row.canRetryPayment && (
          <Button
            size="sm"
            loading={retry.isPending}
            onClick={() =>
              retry.mutate(
                { id: row.id },
                {
                  onSuccess: (r) =>
                    r.paymentCreated
                      ? successToast("Platba založena.")
                      : errorToast(r.warning ?? "Platba nevznikla."),
                  onError: fail,
                },
              )
            }
            data-testid="invoice-retry-payment"
          >
            Doplnit platbu
          </Button>
        )}
        {row.canCancel && (
          <Button
            size="sm"
            loading={cancel.isPending}
            onClick={() => cancel.mutate({ id: row.id }, { onError: fail })}
            data-testid="invoice-cancel"
          >
            Zrušit
          </Button>
        )}
        {row.canReopen && (
          <Button
            size="sm"
            loading={reopen.isPending}
            onClick={() => reopen.mutate({ id: row.id }, { onError: fail })}
            data-testid="invoice-reopen"
          >
            Obnovit
          </Button>
        )}
      </span>
      {edit && <EditDialog row={row} onClose={() => setEdit(false)} />}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Schválit a vytvořit ve Fakturoidu?"
        description={`${row.companyName ?? "Klient"}: ${row.serviceName}, ${formatDate(row.periodFrom)} až ${formatDate(row.periodTo)}, ${formatMinor(row.amountMinor)}. Faktura se vytvoří ve Fakturoidu, další obnova se posune o období a vznikne platba, která patří jen vám.`}
        confirmLabel="Schválit a vytvořit"
        onConfirm={async () => {
          try {
            const r = await approve.mutateAsync({
              id: row.id,
              expectedAmountMinor: row.amountMinor,
            });
            if (r.warning) errorToast(r.warning);
            else successToast(`Faktura ${r.fakturoidNumber} je vytvořená.`);
          } catch (e) {
            errorToast(e instanceof Error ? e.message : "Fakturu se nepodařilo vytvořit.");
            return false;
          }
        }}
      />
    </li>
  );
}
