import { createHash } from "node:crypto";
import { and, eq, lt, or } from "drizzle-orm";
import { schema, type Db } from "../db/client";
import { newId } from "../db/ids";
import { consumeRateLimit } from "../http/http";
import type { IngestDef, ModuleDeps } from "../modules/server";
import { captureError, scrubError } from "../observability";
import { UserError } from "../rbac/errors";
import { SYSTEM_ACTOR } from "../rbac/context";
import type { Ctx } from "../rbac/types";
import type { Cipher } from "../security/crypto";
import { verifySignature } from "../webhooks/signature";
import { loadIngestSecrets } from "./secret";

/*
  Zpracování příchozího požadavku `POST /api/ingest/<zdroj>` (D §2.2). Route handler jen přečte tělo a hlavičky,
  vše ostatní je tady, aby šlo testovat bez Next.js:

  1. podpis (`X-Opsys-Signature`, HMAC-SHA256 z `t.tělo`, ±5 minut) → jinak 401;
  2. zdroj musí být zaregistrovaný (`ModuleServer.ingests`) → jinak 404;
  3. tělo musí být JSON a projít schématem zdroje → jinak 400 / 422;
  4. idempotence přes `inbound_event (source, external_id)`: už zpracované = 200 `{duplicate:true}` bez zpracování;
     dřív selhané se zpracuje znovu (n8n opakuje požadavek, který skončil 500);
  5. zpracování `handle` běží v jedné transakci s označením „zpracováno“; selhání ji vrátí, zapíše se `failed`
     s důvodem a odpověď je 500 (n8n zopakuje).

  Každý požadavek s platným podpisem se zapíše do `inbound_event` i tehdy, když zpracování selže. Odmítnuté
  (špatný podpis) se zapíšou jen v omezeném počtu a bez těla, aby je nešlo zneužít k plnění databáze.
*/

/** Největší povolené tělo požadavku (bajty). */
export const INGEST_MAX_BODY_BYTES = 512 * 1024;
/** Jak dlouho se „přijatá, ale nedokončená“ událost považuje za rozdělanou jiným procesem; potom se zpracuje znovu. */
const STALE_RECEIVED_MS = 5 * 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Odpověď pro route handler. */
export type IngestResponse = { status: number; body: Record<string, unknown> };

/** Vstup zpracování příchozího požadavku. */
export type IngestRequest = {
  db: Db;
  cipher: Cipher;
  ingests: readonly IngestDef[];
  deps: ModuleDeps;
  /** Zdroj z adresy (`drive`, `leads`). */
  source: string;
  /** Tělo přesně tak, jak přišlo (podepisuje se). */
  rawBody: string;
  /** Hodnota hlavičky `X-Opsys-Signature`. */
  signature: string | null;
  ip?: string | null;
  now?: Date;
};

/** Do protokolu nedáváme zdroj z adresy, který by nevypadal jako název (kvůli zneužití tabulky). */
const safeSource = (s: string) => (/^[a-z0-9_-]{1,64}$/i.test(s) ? s : "unknown");

function ctxOf(db: Ctx["db"], ip: string | null | undefined): Ctx {
  return { actor: SYSTEM_ACTOR, db, requestId: newId(), ip: ip ?? null };
}

function errorText(err: unknown): string {
  const text = err instanceof UserError ? err.message : scrubError(err).split("\n")[0]!;
  return text.length > 500 ? `${text.slice(0, 500)}…` : text;
}

function issueText(issues: readonly { path: PropertyKey[]; message: string }[]): string {
  return issues
    .slice(0, 5)
    .map((i) => `${i.path.map(String).join(".") || "(tělo)"}: ${i.message}`)
    .join("; ");
}

async function recordRejected(
  db: Db,
  source: string,
  reason: string,
  extra: Record<string, unknown>,
): Promise<void> {
  await db.insert(schema.inboundEvent).values({
    source: safeSource(source),
    externalId: `rejected:${newId()}`,
    payload: { rejected: true, reason, ...extra },
    status: "failed",
    error: `Požadavek odmítnut: ${reason}`,
  });
}

/** Zpracuje příchozí požadavek (viz popis modulu). Nevyhazuje: každou chybu převede na odpověď. */
export async function processIngest(req: IngestRequest): Promise<IngestResponse> {
  const { db, source } = req;
  const now = req.now ?? new Date();

  const secrets = await loadIngestSecrets(db, req.cipher, now);
  if (!secrets.length)
    return {
      status: 503,
      body: {
        error: "ingest_not_configured",
        message: "Tajemství příchozích požadavků není nastavené.",
      },
    };

  const check = verifySignature({
    secrets,
    header: req.signature,
    body: req.rawBody,
    nowMs: now.getTime(),
  });
  if (!check.ok) {
    // omezený zápis odmítnutých pokusů (brute force i záplava), bez těla
    const ok = await consumeRateLimit(db, `ingest-bad:${req.ip ?? "unknown"}`, 20, 300);
    if (!ok) return { status: 429, body: { error: "rate_limited" } };
    await recordRejected(db, source, check.reason, {
      size: req.rawBody.length,
      hasSignature: !!req.signature,
      ip: req.ip ?? null,
    }).catch((err) => captureError(err, { where: "ingest.reject" }));
    return { status: 401, body: { error: "invalid_signature", reason: check.reason } };
  }

  const def = req.ingests.find((i) => i.source === source);
  if (!def) {
    await recordRejected(db, source, "neznámý zdroj", { size: req.rawBody.length }).catch(() => {});
    return { status: 404, body: { error: "unknown_source" } };
  }

  // od teď je požadavek důvěryhodný: zapíše se vždy
  const digest = createHash("sha256").update(req.rawBody).digest("hex").slice(0, 24);
  let json: unknown;
  try {
    json = JSON.parse(req.rawBody);
  } catch {
    await upsertInvalid(
      db,
      source,
      `invalid:${digest}`,
      { raw: req.rawBody.slice(0, 2000) },
      "Tělo není platný JSON.",
      now,
    );
    return { status: 400, body: { error: "invalid_json" } };
  }
  const parsed = def.schema.safeParse(json);
  if (!parsed.success) {
    const message = issueText(parsed.error.issues);
    await upsertInvalid(db, source, `invalid:${digest}`, json, `Neplatná data: ${message}`, now);
    return { status: 422, body: { error: "invalid_payload", message } };
  }
  let externalId: string;
  try {
    externalId = String(def.externalId(parsed.data)).trim().slice(0, 200);
    if (!externalId) throw new Error("prázdné ID");
  } catch {
    await upsertInvalid(
      db,
      source,
      `invalid:${digest}`,
      json,
      "Z požadavku nejde určit jednoznačné ID.",
      now,
    );
    return {
      status: 422,
      body: { error: "invalid_payload", message: "Chybí jednoznačné ID události." },
    };
  }

  const claimed = await claim(db, source, externalId, json, now);
  if (claimed.kind === "duplicate")
    return { status: 200, body: { ok: true, duplicate: true, id: claimed.id } };

  return run(req, def, claimed.id, parsed.data, now);
}

/** Neplatný požadavek se zapíše (a při opakování stejného těla jen přepíše), aby byl vidět v Nastavení. */
async function upsertInvalid(
  db: Db,
  source: string,
  externalId: string,
  payload: unknown,
  error: string,
  now: Date,
): Promise<void> {
  await db
    .insert(schema.inboundEvent)
    .values({
      source,
      externalId,
      payload: (payload && typeof payload === "object" ? payload : { value: payload }) as Record<
        string,
        unknown
      >,
      status: "failed",
      error,
      receivedAt: now,
    })
    .onConflictDoUpdate({
      target: [schema.inboundEvent.source, schema.inboundEvent.externalId],
      set: { status: "failed", error, receivedAt: now },
    })
    .catch((err) => captureError(err, { where: "ingest.invalid" }));
}

/**
 * Idempotence: založí událost, nebo převezme dřívější selhanou (případně dávno „přijatou“). Zpracovanou nebo právě
 * zpracovávanou vrátí jako duplicitu.
 */
async function claim(
  db: Db,
  source: string,
  externalId: string,
  payload: unknown,
  now: Date,
): Promise<{ kind: "run"; id: string } | { kind: "duplicate"; id: string }> {
  const body = (payload && typeof payload === "object" ? payload : { value: payload }) as Record<
    string,
    unknown
  >;
  const [inserted] = await db
    .insert(schema.inboundEvent)
    .values({ source, externalId, payload: body, status: "received", receivedAt: now })
    .onConflictDoNothing()
    .returning({ id: schema.inboundEvent.id });
  if (inserted) return { kind: "run", id: inserted.id };

  const [existing] = await db
    .select({ id: schema.inboundEvent.id, status: schema.inboundEvent.status })
    .from(schema.inboundEvent)
    .where(
      and(eq(schema.inboundEvent.source, source), eq(schema.inboundEvent.externalId, externalId)),
    );
  if (!existing) return { kind: "run", id: (await claim(db, source, externalId, payload, now)).id };
  if (existing.status === "processed") return { kind: "duplicate", id: existing.id };

  const [taken] = await db
    .update(schema.inboundEvent)
    .set({ status: "received", error: null, payload: body, receivedAt: now, processedAt: null })
    .where(
      and(
        eq(schema.inboundEvent.id, existing.id),
        or(
          eq(schema.inboundEvent.status, "failed"),
          and(
            eq(schema.inboundEvent.status, "received"),
            lt(schema.inboundEvent.receivedAt, new Date(now.getTime() - STALE_RECEIVED_MS)),
          ),
        ),
      ),
    )
    .returning({ id: schema.inboundEvent.id });
  return taken ? { kind: "run", id: taken.id } : { kind: "duplicate", id: existing.id };
}

/** Spustí `handle` v transakci spolu s označením „zpracováno“; při selhání zapíše `failed` a vrátí 500. */
async function run(
  req: Pick<IngestRequest, "db" | "deps" | "ip" | "source">,
  def: IngestDef,
  eventId: string,
  data: unknown,
  now: Date,
): Promise<IngestResponse> {
  const { db } = req;
  try {
    const entity = await db.transaction(async (tx) => {
      const result = await def.handle(ctxOf(tx, req.ip), data as never, req.deps);
      const e = result && result.entity && UUID.test(result.entity.id) ? result.entity : null;
      await tx
        .update(schema.inboundEvent)
        .set({
          status: "processed",
          processedAt: now,
          error: null,
          entityType: e?.type ?? null,
          entityId: e?.id ?? null,
        })
        .where(eq(schema.inboundEvent.id, eventId));
      return e;
    });
    return {
      status: 200,
      body: { ok: true, id: eventId, ...(entity ? { entity } : {}) },
    };
  } catch (err) {
    captureError(err, { where: `ingest.${req.source}` });
    await db
      .update(schema.inboundEvent)
      .set({ status: "failed", error: errorText(err), processedAt: now })
      .where(eq(schema.inboundEvent.id, eventId))
      .catch((e) => captureError(e, { where: "ingest.failed-record" }));
    return { status: 500, body: { error: "processing_failed", id: eventId } };
  }
}

/**
 * Znovu zpracuje uloženou příchozí událost, která selhala (tlačítko v Nastavení → Integrace), ze zapsaného těla;
 * n8n přitom nemusí nic opakovat. Podpis se nekontroluje (volá správce přes server action s oprávněním).
 */
export async function reprocessInbound(
  deps: Pick<IngestRequest, "db" | "ingests" | "deps">,
  id: string,
  now = new Date(),
): Promise<IngestResponse> {
  const [row] = await deps.db
    .select()
    .from(schema.inboundEvent)
    .where(eq(schema.inboundEvent.id, id));
  if (!row) return { status: 404, body: { error: "not_found" } };
  if (row.status === "processed") return { status: 200, body: { ok: true, duplicate: true, id } };
  const def = deps.ingests.find((i) => i.source === row.source);
  if (!def) return { status: 404, body: { error: "unknown_source" } };
  const parsed = def.schema.safeParse(row.payload);
  if (!parsed.success) {
    const message = issueText(parsed.error.issues);
    await deps.db
      .update(schema.inboundEvent)
      .set({ status: "failed", error: `Neplatná data: ${message}` })
      .where(eq(schema.inboundEvent.id, id));
    return { status: 422, body: { error: "invalid_payload", message } };
  }
  const [taken] = await deps.db
    .update(schema.inboundEvent)
    .set({ status: "received", error: null, receivedAt: now })
    .where(and(eq(schema.inboundEvent.id, id), eq(schema.inboundEvent.status, "failed")))
    .returning({ id: schema.inboundEvent.id });
  if (!taken) return { status: 200, body: { ok: true, duplicate: true, id } };
  return run(
    { db: deps.db, deps: deps.deps, ip: null, source: row.source },
    def,
    id,
    parsed.data,
    now,
  );
}
