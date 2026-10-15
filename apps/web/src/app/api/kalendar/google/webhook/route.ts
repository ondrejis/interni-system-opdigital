import { consumeRateLimit } from "@rebar/core/http";
import { handleGoogleWebhook, syncCalendarJobDef } from "@rebar/kalendar/server";
import { errorResponse } from "@/server/http";
import { getServices } from "@/server/services";

export const dynamic = "force-dynamic";

/**
 * Push kanál Google Kalendáře (veřejná trasa, volá ji Google). Ochrana: kanál musí existovat a tajný token kanálu
 * (`X-Goog-Channel-Token`) musí sedět; omezení počtu požadavků na kanál. Trasa jen zařadí synchronizaci kalendáře,
 * nic nečte ani nemění. Body Google neposílá.
 */
export async function POST(req: Request) {
  try {
    const s = getServices();
    const channel = req.headers.get("x-goog-channel-id") ?? "";
    if (!channel) return new Response(null, { status: 400 });
    if (!(await consumeRateLimit(s.db, `gcal:${channel}`, 120, 60)))
      return new Response(null, { status: 429 });
    const res = await handleGoogleWebhook(s.db, req.headers, async (calendarId) => {
      await s.queue.send(syncCalendarJobDef, { calendarId });
    });
    return new Response(null, { status: res.status });
  } catch (err) {
    return errorResponse(err);
  }
}
