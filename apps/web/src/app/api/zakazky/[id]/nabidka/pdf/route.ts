import { contentDisposition } from "@rebar/core/files";
import { budgetApi } from "@rebar/zakazky/server";
import { z } from "zod";
import { ctxFromRequest, errorResponse } from "@/server/http";
import { getServices } from "@/server/services";

export const dynamic = "force-dynamic";

/**
 * PDF nabídky zakázky (jen prodejní ceny, ne náklady ani marže). Přístup k zakázce a oprávnění k ekonomice
 * se ověřují při každém stažení. `?version=` vybere revizi nabídky, `?download` vynutí stažení.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = getServices();
  if (!s.runtime.modules.some((m) => m.id === "zakazky"))
    return Response.json({ error: "Nenalezeno.", code: "not_found" }, { status: 404 });
  try {
    const ctx = await ctxFromRequest(req);
    if (!ctx?.actor.userId)
      return Response.json({ error: "Nejste přihlášeni.", code: "forbidden" }, { status: 401 });
    const { id } = await params;
    z.uuid().parse(id);
    const url = new URL(req.url);
    const version = url.searchParams.get("version");
    if (version) z.uuid().parse(version);
    const { filename, buffer } = await budgetApi.renderOfferPdf(ctx, s.moduleDeps, id, version);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": contentDisposition(filename, !url.searchParams.has("download")),
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
