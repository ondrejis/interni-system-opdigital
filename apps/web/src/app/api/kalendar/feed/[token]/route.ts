import { consumeRateLimit } from "@rebar/core/http";
import { feedForToken } from "@rebar/kalendar/server";
import { clientKey, errorResponse } from "@/server/http";
import { getServices } from "@/server/services";

export const dynamic = "force-dynamic";

/**
 * Odběr kalendáře (iCalendar) podle tajného tokenu v adrese, bez přihlášení: Google, Apple a Outlook nemají jak
 * se přihlásit. V databázi je jen otisk tokenu; špatný token je stejně „nenalezeno“ jako neexistující modul.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const s = getServices();
  const notFound = () => new Response("Nenalezeno.", { status: 404 });
  if (!s.runtime.modules.some((m) => m.id === "kalendar")) return notFound();
  try {
    if (!(await consumeRateLimit(s.db, `kalendar-feed:${clientKey(req)}`, 120, 60)))
      return new Response("Příliš mnoho požadavků.", { status: 429 });
    const { token: raw } = await params;
    const token = raw.replace(/\.ics$/i, "");
    const host = new URL(s.env.APP_URL).hostname;
    const body = await feedForToken(s.db, token, host, "Kalendář");
    if (!body) return notFound();
    return new Response(body, {
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": 'inline; filename="kalendar.ics"',
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
