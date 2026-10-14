import { contentDisposition } from "@rebar/core/files";
import { renderInvoicePdf } from "@rebar/fakturace/server";
import { z } from "zod";
import { ctxFromRequest, errorResponse } from "@/server/http";
import { getServices } from "@/server/services";

export const dynamic = "force-dynamic";

/** PDF faktury. Oprávnění ke čtení záznamu se ověřuje při každém stažení; vystavený doklad se tiskne z uložených údajů. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = getServices();
  if (!s.runtime.modules.some((m) => m.id === "fakturace"))
    return Response.json({ error: "Nenalezeno.", code: "not_found" }, { status: 404 });
  try {
    const ctx = await ctxFromRequest(req);
    if (!ctx?.actor.userId)
      return Response.json({ error: "Nejste přihlášeni.", code: "forbidden" }, { status: 401 });
    const { id } = await params;
    z.uuid().parse(id);
    const { filename, buffer } = await renderInvoicePdf(ctx, s.moduleDeps, id);
    const download = new URL(req.url).searchParams.has("download");
    return new Response(new Uint8Array(buffer), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": contentDisposition(filename, !download),
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
