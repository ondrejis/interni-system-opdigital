import { z } from "zod";
import { openRunFile } from "@rebar/core/export";
import { ctxFromRequest, errorResponse } from "@/server/http";
import { getServices } from "@/server/services";
import { Readable } from "node:stream";

export const dynamic = "force-dynamic";

/** Hotový export z „Moje exporty“ ke stažení. Jen jeho autor, jen do uplynutí doby uchování. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await ctxFromRequest(req);
    if (!ctx?.actor.userId)
      return Response.json({ error: "Nejste přihlášeni.", code: "forbidden" }, { status: 401 });
    const { id } = await params;
    const f = await openRunFile(ctx, getServices().exportRuntime, z.uuid().parse(id));
    return new Response(Readable.toWeb(f.stream) as ReadableStream, {
      headers: {
        "content-type": f.mime,
        "content-disposition": f.disposition,
        ...(f.size ? { "content-length": String(f.size) } : {}),
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
