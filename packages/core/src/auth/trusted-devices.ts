import { and, desc, eq, gt, like } from "drizzle-orm";
import { schema, type Executor } from "../db/client";
import { inTx } from "../rbac/context";
import { NotFoundError, PermissionError } from "../rbac/errors";
import type { Ctx } from "../rbac/types";
import { recordSecurityEvent } from "./security-events";

/*
  Důvěryhodná zařízení (AUT-04). Knihovna přihlášení (Better Auth, plugin `twoFactor`) je řeší sama: při ověření kódu
  s volbou „důvěřovat zařízení“ uloží do cookie `trust_device` podepsaný odkaz na řádek tabulky `verification`
  (identifikátor `trust-device-…`, hodnota = id uživatele, platnost 30 dní) a při každém přihlášení z takového zařízení
  řádek obnoví na dalších 30 dní. Vlastní tabulka proto není potřeba; tady je jen výpis a odvolání (správa v profilu).
*/

/** Na jak dlouho se zařízení označí jako důvěryhodné (dny). Platnost se při každém přihlášení z něj obnoví. */
export const TRUSTED_DEVICE_DAYS = 30;

const PREFIX = "trust-device-";

export type TrustedDevice = {
  id: string;
  /** Kdy bylo zařízení označeno, nebo naposledy použito (řádek se při použití obnovuje). */
  createdAt: Date;
  expiresAt: Date;
  /** Je to zařízení, ze kterého se právě díváte. */
  current: boolean;
};

/** Z hlavičky `Cookie` vytáhne identifikátor důvěryhodného zařízení (jen k označení „toto zařízení“, nic neověřuje). */
export function trustedDeviceIdentifier(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  const m = /(?:^|;\s*)[^=;\s]*trust_device=([^;]*)/.exec(cookieHeader);
  if (!m) return null;
  return /trust-device-[A-Za-z0-9_-]+/.exec(decodeURIComponentSafe(m[1]!))?.[0] ?? null;
}

function decodeURIComponentSafe(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

function me(ctx: Ctx): string {
  if (!ctx.actor.userId) throw new PermissionError();
  return ctx.actor.userId;
}

/** Důvěryhodná zařízení přihlášeného uživatele (platná), nejnovější první. `cookieHeader` označí aktuální zařízení. */
export async function listTrustedDevices(
  ctx: Ctx,
  cookieHeader?: string | null,
): Promise<TrustedDevice[]> {
  const userId = me(ctx);
  const current = trustedDeviceIdentifier(cookieHeader);
  const rows = await ctx.db
    .select({
      id: schema.verification.id,
      identifier: schema.verification.identifier,
      createdAt: schema.verification.createdAt,
      expiresAt: schema.verification.expiresAt,
    })
    .from(schema.verification)
    .where(
      and(
        like(schema.verification.identifier, `${PREFIX}%`),
        eq(schema.verification.value, userId),
        gt(schema.verification.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(schema.verification.expiresAt));
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    current: current !== null && r.identifier === current,
  }));
}

/** Zruší důvěru k jednomu zařízení: příště se tam znovu vyžádá kód. Cizí zařízení se tváří jako neexistující. */
export async function revokeTrustedDevice(ctx: Ctx, id: string): Promise<void> {
  const userId = me(ctx);
  await inTx(ctx, async (c) => {
    const deleted = await c.db
      .delete(schema.verification)
      .where(
        and(
          eq(schema.verification.id, id),
          eq(schema.verification.value, userId),
          like(schema.verification.identifier, `${PREFIX}%`),
        ),
      )
      .returning({ id: schema.verification.id });
    if (!deleted.length) throw new NotFoundError("Zařízení nenalezeno, možná už důvěra skončila.");
    await recordSecurityEvent(c.db, {
      action: "trusted_device_revoked",
      userId,
      summary: "Zrušena důvěra k jednomu zařízení",
      ip: c.ip ?? null,
      requestId: c.requestId ?? null,
    });
  });
}

/** Zruší důvěru ke všem zařízením vlastního účtu. Vrací počet zrušených. */
export async function revokeAllTrustedDevices(ctx: Ctx): Promise<number> {
  const userId = me(ctx);
  return inTx(ctx, async (c) => {
    const n = await deleteTrustedDevices(c.db, userId);
    if (n > 0)
      await recordSecurityEvent(c.db, {
        action: "trusted_devices_revoked",
        userId,
        summary: `Zrušena důvěra ke všem zařízením (${n})`,
        ip: c.ip ?? null,
        requestId: c.requestId ?? null,
      });
    return n;
  });
}

/**
 * Smaže všechna důvěryhodná zařízení uživatele (po změně hesla, při odhlášení správcem). Bez auditu; zápis do historie
 * dělá volající, který ví proč.
 */
export async function deleteTrustedDevices(exec: Executor, userId: string): Promise<number> {
  const deleted = await exec
    .delete(schema.verification)
    .where(
      and(
        like(schema.verification.identifier, `${PREFIX}%`),
        eq(schema.verification.value, userId),
      ),
    )
    .returning({ id: schema.verification.id });
  return deleted.length;
}
