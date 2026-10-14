import { contentDisposition, openFile } from "@rebar/core/files";
import { Readable } from "node:stream";
import { ctxFromRequest, errorResponse } from "@/server/http";
import { getServices } from "@/server/services";

export const dynamic = "force-dynamic";

/** Typy, které smí prohlížeč zobrazit přímo (obrázky a PDF); vše ostatní se stahuje. */
const INLINE = /^(image\/(jpeg|png|webp|gif)|application\/pdf)$/;

/** Stažení souboru (`?thumb=1` náhled, `?download=1` vynutit stažení). Oprávnění se ověřuje při každém požadavku. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await ctxFromRequest(req);
    if (!ctx)
      return Response.json({ error: "Nejste přihlášeni.", code: "forbidden" }, { status: 401 });
    const { id } = await params;
    const url = new URL(req.url);
    const opened = await openFile(ctx, { storage: getServices().storage }, id, {
      thumb: url.searchParams.has("thumb"),
    });

    const inline = INLINE.test(opened.mime) && !url.searchParams.has("download");
    const headers = new Headers({
      "content-type": opened.mime,
      "content-disposition": contentDisposition(opened.name, inline),
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cache-control": "private, max-age=3600",
    });
    if (opened.size !== null) headers.set("content-length", String(opened.size));
    return new Response(Readable.toWeb(opened.stream) as ReadableStream, { headers });
  } catch (err) {
    return errorResponse(err);
  }
}
