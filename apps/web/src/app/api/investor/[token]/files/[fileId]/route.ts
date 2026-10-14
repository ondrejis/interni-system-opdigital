import { shareApi } from "@rebar/zakazky/server";
import { clientKey, errorResponse } from "@/server/http";
import { investorRateOk, serveInvestorFile, sharingEnabled } from "@/server/investor";
import { getServices } from "@/server/services";

export const dynamic = "force-dynamic";

/** Soubor pro investora podle tajného tokenu (bez přihlášení). Nesprávný token a soubor mimo rozsah jsou stejně „nenalezeno“. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string; fileId: string }> },
) {
  const notFound = () => new Response("Nenalezeno.", { status: 404 });
  if (!sharingEnabled()) return notFound();
  try {
    if (!(await investorRateOk(clientKey(req))))
      return new Response("Příliš mnoho požadavků.", { status: 429 });
    const { token, fileId } = await params;
    const share = await shareApi.resolveShare(getServices().db, token);
    if (!share) return notFound();
    return await serveInvestorFile(share, fileId, new URL(req.url));
  } catch (err) {
    return errorResponse(err);
  }
}
