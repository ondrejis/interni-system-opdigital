import { z } from "zod";
import { evaluateWidget, filtersFromSearch } from "@rebar/core/dashboards";
import { PERIOD_PRESETS } from "@rebar/core/dashboards-shared";
import { ctxFromRequest, errorResponse, sameOriginOrFail } from "@/server/http";
import { dashboardsEnabled, getDashboardEnv } from "@/server/dashboards";

export const dynamic = "force-dynamic";

const body = z.object({
  /** Definice jednoho widgetu; ověří se schématem. Data se vždy filtrují oprávněními přihlášeného. */
  widget: z.unknown(),
  filters: z
    .object({
      period: z.enum(PERIOD_PRESETS).default("all"),
      from: z.string().max(10).optional(),
      to: z.string().max(10).optional(),
      jobId: z.string().max(40).optional(),
      userId: z.string().max(40).optional(),
    })
    .default({ period: "all" }),
  /** Přeskočí krátkou mezipaměť (tlačítko Obnovit, automatické obnovování na TV). */
  fresh: z.boolean().optional(),
});

/**
 * Vyhodnotí jeden widget. Widgety se načítají souběžně (každý vlastní požadavek), takže pomalý nebo chybný widget
 * ostatní nezdrží ani nerozbije: chyba je součástí odpovědi (`ok: false`), ne stavový kód 5xx.
 */
export async function POST(req: Request) {
  const bad = sameOriginOrFail(req);
  if (bad) return bad;
  try {
    const ctx = await ctxFromRequest(req);
    if (!ctx?.actor.userId)
      return Response.json({ error: "Nejste přihlášeni.", code: "forbidden" }, { status: 401 });
    if (!dashboardsEnabled())
      return Response.json(
        { error: "Nástěnky jsou vypnuté.", code: "user_error" },
        { status: 422 },
      );
    const input = body.parse(await req.json());
    // filtry projdou stejným čištěním jako adresa (neplatná id a data se zahodí)
    const f = filtersFromSearch((k) => {
      const m: Record<string, string | undefined> = {
        obdobi: input.filters.period,
        od: input.filters.from,
        do: input.filters.to,
        zakazka: input.filters.jobId,
        osoba: input.filters.userId,
      };
      return m[k];
    });
    const outcome = await evaluateWidget(ctx, getDashboardEnv(), input.widget, f, {
      fresh: !!input.fresh,
    });
    return Response.json(outcome, { headers: { "cache-control": "private, no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
