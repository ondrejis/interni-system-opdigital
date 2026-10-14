"use client";

import { Chip, FormSection } from "@rebar/ui";
import { History } from "lucide-react";
import { CHANNEL_NAME, MODE_LABEL, REASON_LABEL, STATUS_LABEL, when } from "./labels";

export type DeliveryRow = {
  id: string;
  title: string;
  kind: string;
  channel: "push" | "email";
  status: string;
  mode: string;
  reason: string | null;
  attempts: number;
  createdAt: string;
  sentAt: string | null;
  devices: number | null;
};

/** Poslední upozornění pro mě a co se s nimi stalo (pomáhá najít, proč něco nedorazilo). Bez tajemství. */
export function DeliveryLog({ rows }: { rows: DeliveryRow[] }) {
  return (
    <FormSection
      title="Poslední doručení"
      icon={<History />}
      description="Co se s vašimi posledními upozorněními stalo. Když vám něco nedorazilo, tady uvidíte důvod."
      flush
    >
      {rows.length === 0 ? (
        <p className="px-5 pb-5 text-muted" data-testid="deliveries-empty">
          Zatím jste nedostali žádné upozornění.
        </p>
      ) : (
        <ul className="divide-y divide-line border-t border-line" data-testid="deliveries-list">
          {rows.map((d) => {
            const st = STATUS_LABEL[d.status] ?? { label: d.status, color: "gray" };
            return (
              <li
                key={d.id}
                data-created-at={d.createdAt}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5"
              >
                <span
                  className="w-24 shrink-0 text-sm tabular text-faint"
                  data-testid="delivery-when"
                >
                  {when(d.createdAt)}
                </span>
                <span className="min-w-0 flex-1 basis-48 truncate">{d.title}</span>
                <span className="text-sm text-muted">{CHANNEL_NAME[d.channel]}</span>
                <Chip color={st.color}>{st.label}</Chip>
                <span className="basis-full text-sm text-muted @2xl:basis-auto">
                  {d.reason
                    ? (REASON_LABEL[d.reason] ?? d.reason)
                    : d.mode !== "instant"
                      ? MODE_LABEL[d.mode]
                      : ""}
                  {d.status === "sent" && d.devices
                    ? ` · ${d.devices} ${d.devices === 1 ? "zařízení" : "zařízení"}`
                    : ""}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </FormSection>
  );
}
