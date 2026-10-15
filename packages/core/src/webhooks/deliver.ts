import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import "../zod-locale";
import { schema, type Executor } from "../db/client";
import { defineJob } from "../jobs/jobs";
import { captureError } from "../observability";
import type { Cipher } from "../security/crypto";
import { signatureHeader } from "./signature";

/*
  Doručovač odchozích webhooků (worker). Zdrojem je tabulka `webhook_delivery`: řádek je zároveň fronta (outbox)
  a protokol. Řádky vznikají v transakci změny (`enqueueWebhookDeliveries`), takže se neodešle nic, co se nepotvrdilo,
  a nic se neztratí, když worker právě neběží.

  Pokusy: první hned, pak opakování za 1 min, 5 min, 15 min, 30 min a 1 h (celkem 6 pokusů, 5× opakování). Po vyčerpání
  je doručení `failed` a správce ho může v Nastavení → Integrace opakovat ručně. Úspěch = odpověď 2xx; přesměrování se
  nenásledují (chyba konfigurace adresy se nesmí tvářit jako doručení).
*/

/** Odklad před dalším pokusem po neúspěšném pokusu číslo 1, 2, … (sekundy). */
export const RETRY_DELAYS_SECONDS = [60, 300, 900, 1800, 3600] as const;
/** Nejvíc pokusů o jedno doručení: první + pět opakování. */
export const MAX_ATTEMPTS = RETRY_DELAYS_SECONDS.length + 1;
/** Jak dlouho čekáme na odpověď serveru. */
export const DELIVERY_TIMEOUT_MS = 10_000;
/** Doručení převzaté workerem je tak dlouho „zamčené“; po pádu workeru se po uplynutí zpracuje znovu. */
const LEASE_SECONDS = 120;
const PARALLEL = 5;

/** Co doručovač potřebuje. `fetch` jde nahradit v testech. */
export type DeliverDeps = {
  db: Executor;
  cipher: Cipher;
  fetch?: typeof fetch;
  now?: () => Date;
};

export type DeliverResult = { claimed: number; delivered: number; retried: number; failed: number };

type Outcome = "delivered" | "retry" | "failed";

/** Zkrátí a očistí text z cizí odpovědi pro protokol (bez řídicích znaků a zalomení). */
function clean(text: string, max = 300): string {
  // eslint-disable-next-line no-control-regex
  const flat = text.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

async function readSnippet(res: Response, maxBytes = 2048): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Popis chyby spojení bez adresy a bez interních podrobností. */
function describeNetworkError(err: unknown): string {
  const e = err as { name?: string; cause?: { code?: string }; code?: string };
  if (e?.name === "TimeoutError" || e?.name === "AbortError")
    return `Server neodpověděl do ${DELIVERY_TIMEOUT_MS / 1000} s.`;
  const code = e?.cause?.code ?? e?.code;
  return code ? `Spojení se nezdařilo (${clean(String(code), 40)}).` : "Spojení se nezdařilo.";
}

/**
 * Převezme doručení k odeslání (zamkne ho na dobu `LEASE_SECONDS` a započítá pokus). Vrací `false`, když je už
 * jiný worker zpracovává nebo není čekající.
 */
export async function claimDelivery(db: Executor, id: string, now = new Date()): Promise<boolean> {
  const rows = await db.execute<{ id: string }>(sql`
    update webhook_delivery
       set attempts = attempts + 1,
           next_attempt_at = ${new Date(now.getTime() + LEASE_SECONDS * 1000).toISOString()}::timestamptz
     where id = ${id}::uuid and status = 'pending' and next_attempt_at <= ${now.toISOString()}::timestamptz
    returning id`);
  return rows.length > 0;
}

/**
 * Provede jeden (už převzatý) pokus o doručení a zapíše výsledek. `maxAttempts` = po kolikátém neúspěšném pokusu je
 * doručení `failed` (zkušební webhook: 1, bez opakování).
 */
export async function attemptDelivery(
  deps: DeliverDeps,
  id: string,
  { maxAttempts = MAX_ATTEMPTS }: { maxAttempts?: number } = {},
): Promise<Outcome> {
  const { db } = deps;
  const now = deps.now ?? (() => new Date());
  const [row] = await db
    .select({
      id: schema.webhookDelivery.id,
      event: schema.webhookDelivery.event,
      payload: schema.webhookDelivery.payload,
      attempts: schema.webhookDelivery.attempts,
      url: schema.webhookEndpoint.url,
      secretEnc: schema.webhookEndpoint.secretEnc,
      active: schema.webhookEndpoint.active,
      deletedAt: schema.webhookEndpoint.deletedAt,
    })
    .from(schema.webhookDelivery)
    .innerJoin(schema.webhookEndpoint, eq(schema.webhookDelivery.endpointId, schema.webhookEndpoint.id))
    .where(and(eq(schema.webhookDelivery.id, id), eq(schema.webhookDelivery.status, "pending")));
  if (!row) return "failed";

  const record = async (
    set: Partial<typeof schema.webhookDelivery.$inferInsert>,
  ): Promise<void> => {
    await db
      .update(schema.webhookDelivery)
      .set(set)
      .where(and(eq(schema.webhookDelivery.id, id), eq(schema.webhookDelivery.status, "pending")));
  };
  const stamp = (msg: string) => `${now().toISOString()} · ${msg}`;
  const fail = async (msg: string): Promise<Outcome> => {
    await record({ status: "failed", lastError: stamp(msg) });
    return "failed";
  };

  if (!row.active || row.deletedAt) return fail("Endpoint je vypnutý nebo smazaný.");
  const secret = deps.cipher.decrypt(row.secretEnc);
  if (!secret) return fail("Tajemství endpointu nejde dešifrovat (změnil se šifrovací klíč?).");

  const body = JSON.stringify(row.payload);
  let error: string;
  try {
    const res = await (deps.fetch ?? fetch)(row.url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      headers: {
        "content-type": "application/json",
        "user-agent": "OPSYS-Webhooks/1",
        "x-opsys-event": row.event,
        "x-opsys-delivery": row.id,
        "x-opsys-signature": signatureHeader(secret, body, now().getTime()),
      },
      body,
    });
    if (res.status >= 200 && res.status < 300) {
      await res.body?.cancel().catch(() => {});
      await record({ status: "delivered", deliveredAt: now(), lastError: null });
      return "delivered";
    }
    const snippet = clean(await readSnippet(res));
    error =
      res.status >= 300 && res.status < 400
        ? `HTTP ${res.status}: server odpověděl přesměrováním, adresa webhooku má být konečná.`
        : `HTTP ${res.status}${snippet ? `: ${snippet}` : ""}`;
  } catch (err) {
    error = describeNetworkError(err);
  }

  if (row.attempts >= maxAttempts) return fail(error);
  const delay = RETRY_DELAYS_SECONDS[Math.min(row.attempts, RETRY_DELAYS_SECONDS.length) - 1] ?? 3600;
  await record({
    nextAttemptAt: new Date(now().getTime() + delay * 1000),
    lastError: stamp(error),
  });
  return "retry";
}

/**
 * Odešle všechna čekající doručení, jejichž čas nadešel. Bezpečné spouštět souběžně (každé doručení převezme jen
 * jeden běh) i opakovaně.
 */
export async function deliverDue(deps: DeliverDeps, opts: { limit?: number } = {}): Promise<DeliverResult> {
  const { db } = deps;
  const now = deps.now?.() ?? new Date();
  const result: DeliverResult = { claimed: 0, delivered: 0, retried: 0, failed: 0 };
  const limit = opts.limit ?? 200;
  while (result.claimed < limit) {
    const claimed = await db.execute<{ id: string }>(sql`
      update webhook_delivery d
         set attempts = d.attempts + 1,
             next_attempt_at = ${new Date(now.getTime() + LEASE_SECONDS * 1000).toISOString()}::timestamptz
       where d.id in (
         select id from webhook_delivery
          where status = 'pending' and next_attempt_at <= ${now.toISOString()}::timestamptz
          order by next_attempt_at
          limit 50
          for update skip locked)
      returning d.id`);
    const ids = [...claimed].map((r) => r.id);
    if (!ids.length) break;
    result.claimed += ids.length;
    for (let i = 0; i < ids.length; i += PARALLEL) {
      const outcomes = await Promise.all(
        ids.slice(i, i + PARALLEL).map((id) =>
          attemptDelivery(deps, id).catch((err) => {
            captureError(err, { where: "webhooks.deliver" });
            return "retry" as Outcome;
          }),
        ),
      );
      for (const o of outcomes) result[o === "delivered" ? "delivered" : o === "retry" ? "retried" : "failed"]++;
    }
  }
  return result;
}

/** Jak dlouho se uchovávají vyřízená doručení a zpracované příchozí události (dny). */
export const RETENTION_DAYS = { delivered: 30, failed: 90, inboundProcessed: 90, inboundFailed: 180 } as const;

/** Úklid: smaže stará doručená a chybná doručení a zpracované příchozí události (idempotence tím nesmí trpět: dny jsou dlouhé). */
export async function cleanupWebhookData(
  db: Executor,
  now = new Date(),
): Promise<{ deliveries: number; inbound: number }> {
  const before = (days: number) => new Date(now.getTime() - days * 86_400_000);
  const d1 = await db
    .delete(schema.webhookDelivery)
    .where(
      and(
        eq(schema.webhookDelivery.status, "delivered"),
        lt(schema.webhookDelivery.createdAt, before(RETENTION_DAYS.delivered)),
      ),
    )
    .returning({ id: schema.webhookDelivery.id });
  const d2 = await db
    .delete(schema.webhookDelivery)
    .where(
      and(
        eq(schema.webhookDelivery.status, "failed"),
        lt(schema.webhookDelivery.createdAt, before(RETENTION_DAYS.failed)),
      ),
    )
    .returning({ id: schema.webhookDelivery.id });
  const i1 = await db
    .delete(schema.inboundEvent)
    .where(
      and(
        eq(schema.inboundEvent.status, "processed"),
        lt(schema.inboundEvent.receivedAt, before(RETENTION_DAYS.inboundProcessed)),
      ),
    )
    .returning({ id: schema.inboundEvent.id });
  const i2 = await db
    .delete(schema.inboundEvent)
    .where(
      and(
        inArray(schema.inboundEvent.status, ["failed", "received"]),
        lt(schema.inboundEvent.receivedAt, before(RETENTION_DAYS.inboundFailed)),
      ),
    )
    .returning({ id: schema.inboundEvent.id });
  return { deliveries: d1.length + d2.length, inbound: i1.length + i2.length };
}

/** Minimum, co úlohy webhooků potřebují od workeru (`CoreJobDeps` to splňuje). */
export type WebhookJobDeps = { db: Executor; cipher: Cipher };

/** Každou minutu a navíc hned po `NOTIFY` (worker poslouchá `WEBHOOK_NOTIFY_CHANNEL`): odešle čekající webhooky. */
export const webhookDeliverJob = defineJob<z.ZodObject<Record<string, never>>, WebhookJobDeps>({
  name: "core.webhooks.deliver",
  schema: z.object({}),
  cron: "* * * * *",
  retryLimit: 1,
  keepCompletedSeconds: 120,
  async handler(deps) {
    await deliverDue(deps);
  },
});

/** Denně v noci: smaže stará vyřízená doručení a příchozí události. */
export const webhookCleanupJob = defineJob<z.ZodObject<Record<string, never>>, WebhookJobDeps>({
  name: "core.webhooks.cleanup",
  schema: z.object({}),
  cron: "40 3 * * *",
  retryLimit: 1,
  keepCompletedSeconds: 600,
  async handler(deps) {
    await cleanupWebhookData(deps.db);
  },
});

/** Úlohy webhooků pro `coreJobs` (INT je přidá do `jobs/core-jobs.ts`, viz `docs/opsys/ZADOSTI.md`). */
export const webhookJobs = [webhookDeliverJob, webhookCleanupJob] as const;
