import { INGEST_MAX_BODY_BYTES, processIngest } from "@rebar/core/ingest";
import { consumeRateLimit } from "@rebar/core/http";
import { SIGNATURE_HEADER } from "@rebar/core/webhooks";
import { clientKey } from "@/server/http";
import { getServices } from "@/server/services";

export const dynamic = "force-dynamic";

/**
 * Příchozí požadavky od n8n (Google Disk, Meta leady): `POST /api/ingest/<zdroj>`. Bez přihlášení, chráněno podpisem:
 * hlavička `X-Opsys-Signature: t=<unix>,v1=<hex HMAC-SHA256(tajemství, t + "." + tělo)>`, časová značka ±5 minut
 * (tajemství se spravuje v Nastavení → Integrace). Idempotence a zápis do `inbound_event` řeší `processIngest`.
 * Omezení počtu požadavků: 120 za minutu z jedné adresy; tělo nejvýš 512 kB. CSRF se tu neuplatňuje (nejde o
 * prohlížeč, požadavek bez platného podpisu se odmítne).
 */
export async function POST(req: Request, { params }: { params: Promise<{ source: string }> }) {
  const { source } = await params;
  const s = getServices();
  const ip = clientKey(req);

  if (!(await consumeRateLimit(s.db, `ingest:${ip}`, 120, 60)))
    return Response.json({ error: "rate_limited" }, { status: 429, headers: { "retry-after": "60" } });

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > INGEST_MAX_BODY_BYTES)
    return Response.json({ error: "payload_too_large" }, { status: 413 });
  const rawBody = await readLimited(req, INGEST_MAX_BODY_BYTES);
  if (rawBody === null) return Response.json({ error: "payload_too_large" }, { status: 413 });

  const result = await processIngest({
    db: s.db,
    cipher: s.cipher,
    ingests: s.collected.ingests,
    deps: s.moduleDeps,
    source,
    rawBody,
    signature: req.headers.get(SIGNATURE_HEADER),
    ip,
  });
  return Response.json(result.body, {
    status: result.status,
    headers: { "cache-control": "no-store" },
  });
}

/** Přečte tělo nejvýš do `max` bajtů; větší tělo = `null` (čtení se přeruší, nenačte se celé do paměti). */
async function readLimited(req: Request, max: number): Promise<string | null> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
