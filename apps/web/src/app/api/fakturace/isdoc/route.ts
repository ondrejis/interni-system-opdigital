import { z } from "zod";
import { toWebStream } from "@rebar/core/export";
import { contentDisposition } from "@rebar/core/files";
import { buildIsdocExport } from "@rebar/fakturace/server";
import { ctxFromRequest, errorResponse, sameOriginOrFail } from "@/server/http";
import { getServices } from "@/server/services";

export const dynamic = "force-dynamic";

const body = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  /** Které doklady: vydané, přijaté, nebo obojí. */
  kind: z.enum(["issued", "received", "all"]).default("all"),
  /** Podle čeho se doklady vybírají do období: datum vystavení, nebo DUZP. */
  basis: z.enum(["issue", "duzp"]).default("issue"),
});

/**
 * ZIP s ISDOC (vydané `<číslo>.isdoc`, přijaté `prijate/…`) za období. Oprávnění `fakturace.export` a viditelnost
 * dokladů se ověřují při každém stažení; ZIP se posílá jako stream, soubory se tvoří postupně.
 */
export async function POST(req: Request) {
  const bad = sameOriginOrFail(req);
  if (bad) return bad;
  const s = getServices();
  if (!s.runtime.modules.some((m) => m.id === "fakturace"))
    return Response.json({ error: "Nenalezeno.", code: "not_found" }, { status: 404 });
  try {
    const ctx = await ctxFromRequest(req);
    if (!ctx?.actor.userId)
      return Response.json({ error: "Nejste přihlášeni.", code: "forbidden" }, { status: 401 });
    const input = body.parse(await req.json());
    const out = await buildIsdocExport(ctx, s.moduleDeps, input);
    return new Response(toWebStream(out.chunks), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": contentDisposition(out.filename, false),
        "x-export-count": String(out.issuedCount + out.receivedCount),
        "x-export-issued": String(out.issuedCount),
        "x-export-received": String(out.receivedCount),
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
