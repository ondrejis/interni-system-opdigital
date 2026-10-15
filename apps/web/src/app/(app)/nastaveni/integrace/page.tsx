import { getIngestSecretStatus, listInboundEvents } from "@rebar/core/ingest";
import { getIntegrationStatus } from "@rebar/core/integrations";
import { can } from "@rebar/core/rbac";
import {
  listDeliveries,
  listEndpoints,
  webhookEventGroups,
  webhookEventLabel,
} from "@rebar/core/webhooks";
import { requireCan } from "@/server/request";
import { getServices } from "@/server/services";
import { IntegrationsAdmin } from "./integrations-admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Integrace" };

/**
 * Nastavení → Integrace: webhooky do n8n (adresa, události, podpis, test, doručení a ruční opakování), příchozí
 * požadavky z n8n (tajemství, zdroje, protokol) a panely dalších integrací (ARES, Meta, Fakturoid) ze slotu
 * `settings.integrations`.
 */
export default async function Page() {
  const ctx = await requireCan("settings.integrations");
  const s = getServices();
  const [endpoints, deliveries, inbound, status, ingestSecret] = await Promise.all([
    listEndpoints(ctx),
    listDeliveries(ctx, { limit: 100 }),
    listInboundEvents(ctx, { limit: 50 }),
    getIntegrationStatus(ctx, s.cipher),
    getIngestSecretStatus(ctx),
  ]);
  const eventGroups = webhookEventGroups();
  const eventLabels: Record<string, string> = {
    "webhook.test": webhookEventLabel("webhook.test"),
    ...Object.fromEntries(eventGroups.flatMap((g) => g.events.map((e) => [e.name, e.label]))),
  };
  return (
    <IntegrationsAdmin
      endpoints={endpoints}
      deliveries={deliveries}
      inbound={inbound}
      status={status}
      ingest={{
        ...ingestSecret,
        baseUrl: s.env.APP_URL.replace(/\/$/, ""),
        sources: [...new Set(s.collected.ingests.map((i) => i.source))].sort(),
      }}
      eventGroups={eventGroups}
      eventLabels={eventLabels}
      canSeePrivate={can(ctx, "private.read")}
    />
  );
}
