import { completeConnect, envOfDeps } from "@rebar/kalendar/server";
import { ctxFromRequest, errorResponse } from "@/server/http";
import { getServices } from "@/server/services";

export const dynamic = "force-dynamic";

/**
 * Návrat ze souhlasu Google Kalendáře (OAuth). Přihlášený uživatel; `state` je zašifrovaný a patří jemu, takže cizí
 * návrat nikoho nepřipojí. Po uložení účtu přesměruje zpět do Nastavení → Google Kalendář (`?google=ok|denied|error`).
 */
export async function GET(req: Request) {
  try {
    const ctx = await ctxFromRequest(req);
    if (!ctx?.actor.userId)
      return Response.json({ error: "Nejste přihlášeni.", code: "forbidden" }, { status: 401 });
    const url = new URL(req.url);
    const s = getServices();
    const result = await completeConnect(ctx, envOfDeps(s.moduleDeps), {
      code: url.searchParams.get("code"),
      state: url.searchParams.get("state"),
      error: url.searchParams.get("error"),
    });
    // cíl je vždy relativní cesta z našeho zašifrovaného `state` (viz `openState`), nikdy adresa z parametru
    return new Response(null, {
      status: 303,
      headers: { location: new URL(result.redirectTo, s.env.APP_URL).toString() },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
