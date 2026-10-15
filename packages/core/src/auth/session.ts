import type { Db } from "../db/client";
import { newId } from "../db/ids";
import { createCtx } from "../rbac/context";
import { loadActor } from "../rbac/actor";
import type { Ctx } from "../rbac/types";
import type { Auth } from "./create-auth";
import { clientIp } from "./ip";
import { DEFAULT_TWO_FACTOR_POLICY, type TwoFactorPolicy } from "./policy";

export type ResolveCtxOptions = {
  auth: Auth;
  db: Db;
  headers: Headers;
  /** Katalog oprávnění zapnutých modulů (viz `loadActor`). */
  catalog?: ReadonlySet<string>;
  /**
   * Absolutní maximum stáří relace, bez ohledu na aktivitu (dny). Relace se jinak při aktivitě prodlužuje
   * (klouzavé odhlášení po neaktivitě, `security.idleTimeoutMinutes`), takže bez maxima by platila navždy.
   */
  maxSessionAgeDays?: number;
  /** Komu je druhý faktor povinný (výchozí všem). Musí odpovídat volbě v `createAuth`. */
  twoFactorPolicy?: TwoFactorPolicy;
};

/**
 * Z cookie vyrobí kontext s aktérem, nebo `null` (nepřihlášen, relace vypršela,
 * účet deaktivován). Relace starší než absolutní maximum se zruší.
 *
 * Povinné druhé ověření: uživatel, který ho nemá nastavené, dostane omezený kontext (`restriction: "2fa_setup"`)
 * a smí jen nastavit ověření. Bez druhého faktoru se tedy nikdo dál nedostane, ani přes API.
 */
export async function resolveCtx({
  auth,
  db,
  headers,
  catalog,
  maxSessionAgeDays = 90,
  twoFactorPolicy = DEFAULT_TWO_FACTOR_POLICY,
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
  const twoFactorEnabled = (session.user as { twoFactorEnabled?: boolean | null }).twoFactorEnabled;
  if (twoFactorPolicy === "all" && !twoFactorEnabled && !actor.restriction)
    actor.restriction = "2fa_setup";
  return createCtx(db, actor, {
    requestId: headers.get("x-request-id") ?? newId(),
    ip: clientIp(headers),
  });
}
