"use client";

import {
  Button,
  Chip,
  Dialog,
  DialogContent,
  FormSection,
  SegmentedControl,
  errorToast,
  successToast,
  type SegmentOption,
} from "@rebar/ui";
import type { DeliveryRow, EndpointRow } from "@rebar/core/webhooks";
import { Eye, History, RefreshCw, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { runAction } from "@/lib/run-action";
import { SettingsTable } from "../_shared/settings-table";
import { formatDateTime } from "../_shared/format";
import { deliveryPayloadAction, retryAllFailedAction, retryDeliveryAction } from "./actions";

type StatusFilter = "all" | DeliveryRow["status"];

const STATUS_OPTIONS: SegmentOption<StatusFilter>[] = [
  { value: "all", label: "Vše" },
  { value: "failed", label: "Chyby" },
  { value: "pending", label: "Čeká" },
  { value: "delivered", label: "Doručeno" },
];

/** Stav doručení jako štítek (barva nese význam). */
export function DeliveryStatus({ d }: { d: Pick<DeliveryRow, "status"> }) {
  return d.status === "delivered" ? (
    <Chip color="green" dot>
      Doručeno
    </Chip>
  ) : d.status === "failed" ? (
    <Chip color="red" dot>
      Chyba
    </Chip>
  ) : (
    <Chip color="orange" dot>
      Čeká
    </Chip>
  );
}

/** Doručení webhooků: nejnovější nahoře, filtr podle stavu a webhooku, ruční opakování chybných, kontrola těla zprávy. */
export function DeliveriesSection({
  deliveries,
  endpoints,
  eventLabels,
}: {
  deliveries: DeliveryRow[];
  endpoints: EndpointRow[];
  /** Český popisek události podle názvu (server ho zná z katalogu; klient nesmí importovat serverový kód). */
  eventLabels: Record<string, string>;
}) {
  const router = useRouter();
  const webhookEventLabel = (name: string) => eventLabels[name] ?? name;
  const [status, setStatus] = useState<StatusFilter>("all");
  const [endpointId, setEndpointId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [payload, setPayload] = useState<{ title: string; json: string } | null>(null);

  const rows = useMemo(
    () =>
      deliveries.filter(
        (d) =>
          (status === "all" || d.status === status) && (!endpointId || d.endpointId === endpointId),
      ),
    [deliveries, status, endpointId],
  );
  const failed = deliveries.filter((d) => d.status === "failed").length;

  async function retry(d: DeliveryRow) {
    setBusy(d.id);
    const r = await runAction(retryDeliveryAction({ id: d.id }));
    setBusy(null);
    if (!r) return;
    if (r.data?.outcome === "delivered") successToast("Znovu odesláno a doručeno.");
    else if (r.data) errorToast(`Odeslání se znovu nepovedlo. ${r.data.error ?? ""}`.trim());
    router.refresh();
  }

  async function retryAll() {
    setBusy("all");
    const r = await runAction(retryAllFailedAction(endpointId ? { endpointId } : {}));
    setBusy(null);
    if (r) {
      successToast(
        r.data.count
          ? `Vráceno do fronty: ${r.data.count}. Odešle je worker do minuty.`
          : "Žádné chybné doručení.",
      );
      router.refresh();
    }
  }

  async function show(d: DeliveryRow) {
    const r = await runAction(deliveryPayloadAction({ id: d.id }));
    if (r)
      setPayload({ title: `${webhookEventLabel(d.event)} · ${d.endpointName}`, json: r.data.json });
  }

  return (
    <FormSection
      title="Doručení webhooků"
      description="Každý pokus o doručení se zapisuje. Chybné doručení se opakuje za 1 min, 5 min, 15 min, 30 min a 1 h; potom zůstane jako chyba a jde poslat ručně."
      icon={<History />}
      flush
      badge={
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => router.refresh()} aria-label="Obnovit seznam doručení">
            <RefreshCw /> Obnovit
          </Button>
          <Button
            disabled={failed === 0}
            loading={busy === "all"}
            onClick={() => void retryAll()}
            data-testid="retry-all-failed"
          >
            <RotateCcw /> Opakovat všechna chybná{failed ? ` (${failed})` : ""}
          </Button>
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
        <SegmentedControl
          label="Stav doručení"
          value={status}
          onChange={setStatus}
          options={STATUS_OPTIONS}
        />
        {endpoints.length > 1 && (
          <select
            aria-label="Webhook"
            value={endpointId}
            onChange={(e) => setEndpointId(e.target.value)}
            className="h-8 rounded-md border border-line-strong bg-bg px-2 text-base"
          >
            <option value="">Všechny webhooky</option>
            {endpoints.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-5 text-muted" data-testid="deliveries-empty">
          {deliveries.length === 0
            ? "Zatím nic nebylo odesláno. Zkuste „Odeslat test“ u webhooku."
            : "Žádné doručení neodpovídá filtru."}
        </p>
      ) : (
        <SettingsTable
          label="Doručení webhooků"
          testId="deliveries-table"
          rows={rows}
          rowKey={(d) => d.id}
          columns={[
            {
              key: "when",
              header: "Čas",
              primary: true,
              cell: (d) => <span className="tabular">{formatDateTime(d.createdAt)}</span>,
            },
            {
              key: "event",
              header: "Událost",
              cell: (d) => (
                <span>
                  {webhookEventLabel(d.event)}
                  {d.isPrivate && (
                    <Chip color="purple" className="ml-2">
                      Soukromé
                    </Chip>
                  )}
                </span>
              ),
            },
            {
              key: "ep",
              header: "Webhook",
              cell: (d) => <span className="text-muted">{d.endpointName}</span>,
            },
            { key: "status", header: "Stav", cell: (d) => <DeliveryStatus d={d} /> },
            {
              key: "attempts",
              header: "Pokusy",
              cell: (d) => (
                <span className="tabular text-muted">
                  {d.attempts}
                  {d.status === "pending" && d.attempts > 0 && (
                    <span className="block text-xs text-faint">
                      další {formatDateTime(d.nextAttemptAt)}
                    </span>
                  )}
                  {d.status === "delivered" && d.deliveredAt && (
                    <span className="block text-xs text-faint">
                      {formatDateTime(d.deliveredAt)}
                    </span>
                  )}
                </span>
              ),
            },
            {
              key: "error",
              header: "Poslední chyba",
              cell: (d) =>
                d.lastError ? (
                  <span
                    className="block max-w-80 break-words text-sm text-danger"
                    title={d.lastError}
                  >
                    {d.lastError.replace(/^\S+ · /, "")}
                  </span>
                ) : (
                  <span className="text-faint">—</span>
                ),
            },
          ]}
          actions={(d) => (
            <span className="flex items-center gap-1">
              {d.status === "failed" && (
                <Button size="sm" loading={busy === d.id} onClick={() => void retry(d)}>
                  <RotateCcw /> Opakovat
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void show(d)}
                aria-label="Zobrazit tělo zprávy"
              >
                <Eye /> Tělo
              </Button>
            </span>
          )}
        />
      )}

      <Dialog open={!!payload} onOpenChange={(o) => !o && setPayload(null)}>
        <DialogContent
          title="Tělo zprávy"
          {...(payload ? { description: payload.title } : {})}
          className="w-[min(44rem,calc(100vw-2rem))]"
        >
          <pre className="max-h-[60vh] overflow-auto px-5 py-4 font-mono text-xs">
            {payload?.json}
          </pre>
        </DialogContent>
      </Dialog>
    </FormSection>
  );
}
