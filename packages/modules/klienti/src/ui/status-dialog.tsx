"use client";

import {
  Button,
  DatePicker,
  Dialog,
  DialogContent,
  Field,
  SegmentedControl,
  Textarea,
  errorToast,
  successToast,
  useCommandMutation,
} from "@rebar/ui";
import { useState } from "react";
import type { ClientStatus } from "@rebar/core/contracts";
import { CLIENT_STATUSES, CLIENT_STATUS_LABELS, todayPrague } from "../shared";

type Result = { changed: boolean; clientSince: string | null };
type Input = { companyId: string; status: ClientStatus; reason?: string; endedOn?: string };

/**
 * Změna stavu klienta (KLI-02): výběr ze čtyř stavů; Bývalý se ptá na důvod a datum ukončení (složka jde do Archivu),
 * Aktivní při prvním přechodu uloží „klient od“.
 */
export function StatusDialog({
  companyId,
  current,
  open,
  onOpenChange,
}: {
  companyId: string;
  current: ClientStatus | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [status, setStatus] = useState<ClientStatus>(current ?? "lead");
  const [reason, setReason] = useState("");
  const [endedOn, setEndedOn] = useState<string | null>(todayPrague());
  const [error, setError] = useState<string | null>(null);
  const save = useCommandMutation<Input, Result>("klienti.setStatus");
  const former = status === "former";
  const missing = former && !reason.trim();

  async function submit() {
    setError(null);
    try {
      const r = await save.mutateAsync({
        companyId,
        status,
        ...(former ? { reason: reason.trim(), ...(endedOn ? { endedOn } : {}) } : {}),
      });
      successToast(
        r.changed ? `Stav změněn na ${CLIENT_STATUS_LABELS[status]}.` : "Stav se nezměnil.",
      );
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
      errorToast((e as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent
          title="Změnit stav klienta"
          description="Složka na Disku se podle stavu založí, archivuje nebo vrátí."
          className="top-[14vh] w-[min(32rem,calc(100vw-2rem))]"
        >
          <div className="space-y-3 px-5 py-4" data-testid="status-dialog">
            <SegmentedControl
              label="Stav klienta"
              value={status}
              onChange={(v) => setStatus(v as ClientStatus)}
              options={CLIENT_STATUSES.map((s) => ({ value: s, label: CLIENT_STATUS_LABELS[s] }))}
            />
            {former && (
              <div className="grid gap-x-3 sm:grid-cols-[1fr_11rem]">
                <Field label="Proč spolupráce skončila">
                  <Textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    placeholder="Např. přešli ke konkurenci, projekt dokončen"
                    data-testid="status-reason"
                  />
                </Field>
                <Field label="Ke dni">
                  <DatePicker value={endedOn} onChange={setEndedOn} clearable={false} />
                </Field>
              </div>
            )}
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 px-5 py-4">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Zpět
            </Button>
            <Button
              loading={save.isPending}
              disabled={missing || status === current}
              onClick={() => void submit()}
              data-testid="status-confirm"
            >
              Uložit stav
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
