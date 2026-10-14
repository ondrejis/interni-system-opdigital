import { z } from "zod";
import { contentDisposition } from "@rebar/core/files";
import { buildSingleIsdoc } from "@rebar/fakturace/server";
import { ctxFromRequest, errorResponse } from "@/server/http";
import { getServices } from "@/server/services";

export const dynamic = "force-dynamic";

/**
 * ISDOC jednoho dokladu (vydaná i přijatá faktura se pozná podle id). Vyžaduje oprávnění k exportu faktur a přístup
 * k záznamu (rozsah „jen moje“ se respektuje); stažení se zapisuje do auditu.
 */
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
    const { filename, xml } = await buildSingleIsdoc(ctx, s.moduleDeps, id);
    return new Response(xml, {
      headers: {
        "content-type": "application/xml; charset=utf-8",
        "content-disposition": contentDisposition(filename, false),
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
