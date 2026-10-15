import { and, count, desc, eq, inArray, isNull, max, sql, type SQL } from "drizzle-orm";
import { diffRecords, recordAudit } from "../audit/audit";
import { schema } from "../db/client";
import { newId } from "../db/ids";
import { NotFoundError, UserError } from "../rbac/errors";
import { inTx } from "../rbac/context";
import { assertCan, can } from "../rbac/permissions";
import type { Ctx } from "../rbac/types";
import { randomToken, type Cipher } from "../security/crypto";
import { attemptDelivery, claimDelivery, type DeliverDeps, type DeliverResult } from "./deliver";
import { isValidEventPattern } from "./events";
import { WEBHOOK_NOTIFY_CHANNEL, webhookEnvelope } from "./outbox";
import { parseWebhookUrl } from "./url";

/*
  Správa odchozích webhooků v Nastavení → Integrace (oprávnění `settings.integrations`): endpointy, jejich tajemství,
  zkušební webhook, seznam doručení a ruční opakování chybných. Tajemství endpointu se vrací jen při vytvoření nebo
  výměně; v databázi je zašifrované a do auditu ani do odpovědí se jinak nedostane.
*/

const PERMISSION = "settings.integrations";

/** Údaje endpointu, které zadává správce. */
export type EndpointInput = {
  name: string;
  url: string;
  events: readonly string[];
  includePrivate: boolean;
};

/** Endpoint pro seznam v Nastavení (bez tajemství) s počty doručení. */
export type EndpointRow = {
  id: string;
  name: string;
  url: string;
  events: string[];
  includePrivate: boolean;
  active: boolean;
  createdAt: string;
  counts: { pending: number; delivered: number; failed: number };
  lastDeliveredAt: string | null;
};

/** Doručení pro seznam (bez těla zprávy). */
export type DeliveryRow = {
  id: string;
  endpointId: string;
  endpointName: string;
  eventId: string;
  event: string;
  status: "pending" | "delivered" | "failed";
  attempts: number;
  nextAttemptAt: string;
  lastError: string | null;
  deliveredAt: string | null;
  createdAt: string;
  isPrivate: boolean;
};

/** Nové tajemství endpointu (`whsec_…`, 256 bitů). */
export function generateWebhookSecret(): string {
  return `whsec_${randomToken(32)}`;
}

function normalize(input: EndpointInput): EndpointInput {
  const name = input.name.trim();
  if (name.length < 2) throw new UserError("Vyplňte název webhooku (alespoň 2 znaky).");
  if (name.length > 80) throw new UserError("Název webhooku je příliš dlouhý.");
  const url = parseWebhookUrl(input.url).toString();
  const events = [...new Set(input.events)];
  if (!events.length) throw new UserError("Vyberte aspoň jednu událost.");
  const bad = events.find((e) => !isValidEventPattern(e));
  if (bad) throw new UserError(`Neznámá událost „${bad}“.`);
  return { name, url, events, includePrivate: input.includePrivate };
}

/** Viditelnost doručení: kdo nesmí vidět soukromé záznamy, nevidí ani doručení jejich událostí. */
export function visibleDeliveries(ctx: Ctx): SQL | undefined {
  return can(ctx, "private.read")
    ? undefined
    : sql`coalesce((${schema.webhookDelivery.payload} -> 'entity' ->> 'isPrivate')::boolean, false) = false`;
}

/**
 * Endpoint pro soukromá data (`include_private`) smí vidět a měnit jen ten, kdo smí soukromé záznamy: kdo může změnit
 * jeho adresu, mohl by si soukromá data nechat poslat k sobě.
 */
function visibleEndpoints(ctx: Ctx): SQL | undefined {
  return can(ctx, "private.read") ? undefined : eq(schema.webhookEndpoint.includePrivate, false);
}

/** Zakázat nastavit soukromá data tomu, kdo je sám nesmí vidět. */
function assertMayRoutePrivate(ctx: Ctx, input: { includePrivate: boolean }): void {
  if (input.includePrivate && !can(ctx, "private.read"))
    throw new UserError("Soukromá data smí na webhook posílat jen ten, kdo je smí vidět.");
}

/** Seznam endpointů (bez smazaných) s počty doručení. */
export async function listEndpoints(ctx: Ctx): Promise<EndpointRow[]> {
  assertCan(ctx, PERMISSION);
  const endpoints = await ctx.db
    .select()
    .from(schema.webhookEndpoint)
    .where(and(isNull(schema.webhookEndpoint.deletedAt), visibleEndpoints(ctx)))
    .orderBy(schema.webhookEndpoint.createdAt);
  if (!endpoints.length) return [];
  const stats = await ctx.db
    .select({
      endpointId: schema.webhookDelivery.endpointId,
      status: schema.webhookDelivery.status,
      n: count(),
      lastDelivered: max(schema.webhookDelivery.deliveredAt),
    })
    .from(schema.webhookDelivery)
    .where(
      and(
        inArray(
          schema.webhookDelivery.endpointId,
          endpoints.map((e) => e.id),
        ),
        visibleDeliveries(ctx),
      ),
    )
    .groupBy(schema.webhookDelivery.endpointId, schema.webhookDelivery.status);
  return endpoints.map((e) => {
    const mine = stats.filter((s) => s.endpointId === e.id);
    const n = (status: string) => mine.find((s) => s.status === status)?.n ?? 0;
    const last = mine.map((s) => s.lastDelivered).filter((d): d is Date => !!d);
    return {
      id: e.id,
      name: e.name,
      url: e.url,
      events: e.events,
      includePrivate: e.includePrivate,
      active: e.active,
      createdAt: e.createdAt.toISOString(),
      counts: { pending: n("pending"), delivered: n("delivered"), failed: n("failed") },
      lastDeliveredAt: last.length
        ? new Date(Math.max(...last.map((d) => d.getTime()))).toISOString()
        : null,
    };
  });
}

/** Založí endpoint. Vrací i tajemství pro podpis: zobrazí se jen jednou, potom už nejde zjistit (jen vyměnit). */
export async function createEndpoint(
  ctx: Ctx,
  cipher: Cipher,
  input: EndpointInput,
): Promise<{ id: string; secret: string }> {
  assertCan(ctx, PERMISSION);
  assertMayRoutePrivate(ctx, input);
  const v = normalize(input);
  const secret = generateWebhookSecret();
  return inTx(ctx, async (c) => {
    const id = newId();
    await c.db.insert(schema.webhookEndpoint).values({
      id,
      name: v.name,
      url: v.url,
      secretEnc: cipher.encrypt(secret),
      events: [...v.events],
      includePrivate: v.includePrivate,
      createdBy: c.actor.userId,
      updatedBy: c.actor.userId,
    });
    await recordAudit(c, {
      action: "create",
      entityType: "webhook_endpoint",
      entityId: id,
      summary: `Webhook „${v.name}“ přidán`,
      entityTitle: v.name,
      changes: diffRecords(null, {
        name: v.name,
        url: v.url,
        events: v.events,
        includePrivate: v.includePrivate,
      }),
    });
    return { id, secret };
  });
}

async function loadEndpoint(ctx: Ctx, id: string) {
  const [row] = await ctx.db
    .select()
    .from(schema.webhookEndpoint)
    .where(
      and(
        eq(schema.webhookEndpoint.id, id),
        isNull(schema.webhookEndpoint.deletedAt),
        visibleEndpoints(ctx),
      ),
    );
  if (!row) throw new NotFoundError("Webhook nenalezen.");
  return row;
}

/** Upraví endpoint (adresu, události, soukromá data, zapnutí). Tajemství zůstává. */
export async function updateEndpoint(
  ctx: Ctx,
  id: string,
  input: EndpointInput & { active: boolean },
): Promise<void> {
  assertCan(ctx, PERMISSION);
  assertMayRoutePrivate(ctx, input);
  const v = normalize(input);
  await inTx(ctx, async (c) => {
    const before = await loadEndpoint(c, id);
    const after = { ...v, active: input.active };
    await c.db
      .update(schema.webhookEndpoint)
      .set({ ...after, events: [...after.events], updatedBy: c.actor.userId })
      .where(eq(schema.webhookEndpoint.id, id));
    const pick = (r: typeof before) => ({
      name: r.name,
      url: r.url,
      events: r.events,
      includePrivate: r.includePrivate,
      active: r.active,
    });
    const changes = diffRecords(pick(before), after);
    if (changes.length)
      await recordAudit(c, {
        action: "update",
        entityType: "webhook_endpoint",
        entityId: id,
        summary: `Webhook „${v.name}“ upraven`,
        entityTitle: v.name,
        changes,
      });
  });
}

/** Vymění tajemství endpointu; vrací nové (zobrazí se jen jednou). Staré přestane platit hned. */
export async function rotateEndpointSecret(
  ctx: Ctx,
  cipher: Cipher,
  id: string,
): Promise<{ secret: string }> {
  assertCan(ctx, PERMISSION);
  const secret = generateWebhookSecret();
  await inTx(ctx, async (c) => {
    const row = await loadEndpoint(c, id);
    await c.db
      .update(schema.webhookEndpoint)
      .set({ secretEnc: cipher.encrypt(secret), updatedBy: c.actor.userId })
      .where(eq(schema.webhookEndpoint.id, id));
    await recordAudit(c, {
      action: "update",
      entityType: "webhook_endpoint",
      entityId: id,
      summary: `Webhook „${row.name}“: vyměněno tajemství podpisu`,
      entityTitle: row.name,
    });
  });
  return { secret };
}

/** Smaže endpoint; čekající doručení se označí jako chybná (jdou případně znovu poslat na jiný endpoint ručně). */
export async function deleteEndpoint(ctx: Ctx, id: string): Promise<void> {
  assertCan(ctx, PERMISSION);
  await inTx(ctx, async (c) => {
    const row = await loadEndpoint(c, id);
    await c.db
      .update(schema.webhookEndpoint)
      .set({ deletedAt: new Date(), deletedBy: c.actor.userId, active: false })
      .where(eq(schema.webhookEndpoint.id, id));
    await c.db
      .update(schema.webhookDelivery)
      .set({ status: "failed", lastError: `${new Date().toISOString()} · Endpoint byl smazán.` })
      .where(
        and(
          eq(schema.webhookDelivery.endpointId, id),
          eq(schema.webhookDelivery.status, "pending"),
        ),
      );
    await recordAudit(c, {
      action: "delete",
      entityType: "webhook_endpoint",
      entityId: id,
      summary: `Webhook „${row.name}“ smazán`,
      entityTitle: row.name,
    });
  });
}

/** Výsledek zkušebního webhooku (nebo okamžitého opakování) pro zobrazení správci. */
export type AttemptReport = {
  deliveryId: string;
  outcome: "delivered" | "retry" | "failed";
  error: string | null;
};

async function reportOf(
  ctx: Ctx,
  deliveryId: string,
  outcome: AttemptReport["outcome"],
): Promise<AttemptReport> {
  const [row] = await ctx.db
    .select({ lastError: schema.webhookDelivery.lastError })
    .from(schema.webhookDelivery)
    .where(eq(schema.webhookDelivery.id, deliveryId));
  return { deliveryId, outcome, error: outcome === "delivered" ? null : (row?.lastError ?? null) };
}

/**
 * „Odeslat test“: pošle endpointu zkušební událost `webhook.test` hned (bez opakování) a vrátí výsledek. Doručení se
 * zapíše do seznamu jako každé jiné, takže je vidět i podpis a odpověď serveru v chybě.
 */
export async function sendTestDelivery(
  ctx: Ctx,
  deps: Pick<DeliverDeps, "cipher" | "fetch" | "now">,
  endpointId: string,
): Promise<AttemptReport> {
  assertCan(ctx, PERMISSION);
  const endpoint = await loadEndpoint(ctx, endpointId);
  const eventId = newId();
  const envelope = webhookEnvelope({
    id: eventId,
    name: "webhook.test" as never,
    occurredAt: new Date().toISOString(),
    actor: { kind: "user", id: ctx.actor.userId },
    entity: { type: "webhook_endpoint", id: endpoint.id, isPrivate: false },
    data: {
      message: "Zkušební webhook z OPSYS. Pokud ho vidíte, adresa a podpis fungují.",
    } as never,
  });
  const [row] = await ctx.db
    .insert(schema.webhookDelivery)
    .values({
      endpointId,
      eventId,
      event: "webhook.test",
      payload: envelope as unknown as Record<string, unknown>,
      // rovnou „převzato“ tímto voláním (první a jediný pokus), aby ho nepřevzal worker
      attempts: 1,
      nextAttemptAt: new Date(Date.now() + 120_000),
    })
    .returning({ id: schema.webhookDelivery.id });
  const id = row!.id;
  const d: DeliverDeps = { ...deps, db: ctx.db };
  const outcome = await attemptDelivery(d, id, { maxAttempts: 1 });
  await recordAudit(ctx, {
    action: "test",
    entityType: "webhook_endpoint",
    entityId: endpointId,
    summary: `Webhook „${endpoint.name}“: odeslán zkušební požadavek`,
    entityTitle: endpoint.name,
  });
  return reportOf(ctx, id, outcome);
}

/** Filtr seznamu doručení. */
export type DeliveryFilter = {
  endpointId?: string | undefined;
  status?: "pending" | "delivered" | "failed" | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
};

/** Doručení (nejnovější první) bez těla zprávy; doručení soukromých událostí vidí jen ten, kdo smí soukromé. */
export async function listDeliveries(
  ctx: Ctx,
  filter: DeliveryFilter = {},
): Promise<DeliveryRow[]> {
  assertCan(ctx, PERMISSION);
  const rows = await ctx.db
    .select({
      id: schema.webhookDelivery.id,
      endpointId: schema.webhookDelivery.endpointId,
      endpointName: schema.webhookEndpoint.name,
      eventId: schema.webhookDelivery.eventId,
      event: schema.webhookDelivery.event,
      status: schema.webhookDelivery.status,
      attempts: schema.webhookDelivery.attempts,
      nextAttemptAt: schema.webhookDelivery.nextAttemptAt,
      lastError: schema.webhookDelivery.lastError,
      deliveredAt: schema.webhookDelivery.deliveredAt,
      createdAt: schema.webhookDelivery.createdAt,
      isPrivate: sql<boolean>`coalesce((${schema.webhookDelivery.payload} -> 'entity' ->> 'isPrivate')::boolean, false)`,
    })
    .from(schema.webhookDelivery)
    .innerJoin(
      schema.webhookEndpoint,
      eq(schema.webhookDelivery.endpointId, schema.webhookEndpoint.id),
    )
    .where(
      and(
        filter.endpointId ? eq(schema.webhookDelivery.endpointId, filter.endpointId) : undefined,
        filter.status ? eq(schema.webhookDelivery.status, filter.status) : undefined,
        visibleDeliveries(ctx),
      ),
    )
    .orderBy(desc(schema.webhookDelivery.createdAt), desc(schema.webhookDelivery.id))
    .limit(Math.min(filter.limit ?? 100, 500))
    .offset(filter.offset ?? 0);
  return rows.map((r) => ({
    ...r,
    nextAttemptAt: r.nextAttemptAt.toISOString(),
    deliveredAt: r.deliveredAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Tělo doručené (nebo čekající) zprávy pro kontrolu ve správě; soukromé jen s oprávněním `private.read`. */
export async function getDeliveryPayload(ctx: Ctx, id: string): Promise<Record<string, unknown>> {
  assertCan(ctx, PERMISSION);
  const [row] = await ctx.db
    .select({ payload: schema.webhookDelivery.payload })
    .from(schema.webhookDelivery)
    .where(and(eq(schema.webhookDelivery.id, id), visibleDeliveries(ctx)));
  if (!row) throw new NotFoundError("Doručení nenalezeno.");
  return row.payload;
}

/**
 * Ručně znovu odešle chybné doručení: vrátí ho do fronty s novými pěti opakováními. S `immediate` zkusí odeslání hned
 * a vrátí výsledek (jinak ho převezme worker do minuty). Zapíše se do auditu.
 */
export async function retryDelivery(
  ctx: Ctx,
  deps: Pick<DeliverDeps, "cipher" | "fetch" | "now">,
  id: string,
  { immediate = true }: { immediate?: boolean } = {},
): Promise<AttemptReport | null> {
  assertCan(ctx, PERMISSION);
  const requeued = await inTx(ctx, async (c) => {
    const [row] = await c.db
      .select({
        id: schema.webhookDelivery.id,
        event: schema.webhookDelivery.event,
        endpointId: schema.webhookDelivery.endpointId,
        status: schema.webhookDelivery.status,
      })
      .from(schema.webhookDelivery)
      .where(and(eq(schema.webhookDelivery.id, id), visibleDeliveries(c)));
    if (!row) throw new NotFoundError("Doručení nenalezeno.");
    if (row.status !== "failed")
      throw new UserError("Znovu jde odeslat jen doručení, které selhalo.");
    await c.db
      .update(schema.webhookDelivery)
      .set({ status: "pending", attempts: 0, nextAttemptAt: new Date() })
      .where(and(eq(schema.webhookDelivery.id, id), eq(schema.webhookDelivery.status, "failed")));
    await recordAudit(c, {
      action: "retry",
      entityType: "webhook_endpoint",
      entityId: row.endpointId,
      summary: `Ruční opakování doručení webhooku (${row.event})`,
    });
    if (!immediate) await c.db.execute(sql`select pg_notify(${WEBHOOK_NOTIFY_CHANNEL}, ${id})`);
    return row;
  });
  if (!immediate) return null;
  const d: DeliverDeps = { ...deps, db: ctx.db };
  if (!(await claimDelivery(ctx.db, requeued.id, deps.now?.() ?? new Date()))) return null;
  const outcome = await attemptDelivery(d, requeued.id);
  return reportOf(ctx, requeued.id, outcome);
}

/** Vrátí do fronty všechna chybná doručení (volitelně jednoho endpointu); odešle je worker. Vrací jejich počet. */
export async function retryAllFailed(
  ctx: Ctx,
  filter: { endpointId?: string | undefined } = {},
): Promise<number> {
  assertCan(ctx, PERMISSION);
  return inTx(ctx, async (c) => {
    const rows = await c.db
      .update(schema.webhookDelivery)
      .set({ status: "pending", attempts: 0, nextAttemptAt: new Date() })
      .where(
        and(
          eq(schema.webhookDelivery.status, "failed"),
          filter.endpointId ? eq(schema.webhookDelivery.endpointId, filter.endpointId) : undefined,
          visibleDeliveries(c),
        ),
      )
      .returning({ id: schema.webhookDelivery.id });
    if (rows.length) {
      await recordAudit(c, {
        action: "retry",
        entityType: "webhook_endpoint",
        entityId: filter.endpointId ?? "all",
        summary: `Ruční opakování chybných doručení webhooků (${rows.length})`,
      });
      await c.db.execute(sql`select pg_notify(${WEBHOOK_NOTIFY_CHANNEL}, 'retry')`);
    }
    return rows.length;
  });
}

export type { DeliverResult };
