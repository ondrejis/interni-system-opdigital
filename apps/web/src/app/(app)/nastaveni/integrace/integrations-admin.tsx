"use client";

import { Chip, FormSection, SettingsPage, Slot } from "@rebar/ui";
import type { InboundEventRow } from "@rebar/core/ingest";
import type { IntegrationStatus } from "@rebar/core/integrations";
import type {
  DeliveryRow,
  EndpointRow,
  WebhookEventGroup,
} from "@rebar/core/webhooks";
import { Activity, Plug } from "lucide-react";
import { formatDateTime } from "../_shared/format";
import { DeliveriesSection } from "./deliveries-section";
import { HelpSection } from "./help-section";
import { IngestSection, type IngestInfo } from "./ingest-section";
import { WebhooksSection } from "./webhooks-section";

const PROVIDER_LABEL: Record<string, string> = {
  google: "Google",
  meta: "Meta",
  fakturoid: "Fakturoid",
};

/** Souhrn stavu nahoře: co je v pořádku a co čeká na zásah správce. */
function StatusSummary({ status }: { status: IntegrationStatus }) {
  const w = status.webhooks;
  return (
    <FormSection
      title="Stav integrací"
      description="Souhrn odchozích webhooků, příchozích požadavků a uložených přístupů."
      icon={<Activity />}
      badge={
        status.problems > 0 ? (
          <Chip color="red" dot>
            {status.problems} vyžaduje pozornost
          </Chip>
        ) : (
          <Chip color="green" dot>
            Vše v pořádku
          </Chip>
        )
      }
    >
      <dl
        data-testid="integration-status"
        className="grid gap-x-6 gap-y-3 text-base @lg:grid-cols-3"
      >
        <div>
          <dt className="text-sm text-muted">Odchozí webhooky</dt>
          <dd>
            {w.endpointsTotal === 0
              ? "Žádný webhook není nastavený."
              : `${w.endpointsActive} z ${w.endpointsTotal} aktivních`}
          </dd>
          <dd className="text-sm text-muted tabular">
            {w.pending} čeká · {w.failed} chybných · {w.delivered24h} doručeno za 24 h
          </dd>
          {w.lastDeliveredAt && (
            <dd className="text-sm text-faint">Poslední doručení {formatDateTime(w.lastDeliveredAt)}</dd>
          )}
        </div>
        <div>
          <dt className="text-sm text-muted">Příchozí požadavky</dt>
          {status.inbound.length === 0 ? (
            <dd>Zatím nic nepřišlo.</dd>
          ) : (
            status.inbound.map((s) => (
              <dd key={s.source}>
                <span className="font-medium">{s.source}</span>
                <span className="text-sm text-muted tabular">
                  {" "}
                  · poslední {formatDateTime(s.lastReceivedAt)}
                  {s.failed24h > 0 ? ` · ${s.failed24h} selhání za 24 h` : ""}
                </span>
              </dd>
            ))
          )}
        </div>
        <div>
          <dt className="text-sm text-muted">Uložené přístupy</dt>
          {status.credentials.length === 0 ? (
            <dd>Žádné.</dd>
          ) : (
            status.credentials.map((c) => (
              <dd key={c.id} className="flex items-center gap-2">
                {PROVIDER_LABEL[c.provider] ?? c.provider}
                {c.status === "ok" ? (
                  <Chip color="green">Funguje</Chip>
                ) : c.status === "reauth" ? (
                  <Chip color="orange">Vyžaduje nové přihlášení</Chip>
                ) : (
                  <Chip color="red">Chyba</Chip>
                )}
              </dd>
            ))
          )}
        </div>
      </dl>
    </FormSection>
  );
}

/** Stránka Nastavení → Integrace (viz `page.tsx`). */
export function IntegrationsAdmin({
  endpoints,
  deliveries,
  inbound,
  status,
  ingest,
  eventGroups,
  eventLabels,
  canSeePrivate,
}: {
  endpoints: EndpointRow[];
  deliveries: DeliveryRow[];
  inbound: InboundEventRow[];
  status: IntegrationStatus;
  ingest: IngestInfo;
  eventGroups: WebhookEventGroup[];
  eventLabels: Record<string, string>;
  canSeePrivate: boolean;
}) {
  return (
    <SettingsPage
      width="xl"
      title="Integrace"
      description="Napojení OPSYS na n8n a další služby: odchozí webhooky, příchozí požadavky a stav ARES, Meta a Fakturoid."
      icon={<Plug />}
    >
      <StatusSummary status={status} />
      <WebhooksSection
        endpoints={endpoints}
        eventGroups={eventGroups}
        canSeePrivate={canSeePrivate}
      />
      <DeliveriesSection deliveries={deliveries} endpoints={endpoints} eventLabels={eventLabels} />
      <IngestSection ingest={ingest} inbound={inbound} />
      <HelpSection baseUrl={ingest.baseUrl} sources={ingest.sources} />
      {/* panely dalších integrací (ARES, Meta, Fakturoid) přispívají moduly; hostitel o nich neví */}
      <Slot name="settings.integrations" />
    </SettingsPage>
  );
}
