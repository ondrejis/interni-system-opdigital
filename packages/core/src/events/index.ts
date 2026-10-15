import type {
  DomainActor,
  DomainEvent,
  DomainEventEntity,
  DomainEventMap,
  DomainEventName,
} from "../contracts/events";
import { newId } from "../db/ids";
import type { ModuleDeps } from "../modules/server";
import type { Ctx } from "../rbac/types";
import { enqueueWebhookDeliveries } from "../webhooks/outbox";

export type { DomainEvent, DomainEventMap, DomainEventName } from "../contracts/events";
export { WEBHOOK_EVENTS } from "../contracts/events";

/** Obsluha doménové události v modulu (`ModuleServer.eventHandlers`); běží v transakci emitenta, chyba ji vrátí. */
export type DomainEventHandler<K extends DomainEventName = DomainEventName> = (
  ctx: Ctx,
  event: DomainEvent<K>,
  deps: ModuleDeps,
) => Promise<void>;

/** Obsluhy zapnutých modulů podle názvu události (v pořadí modulů). */
export type DomainEventHandlers = Partial<Record<DomainEventName, readonly DomainEventHandler[]>>;

type Bus = { handlers: DomainEventHandlers; deps: () => ModuleDeps };
const g = globalThis as { __domainEvents?: Bus }; // globálně: Next bundluje route handlery zvlášť

/**
 * Zaregistruje obsluhy událostí zapnutých modulů a továrnu na `ModuleDeps` (aplikace a worker při startu, testy
 * podle potřeby). Bez registrace `emitDomain` jen vytvoří událost a nikomu ji nepředá.
 */
export function setDomainEvents(
  handlers: DomainEventHandlers | undefined,
  deps: (() => ModuleDeps) | undefined,
): void {
  if (!handlers || !deps) delete g.__domainEvents;
  else g.__domainEvents = { handlers, deps };
}

function actorOf(ctx: Ctx): DomainActor {
  if (ctx.actor.kind === "user") return { kind: "user", id: ctx.actor.userId };
  return { kind: "system", id: null, ...(ctx.actor.kind === "agency" ? { label: "agency" } : {}) };
}

/**
 * Vyšle doménovou událost (D §2.1). Volat v transakci změny (`inTx`), aby handlery a webhooky vznikly atomicky se
 * změnou: (1) zavolá `eventHandlers` zapnutých modulů v pořadí modulů (chyba handleru propadne a vrátí transakci),
 * (2) je-li událost ve `WEBHOOK_EVENTS`, zapíše řádky `webhook_delivery` endpointům, které ji odebírají (soukromé záznamy
 * jen endpointům `include_private`), (3) doplní C3 (`pg_notify` pro realtime).
 * `meta.entity.isPrivate` rozhoduje o webhookách a realtime; `meta.actor` přebije aktéra z `ctx` (n8n, Google, Meta).
 */
export async function emitDomain<K extends DomainEventName>(
  ctx: Ctx,
  name: K,
  data: DomainEventMap[K],
  meta: { entity: DomainEventEntity; previous?: Partial<DomainEventMap[K]>; actor?: DomainActor },
): Promise<void> {
  const event: DomainEvent<K> = {
    id: newId(),
    name,
    occurredAt: new Date().toISOString(),
    actor: meta.actor ?? actorOf(ctx),
    entity: meta.entity,
    data,
    ...(meta.previous !== undefined ? { previous: meta.previous } : {}),
  };
  // (1) obsluhy zapnutých modulů: chyba propadne a vrátí transakci emitenta
  const bus = g.__domainEvents;
  const handlers = (bus?.handlers[name] ?? []) as readonly DomainEventHandler<K>[];
  if (bus && handlers.length) {
    const deps = bus.deps();
    for (const handler of handlers) await handler(ctx, event, deps);
  }
  // (2) outbox webhooků (C2): řádky `webhook_delivery` vznikají v téže transakci, odešle je worker po commitu;
  // chyba zápisu se jen nahlásí a změnu nezruší
  await enqueueWebhookDeliveries(ctx, event as unknown as DomainEvent);
  // (3) sem patří `pg_notify('opsys_change')` pro realtime (C3)
}
