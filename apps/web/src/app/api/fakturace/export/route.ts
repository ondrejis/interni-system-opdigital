import { z } from "zod";
import { csvFormatOf } from "@rebar/core/export";
import { toWebStream } from "@rebar/core/export";
import { contentDisposition } from "@rebar/core/files";
import { buildAccountingPackage } from "@rebar/fakturace/server";
import { ctxFromRequest, errorResponse, sameOriginOrFail } from "@/server/http";
import { getServices } from "@/server/services";

export const dynamic = "force-dynamic";

const body = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  format: z.enum(["xlsx", "csv"]).default("xlsx"),
  receivedFiles: z.boolean().default(true),
  /** Přibalit složku `isdoc/` (ISDOC vydaných a přijatých faktur). */
  isdoc: z.boolean().default(false),
  /** Přibalit `dph-podklady` (stejný formát jako souhrn). */
  vatReport: z.boolean().default(false),
  /** Podle čeho se doklady vybírají do období: datum vystavení (výchozí), nebo DUZP. */
  basis: z.enum(["issue", "duzp"]).default("issue"),
  /** Oddělovač CSV: středník (český Excel, výchozí), nebo čárka. Později ho dodá nastavení klienta. */
  csvDelimiter: z.enum([";", ","]).optional(),
});

/**
 * Balík pro účetní za období: ZIP s PDF vydaných faktur, skeny přijatých faktur a souhrnem (XLSX/CSV), volitelně
 * s ISDOC a podklady DPH.
 * Oprávnění `fakturace.export` a viditelnost dokladů se ověřují při každém stažení; ZIP se posílá jako stream.
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
    const pkg = await buildAccountingPackage(ctx, s.moduleDeps, {
      ...input,
      csv: csvDelimiter
        ? { delimiter: csvDelimiter }
        : await csvFormatOf(getServices().exportRuntime),
    });
    return new Response(toWebStream(pkg.chunks), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": contentDisposition(pkg.filename, false),
        "x-export-count": String(pkg.issuedCount + pkg.receivedCount),
        "x-export-issued": String(pkg.issuedCount),
        "x-export-received": String(pkg.receivedCount),
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
