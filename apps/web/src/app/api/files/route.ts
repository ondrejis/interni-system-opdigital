import { consumeRateLimit } from "@rebar/core/http";
import { thumbnailJob } from "@rebar/core/jobs";
import { uploadFile, MAX_FILE_BYTES } from "@rebar/core/files";
import { UserError } from "@rebar/core/rbac";
import { z } from "zod";
import { ctxFromRequest, errorResponse, sameOriginOrFail } from "@/server/http";
import { getServices } from "@/server/services";

export const dynamic = "force-dynamic";

const attach = z.object({
  entityType: z.string().min(1).max(60),
  entityId: z.uuid(),
  kind: z.string().max(30).optional(),
  takenAt: z.iso.datetime().optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

/** Nahrání souboru (multipart: `file` + volitelně `entityType`, `entityId`, `kind`, `takenAt`, `lat`, `lng`). */
export async function POST(req: Request) {
  const bad = sameOriginOrFail(req);
  if (bad) return bad;
  try {
    const ctx = await ctxFromRequest(req);
    if (!ctx?.actor.userId)
      return Response.json({ error: "Nejste přihlášeni.", code: "forbidden" }, { status: 401 });
    const s = getServices();

    if (!(await consumeRateLimit(s.db, `upload:${ctx.actor.userId}`, 120, 60))) {
      return Response.json(
        { error: "Příliš mnoho nahrávání. Zkuste to za chvíli.", code: "rate_limited" },
        { status: 429 },
      );
    }
    if (Number(req.headers.get("content-length") ?? 0) > MAX_FILE_BYTES + 1024 * 1024)
      throw new UserError("Soubor je příliš velký.");

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new UserError("Vyberte soubor k nahrání.");

    const raw = Object.fromEntries(
      [...form.entries()].filter(([k, v]) => k !== "file" && typeof v === "string" && v !== ""),
    );
    const a = "entityType" in raw || "entityId" in raw ? attach.parse(raw) : null;

    const { file: saved } = await uploadFile(
      ctx,
      { storage: s.storage },
      {
        name: file.name,
        data: Buffer.from(await file.arrayBuffer()),
        ...(a
          ? {
              attachTo: {
                entityType: a.entityType,
                entityId: a.entityId,
                ...(a.kind ? { kind: a.kind } : {}),
                takenAt: a.takenAt ? new Date(a.takenAt) : null,
                geo: a.lat !== undefined && a.lng !== undefined ? { lat: a.lat, lng: a.lng } : null,
              },
            }
          : {}),
      },
    );
    if (saved.kind === "image")
      await s.queue.send(thumbnailJob, { fileId: saved.id }).catch(() => {});
    return Response.json(
      {
        id: saved.id,
        name: saved.name,
        mime: saved.mime,
        size: saved.size,
        width: saved.width,
        height: saved.height,
      },
      { status: 201 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
