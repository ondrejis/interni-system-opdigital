import { z } from "zod";
import { filterGroupSchema } from "@rebar/core/entities";
import { startExport } from "@rebar/core/export";
import { contentDisposition } from "@rebar/core/files";
import { toWebStream } from "@rebar/core/export";
import { ctxFromRequest, errorResponse, sameOriginOrFail } from "@/server/http";
import { exportsEnabled } from "@/server/dashboards";
import { getServices } from "@/server/services";
import { UserError } from "@rebar/core/rbac";

export const dynamic = "force-dynamic";

const body = z.object({
  format: z.enum(["xlsx", "csv", "pdf"]),
  scope: z.enum(["view", "all"]).default("view"),
  columns: z.array(z.string().min(1).max(80)).max(80).optional(),
  fileName: z.string().trim().max(80).optional(),
  /** Zpracovat na pozadí i u malého exportu (výsledek čeká v „Moje exporty“). */
  background: z.boolean().optional(),
  templateId: z.uuid().optional(),
  query: z
    .object({
      filters: filterGroupSchema.optional(),
      sort: z
        .array(z.object({ attr: z.string().min(1).max(80), dir: z.enum(["asc", "desc"]) }))
        .max(5)
        .optional(),
      q: z.string().trim().max(200).optional(),
    })
    .optional(),
});

/**
 * Export seznamu entity (CSV, XLSX, PDF). Malý export se vrací rovnou jako stream, velký (nad limitem klienta) nebo
 * vyžádaný na pozadí se zařadí do fronty (odpověď 202 s číslem exportu) a hotový soubor čeká v „Moje exporty“.
 * Oprávnění (čtení či `permissions.export` entity, skryté atributy, rozsah „jen moje“) hlídá datová vrstva.
 */
export async function POST(req: Request, { params }: { params: Promise<{ entity: string }> }) {
  const bad = sameOriginOrFail(req);
  if (bad) return bad;
  try {
    const ctx = await ctxFromRequest(req);
    if (!ctx?.actor.userId)
      return Response.json({ error: "Nejste přihlášeni.", code: "forbidden" }, { status: 401 });
    if (!exportsEnabled()) throw new UserError("Exporty jsou v tomto systému vypnuté.");
    const { entity: key } = await params;
    const input = body.parse(await req.json());
    const started = await startExport(
      ctx,
      getServices().exportRuntime,
      {
        entity: z.string().max(40).parse(key),
        format: input.format,
        scope: input.scope,
        ...(input.columns ? { columns: input.columns } : {}),
        ...(input.query ? { query: input.query } : {}),
        ...(input.fileName ? { fileName: input.fileName } : {}),
      },
      { source: "manual", templateId: input.templateId ?? null, background: !!input.background },
    );
    if (started.mode === "queued")
      return Response.json(
        { queued: true, runId: started.runId, rows: started.rows },
        { status: 202, headers: { "cache-control": "private, no-store" } },
      );
    const prepared = started.prepared;
    return new Response(toWebStream(prepared.chunks), {
      headers: {
        "content-type": prepared.mime,
        "content-disposition": contentDisposition(prepared.filename, false),
        "x-export-count": String(prepared.count),
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
