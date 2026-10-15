import { and, count, eq, gte, isNull, max, min, sql } from "drizzle-orm";
import { schema } from "../db/client";
import { PermissionError } from "../rbac/errors";
import { can } from "../rbac/permissions";
import type { Ctx } from "../rbac/types";
import { visibleDeliveries } from "../webhooks/endpoints";
import type { CredentialInfo } from "./credentials";
import { createCredentialStore } from "./credentials";
import type { Cipher } from "../security/crypto";

/*
  Stav integrací pro Nastavení → Integrace a Nastavení → Systém (NFR-13): jedna funkce, aby obě stránky ukazovaly totéž.
  Obsahuje jen počty a časy, nikdy obsah zpráv ani tajemství.
*/

/** Stav odchozích webhooků. */
export type WebhookStatus = {
  endpointsActive: number;
  endpointsTotal: number;
  pending: number;
  failed: number;
  delivered24h: number;
  oldestPendingAt: string | null;
  lastDeliveredAt: string | null;
};

/** Stav jednoho příchozího zdroje (`drive`, `leads`). */
export type InboundSourceStatus = {
  source: string;
  lastReceivedAt: string | null;
  lastProcessedAt: string | null;
  failedTotal: number;
  failed24h: number;
};

/** Souhrn stavu integrací. */
export type IntegrationStatus = {
  webhooks: WebhookStatus;
  inbound: InboundSourceStatus[];
  credentials: CredentialInfo[];
  /** Je potřeba zásah správce (chybná doručení, selhané příchozí, přístup vyžaduje nové přihlášení)? */
  problems: number;
};

const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;

/** Souhrn stavu integrací; smí `settings.integrations` nebo `settings.manage`. Soukromá doručení vidí jen `private.read`. */
export async function getIntegrationStatus(ctx: Ctx, cipher: Cipher): Promise<IntegrationStatus> {
  if (!can(ctx, "settings.integrations") && !can(ctx, "settings.manage"))
    throw new PermissionError();
  const db = ctx.db;
  const since = new Date(Date.now() - 86_400_000);
  const visible = visibleDeliveries(ctx);

  const endpoints = await db
    .select({ active: schema.webhookEndpoint.active, n: count() })
    .from(schema.webhookEndpoint)
    .where(isNull(schema.webhookEndpoint.deletedAt))
    .groupBy(schema.webhookEndpoint.active);
  const deliveries = await db
    .select({
      status: schema.webhookDelivery.status,
      n: count(),
      oldest: min(schema.webhookDelivery.createdAt),
      lastDelivered: max(schema.webhookDelivery.deliveredAt),
    })
    .from(schema.webhookDelivery)
    .where(visible)
    .groupBy(schema.webhookDelivery.status);
  const [recent] = await db
    .select({ n: count() })
    .from(schema.webhookDelivery)
    .where(
      and(
        eq(schema.webhookDelivery.status, "delivered"),
        gte(schema.webhookDelivery.deliveredAt, since),
        visible,
      ),
    );
  const row = (s: string) => deliveries.find((d) => d.status === s);

  const inbound = await db
    .select({
      source: schema.inboundEvent.source,
      lastReceivedAt: max(schema.inboundEvent.receivedAt),
      lastProcessedAt: max(
        sql<Date | null>`case when ${schema.inboundEvent.status} = 'processed' then ${schema.inboundEvent.processedAt} end`,
      ),
      failedTotal: count(sql`case when ${schema.inboundEvent.status} = 'failed' then 1 end`),
      failed24h: count(
        sql`case when ${schema.inboundEvent.status} = 'failed' and ${schema.inboundEvent.receivedAt} >= ${since.toISOString()}::timestamptz then 1 end`,
      ),
    })
    .from(schema.inboundEvent)
    .groupBy(schema.inboundEvent.source)
    .orderBy(schema.inboundEvent.source);

  const credentials = await createCredentialStore(cipher).list(ctx);

  const webhooks: WebhookStatus = {
    endpointsActive: endpoints.find((e) => e.active)?.n ?? 0,
    endpointsTotal: endpoints.reduce((s, e) => s + e.n, 0),
    pending: row("pending")?.n ?? 0,
    failed: row("failed")?.n ?? 0,
    delivered24h: recent?.n ?? 0,
    oldestPendingAt: iso(row("pending")?.oldest),
    lastDeliveredAt: iso(row("delivered")?.lastDelivered),
  };
  const inboundOut = inbound.map((r) => ({
    source: r.source,
    lastReceivedAt: iso(r.lastReceivedAt),
    lastProcessedAt: iso(r.lastProcessedAt ? new Date(r.lastProcessedAt) : null),
    failedTotal: r.failedTotal,
    failed24h: r.failed24h,
  }));
  return {
    webhooks,
    inbound: inboundOut,
    credentials,
    problems:
      webhooks.failed +
      inboundOut.reduce((s, r) => s + r.failed24h, 0) +
      credentials.filter((c) => c.status !== "ok").length,
  };
}
