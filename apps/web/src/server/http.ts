import { resolveCtx } from "@rebar/core/auth";
import { captureError } from "@rebar/core/observability";
import type { Ctx } from "@rebar/core/rbac";
import { toResult } from "@rebar/core/actions";
import { isSameOrigin } from "@rebar/core/http";
import { getServices } from "./services";

const STATUS: Record<string, number> = {
  forbidden: 403,
  not_found: 404,
  user_error: 422,
  invalid_input: 422,
  internal: 500,
};

/** Chybu ze služby převede na odpověď: čitelná hláška a správný stavový kód, interní podrobnosti se neprozradí. */
export function errorResponse(err: unknown): Response {
  const r = toResult(err, (e, info) => captureError(e, { errorId: info.errorId }));
  return Response.json({ error: r.error, code: r.code }, { status: STATUS[r.code] ?? 500 });
}

/** Kontext z požadavku route handleru (cookie). `null` = nepřihlášen. */
export async function ctxFromRequest(req: Request): Promise<Ctx | null> {
  const s = getServices();
  return resolveCtx({ auth: s.auth, db: s.db, headers: req.headers, catalog: s.catalog });
}

/** Mutace mimo server actions musí přijít z naší adresy (ochrana před CSRF). */
export function sameOriginOrFail(req: Request): Response | null {
  return isSameOrigin(req.headers, getServices().env.APP_URL)
    ? null
    : Response.json(
        { error: "Požadavek z cizí adresy byl odmítnut.", code: "forbidden" },
        { status: 403 },
      );
}

export function clientKey(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}
