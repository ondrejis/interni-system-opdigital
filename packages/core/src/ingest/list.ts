import { and, desc, eq } from "drizzle-orm";
import { schema } from "../db/client";
import { assertCan } from "../rbac/permissions";
import type { Ctx } from "../rbac/types";

/** Příchozí událost pro seznam v Nastavení → Integrace (bez těla, to může nést osobní údaje z leadů). */
export type InboundEventRow = {
  id: string;
  source: string;
  externalId: string;
  status: "received" | "processed" | "failed";
  error: string | null;
  entityType: string | null;
  entityId: string | null;
  receivedAt: string;
  processedAt: string | null;
};

/** Příchozí události (nejnovější první); filtr podle zdroje a stavu. Jen se `settings.integrations`. */
export async function listInboundEvents(
  ctx: Ctx,
  filter: {
    source?: string | undefined;
    status?: InboundEventRow["status"] | undefined;
    limit?: number | undefined;
  } = {},
): Promise<InboundEventRow[]> {
  assertCan(ctx, "settings.integrations");
  const rows = await ctx.db
    .select({
      id: schema.inboundEvent.id,
      source: schema.inboundEvent.source,
      externalId: schema.inboundEvent.externalId,
      status: schema.inboundEvent.status,
      error: schema.inboundEvent.error,
      entityType: schema.inboundEvent.entityType,
      entityId: schema.inboundEvent.entityId,
      receivedAt: schema.inboundEvent.receivedAt,
      processedAt: schema.inboundEvent.processedAt,
    })
    .from(schema.inboundEvent)
    .where(
      and(
        filter.source ? eq(schema.inboundEvent.source, filter.source) : undefined,
        filter.status ? eq(schema.inboundEvent.status, filter.status) : undefined,
      ),
    )
    .orderBy(desc(schema.inboundEvent.receivedAt), desc(schema.inboundEvent.id))
    .limit(Math.min(filter.limit ?? 50, 200));
  return rows.map((r) => ({
    ...r,
    receivedAt: r.receivedAt.toISOString(),
    processedAt: r.processedAt?.toISOString() ?? null,
  }));
}
