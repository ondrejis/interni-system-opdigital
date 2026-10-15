import { and, eq, isNull, sql } from "drizzle-orm";
import { WEBHOOK_EVENTS, type DomainEvent } from "../contracts/events";
import { schema } from "../db/client";
import { captureError } from "../observability";
import type { Ctx } from "../rbac/types";
import { matchesEvent } from "./events";

/** Kanál `NOTIFY`: worker po něm hned (bez čekání na minutový plán) spustí doručování. */
export const WEBHOOK_NOTIFY_CHANNEL = "opsys_webhook";

/** Tělo webhooku: událost tak, jak ji vidí handlery, doplněná o záznam, ke kterému se vztahuje (`entity.isPrivate`). */
export type WebhookEnvelope = {
  id: string;
  event: string;
  occurredAt: string;
  actor: DomainEvent["actor"];
  entity: DomainEvent["entity"];
  data: unknown;
  previous?: unknown;
};

/** Obálka webhooku z doménové události (JSON-bezpečná kopie: data, která nejdou serializovat, vyhodí chybu). */
export function webhookEnvelope(event: DomainEvent): WebhookEnvelope {
  return JSON.parse(
    JSON.stringify({
      id: event.id,
      event: event.name,
      occurredAt: event.occurredAt,
      actor: event.actor,
      entity: event.entity,
      data: event.data,
      ...(event.previous !== undefined ? { previous: event.previous } : {}),
    }),
  ) as WebhookEnvelope;
}

/**
 * Outbox: v transakci změny zapíše řádek `webhook_delivery` každému aktivnímu endpointu, který událost odebírá
 * (a smí ji dostat: soukromé záznamy jen endpointům `include_private`). Samotné odeslání dělá worker po potvrzení
 * transakce; `pg_notify` se doručí až při commitu, takže se neodešle nic, co se nepotvrdilo.
 *
 * Zápis běží ve vnořené transakci (savepoint) a jeho chyba se jen nahlásí: webhooky jsou vedlejší účinek změny a
 * nikdy ji nesmí zrušit (NFR-13). Vrací počet vytvořených doručení.
 */
export async function enqueueWebhookDeliveries(ctx: Ctx, event: DomainEvent): Promise<number> {
  if (!(WEBHOOK_EVENTS as readonly string[]).includes(event.name)) return 0;
  try {
    return await ctx.db.transaction(async (tx) => {
      const endpoints = await tx
        .select({
          id: schema.webhookEndpoint.id,
          events: schema.webhookEndpoint.events,
          includePrivate: schema.webhookEndpoint.includePrivate,
        })
        .from(schema.webhookEndpoint)
        .where(
          and(eq(schema.webhookEndpoint.active, true), isNull(schema.webhookEndpoint.deletedAt)),
        );
      const targets = endpoints.filter(
        (e) => matchesEvent(e.events, event.name) && (!event.entity.isPrivate || e.includePrivate),
      );
      if (!targets.length) return 0;
      const payload = webhookEnvelope(event) as unknown as Record<string, unknown>;
      await tx
        .insert(schema.webhookDelivery)
        .values(
          targets.map((e) => ({
            endpointId: e.id,
            eventId: event.id,
            event: event.name,
            payload,
          })),
        )
        .onConflictDoNothing();
      await tx.execute(sql`select pg_notify(${WEBHOOK_NOTIFY_CHANNEL}, ${event.id})`);
      return targets.length;
    });
  } catch (err) {
    captureError(err, { where: "webhooks.enqueue", event: event.name });
    return 0;
  }
}
