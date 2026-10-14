import { snoozeNotification } from "@rebar/core/notifications";
import { z } from "zod";
import { ctxFromRequest, errorResponse, sameOriginOrFail } from "@/server/http";
import { getServices } from "@/server/services";

export const dynamic = "force-dynamic";

/** Akce „Odložit“ na push: stejné upozornění se za hodinu připomene znovu (jen majiteli upozornění). */
export async function POST(req: Request) {
  const bad = sameOriginOrFail(req);
  if (bad) return bad;
  try {
    const ctx = await ctxFromRequest(req);
    if (!ctx?.actor.userId)
      return Response.json({ error: "Nejste přihlášeni.", code: "forbidden" }, { status: 401 });
    const body = z
      .object({ id: z.uuid(), minutes: z.number().int().min(5).max(480).default(60) })
      .parse(await req.json().catch(() => null));
    const ok = await snoozeNotification(getServices().db, ctx.actor.userId, body.id, body.minutes);
    return Response.json({ ok }, { status: ok ? 200 : 404 });
  } catch (err) {
    return errorResponse(err);
  }
}
