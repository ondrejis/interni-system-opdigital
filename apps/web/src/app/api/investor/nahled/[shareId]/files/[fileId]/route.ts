import { assertEntityAccess } from "@rebar/core/entities";
import { assertCan } from "@rebar/core/rbac";
import { shareApi } from "@rebar/zakazky/server";
import { ctxFromRequest, errorResponse } from "@/server/http";
import { serveInvestorFile, sharingEnabled } from "@/server/investor";
import { getServices } from "@/server/services";

export const dynamic = "force-dynamic";

/** Soubor v náhledu „pohled investora“: smí ho ten, kdo odkazy zakázky spravuje (přihlášený). */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ shareId: string; fileId: string }> },
) {
  const notFound = () => new Response("Nenalezeno.", { status: 404 });
  if (!sharingEnabled()) return notFound();
  try {
    const ctx = await ctxFromRequest(req);
    if (!ctx)
      return Response.json({ error: "Nejste přihlášeni.", code: "forbidden" }, { status: 401 });
    assertCan(ctx, "zakazky.share");
    const { shareId, fileId } = await params;
    const share = await shareApi.loadShareById(getServices().db, shareId);
    if (!share) return notFound();
    await assertEntityAccess(ctx, "job", share.jobId, "read");
    return await serveInvestorFile(share, fileId, new URL(req.url));
  } catch (err) {
    return errorResponse(err);
  }
}
