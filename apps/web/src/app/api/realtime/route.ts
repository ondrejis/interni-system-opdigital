import { createRealtimeStream, getRealtimeHub } from "@rebar/core/realtime";
import { ctxFromRequest } from "@/server/http";
import { getServices } from "@/server/services";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Proud změn pro prohlížeč (SSE, SPOL-18): na změnu záznamu u druhého uživatele přijde signál (typ a id, ne data) do
 * zlomku sekundy a klient zneplatní dotazy. Zdrojem je PostgreSQL `LISTEN/NOTIFY` (jedno spojení na proces). Soukromé
 * záznamy se tomu, kdo je nesmí vidět, neposílají; data si klient dotáhne přes engine s viditelností. Při výpadku
 * prohlížeč spojení obnoví sám (EventSource), případně přejde na polling.
 */
export async function GET(req: Request) {
  const ctx = await ctxFromRequest(req);
  if (!ctx?.actor.userId || ctx.actor.restriction)
    return Response.json({ error: "Nejste přihlášeni.", code: "forbidden" }, { status: 401 });
  const s = getServices();
  const stream = createRealtimeStream({
    hub: getRealtimeHub(s.dbh.sql),
    ctx,
    readPermission: (type) => s.registry.get(type)?.permissions.read ?? null,
    signal: req.signal,
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
