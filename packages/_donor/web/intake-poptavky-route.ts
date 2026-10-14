import { consumeRateLimit } from "@rebar/core/http";
import { receiveInquiry, IntakeAuthError, INTAKE_MAX_BYTES } from "@rebar/poptavky/server";
import { clientKey, errorResponse } from "@/server/http";
import { getServices } from "@/server/services";

export const dynamic = "force-dynamic";

/** Přečte tělo požadavku nejvýš do `max` bajtů; delší tělo se zahodí (`null`), aniž by se načetlo celé do paměti. */
async function readLimited(req: Request, max: number): Promise<Uint8Array<ArrayBuffer> | null> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > max) return null;
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/**
 * Příjem poptávky z webu klienta (webhook nebo formulář zpracovaný jeho serverem). Klíč v hlavičce
 * `Authorization: Bearer …`, tělo JSON nebo formulář. Klíč patří na server, ne do prohlížeče návštěvníka.
 */
export async function POST(req: Request) {
  const s = getServices();
  if (!s.runtime.modules.some((m) => m.id === "poptavky"))
    return Response.json({ error: "Nenalezeno.", code: "not_found" }, { status: 404 });
  try {
    const ip = clientKey(req);
    if (!(await consumeRateLimit(s.db, `intake:${ip}`, 60, 60)))
      return Response.json(
        { error: "Příliš mnoho požadavků.", code: "rate_limited" },
        { status: 429 },
      );

    const key = req.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "")
      .trim();
    if (!key) return Response.json({ error: "Chybí klíč.", code: "forbidden" }, { status: 401 });

    const type = req.headers.get("content-type") ?? "";
    const body = await readLimited(req, INTAKE_MAX_BYTES);
    if (!body)
      return Response.json(
        { error: "Požadavek je příliš velký.", code: "too_large" },
        { status: 413 },
      );
    const payload: unknown = type.includes("application/json")
      ? (() => {
          try {
            return JSON.parse(new TextDecoder().decode(body));
          } catch {
            return null;
          }
        })()
      : Object.fromEntries(
          [
            ...(
              await new Response(body, { headers: { "content-type": type } })
                .formData()
                .catch(() => new FormData())
            ).entries(),
          ].filter(([, v]) => typeof v === "string"),
        );
    const { id } = await receiveInquiry(s.db, s.moduleDeps, key, payload, ip);
    return Response.json({ id }, { status: 201 });
  } catch (err) {
    if (err instanceof IntakeAuthError)
      return Response.json({ error: err.message, code: "forbidden" }, { status: 401 });
    return errorResponse(err);
  }
}
