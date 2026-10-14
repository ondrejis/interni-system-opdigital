import { acceptInvitation } from "@rebar/core/auth";
import { consumeRateLimit } from "@rebar/core/http";
import { clientKey, errorResponse, sameOriginOrFail } from "@/server/http";
import { getServices } from "@/server/services";

export const dynamic = "force-dynamic";

/** Přijetí pozvánky (bez přihlášení): jméno a heslo. Omezeno na 10 pokusů za 10 minut z jedné adresy. */
export async function POST(req: Request) {
  const bad = sameOriginOrFail(req);
  if (bad) return bad;
  try {
    const s = getServices();
    if (!(await consumeRateLimit(s.db, `invite:${clientKey(req)}`, 10, 600))) {
      return Response.json(
        { error: "Příliš mnoho pokusů. Zkuste to za chvíli.", code: "rate_limited" },
        { status: 429 },
      );
    }
    const body = (await req.json()) as { token?: string; name?: string; password?: string };
    await acceptInvitation(
      { auth: s.auth, db: s.db },
      { token: body.token ?? "", name: body.name ?? "", password: body.password ?? "" },
    );
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
