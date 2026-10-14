import { markRead } from "@rebar/core/collab";
import { z } from "zod";
import { ctxFromRequest, errorResponse, sameOriginOrFail } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * Service worker po ťuknutí na push označí upozornění za přečtené (zvoneček se zmenší, ostatní zařízení uživatele
 * si tentýž push zavřou při dalším otevření aplikace). Bez přihlášení se nic nestane: upozornění se jen otevře.
 */
export async function POST(req: Request) {
  const bad = sameOriginOrFail(req);
  if (bad) return bad;
  try {
    const ctx = await ctxFromRequest(req);
    if (!ctx?.actor.userId)
      return Response.json({ error: "Nejste přihlášeni.", code: "forbidden" }, { status: 401 });
    const body = z.object({ id: z.uuid() }).parse(await req.json().catch(() => null));
    await markRead(ctx, [body.id]);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
