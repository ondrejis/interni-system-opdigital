import type { Db } from "../db/client";
import { newId } from "../db/ids";
import { createCtx } from "../rbac/context";
import { loadActor } from "../rbac/actor";
import type { Ctx } from "../rbac/types";
import type { Auth } from "./create-auth";
import { clientIp } from "./ip";

export type ResolveCtxOptions = {
  auth: Auth;
  db: Db;
  headers: Headers;
  /** Katalog oprávnění zapnutých modulů (viz `loadActor`). */
  catalog?: ReadonlySet<string>;
  /** Absolutní maximum stáří relace, bez ohledu na aktivitu. */
  maxSessionAgeDays?: number;
};

/**
 * Z cookie vyrobí kontext s aktérem, nebo `null` (nepřihlášen, relace vypršela,
 * účet deaktivován). Relace starší než absolutní maximum se zruší.
 */
export async function resolveCtx({
  auth,
  db,
  headers,
  catalog,
  maxSessionAgeDays = 30,
}: ResolveCtxOptions): Promise<Ctx | null> {
  const session = await auth.api.getSession({ headers });
  if (!session) return null;

  const age = Date.now() - new Date(session.session.createdAt).getTime();
  if (age > maxSessionAgeDays * 86_400_000) {
    await auth.api.signOut({ headers }).catch(() => {});
    return null;
  }

  const actor = await loadActor(db, session.user.id, catalog ? { catalog } : {});
  if (!actor) return null;
  return createCtx(db, actor, {
    requestId: headers.get("x-request-id") ?? newId(),
    ip: clientIp(headers),
  });
}
