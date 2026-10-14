import { z } from "zod";
import { csvFormatOf } from "@rebar/core/export";
import { toWebStream } from "@rebar/core/export";
import { contentDisposition } from "@rebar/core/files";
import { buildVatReport } from "@rebar/fakturace/server";
import { ctxFromRequest, errorResponse, sameOriginOrFail } from "@/server/http";
import { getServices } from "@/server/services";

export const dynamic = "force-dynamic";

const body = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  format: z.enum(["csv", "xlsx"]).default("xlsx"),
  /** Podle čeho se doklady vybírají do období: DUZP (výchozí, podle něj se přiznává DPH), nebo datum vystavení. */
  basis: z.enum(["duzp", "issue"]).default("duzp"),
  /** Oddělovač CSV: středník (český Excel, výchozí), nebo čárka. Později ho dodá nastavení klienta. */
  csvDelimiter: z.enum([";", ","]).optional(),
});

/**
 * Podklady pro přiznání DPH za období (CSV nebo XLSX): doklady po sazbách a souhrn. Oprávnění `fakturace.export`
 * a viditelnost dokladů se ověřují při každém stažení; odpověď je stream.
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
    const { csvDelimiter, ...input } = body.parse(await req.json());
    const out = await buildVatReport(ctx, s.moduleDeps, {
      ...input,
      csv: csvDelimiter
        ? { delimiter: csvDelimiter }
        : await csvFormatOf(getServices().exportRuntime),
    });
    return new Response(toWebStream(out.chunks), {
      headers: {
        "content-type": out.mime,
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
