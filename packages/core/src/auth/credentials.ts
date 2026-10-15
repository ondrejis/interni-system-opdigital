import { and, desc, eq, gt, ne } from "drizzle-orm";
import { z } from "zod";
import "../zod-locale";
import { schema } from "../db/client";
import { consumeRateLimit } from "../http";
import { inTx } from "../rbac/context";
import { NotFoundError, PermissionError, UserError } from "../rbac/errors";
import type { Ctx } from "../rbac/types";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, hashPassword, verifyPassword } from "./password";
import { assertPasswordAcceptable, type BreachCheck } from "./password-policy";
import { recordSecurityEvent } from "./security-events";
import { deleteTrustedDevices } from "./trusted-devices";
import { describeUserAgent, maskIp } from "./user-agent";

/** Pokusů o změnu hesla (správných i špatných) za okno; chrání současné heslo před hádáním z ukradené relace. */
export const PASSWORD_CHANGE_LIMIT = { attempts: 6, windowSeconds: 600 } as const;

/** Vstup změny hesla; stejné minimum jako u pozvánky a obnovy hesla. */
export const changePasswordInput = z.object({
  currentPassword: z.string().min(1, "Zadejte současné heslo.").max(MAX_PASSWORD_LENGTH),
  newPassword: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Nové heslo musí mít alespoň ${MIN_PASSWORD_LENGTH} znaků.`)
    .max(MAX_PASSWORD_LENGTH, `Nové heslo smí mít nejvýš ${MAX_PASSWORD_LENGTH} znaků.`),
});

function me(ctx: Ctx): string {
  if (!ctx.actor.userId) throw new PermissionError();
  return ctx.actor.userId;
}

/**
 * Změna vlastního hesla. Ověří současné heslo (omezení počtu pokusů v databázi), nové heslo zkontroluje (délka,
 * běžná a uniklá hesla), uloží otisk nového hesla, odhlásí ostatní zařízení a zruší důvěryhodná zařízení; do historie
 * (kategorie bezpečnost) zapíše změnu bez jakékoli hodnoty hesla; vše v jedné transakci.
 *
 * `keepSessionId` je relace, která zůstane přihlášená (obvykle ta, ze které se heslo mění). `null` odhlásí všechny.
 * `breachCheck` jen pro testy (zdroj uniklých hesel).
 */
export async function changeOwnPassword(
  ctx: Ctx,
  raw: z.input<typeof changePasswordInput>,
  opts: { keepSessionId: string | null; breachCheck?: BreachCheck },
): Promise<{ revokedSessions: number }> {
  const userId = me(ctx);
  const input = changePasswordInput.parse(raw);

  if (
    !(await consumeRateLimit(
      ctx.db,
      `change-password:${userId}`,
      PASSWORD_CHANGE_LIMIT.attempts,
      PASSWORD_CHANGE_LIMIT.windowSeconds,
    ))
  )
    throw new UserError("Příliš mnoho pokusů o změnu hesla. Zkuste to znovu za několik minut.");

  if (input.newPassword === input.currentPassword)
    throw new UserError("Nové heslo musí být jiné než současné.");

  const [acc] = await ctx.db
    .select({ id: schema.account.id, password: schema.account.password })
    .from(schema.account)
    .where(and(eq(schema.account.userId, userId), eq(schema.account.providerId, "credential")));
  if (!acc?.password)
    throw new UserError(
      "Tento účet nemá nastavené heslo. Použijte odkaz „Zapomenuté heslo“ na přihlašovací stránce.",
    );

  const valid = await verifyPassword({ hash: acc.password, password: input.currentPassword });
  if (!valid) {
    await recordSecurityEvent(ctx.db, {
      action: "change_password_failed",
      userId,
      summary: "Změna hesla zamítnuta: nesprávné současné heslo",
      ip: ctx.ip ?? null,
      requestId: ctx.requestId ?? null,
    });
    throw new UserError("Současné heslo není správné.");
  }

  const [who] = await ctx.db
    .select({ email: schema.user.email, name: schema.user.name })
    .from(schema.user)
    .where(eq(schema.user.id, userId));
  await assertPasswordAcceptable(input.newPassword, {
    email: who?.email ?? null,
    name: who?.name ?? null,
    ...(opts.breachCheck !== undefined ? { breachCheck: opts.breachCheck } : {}),
  });

  const hash = await hashPassword(input.newPassword);
  return inTx(ctx, async (c) => {
    await c.db.update(schema.account).set({ password: hash }).where(eq(schema.account.id, acc.id));
    await c.db
      .update(schema.user)
      .set({ mustChangePassword: false, updatedBy: userId })
      .where(eq(schema.user.id, userId));
    const revoked = await c.db
      .delete(schema.session)
      .where(
        opts.keepSessionId
          ? and(eq(schema.session.userId, userId), ne(schema.session.id, opts.keepSessionId))
          : eq(schema.session.userId, userId),
      )
      .returning({ id: schema.session.id });
    await deleteTrustedDevices(c.db, userId);
    await recordSecurityEvent(c.db, {
      action: "change_password",
      userId,
      summary:
        revoked.length > 0
          ? `Změna hesla, odhlášeno ${revoked.length} dalších přihlášení`
          : "Změna hesla",
      ip: c.ip ?? null,
      requestId: c.requestId ?? null,
    });
    return { revokedSessions: revoked.length };
  });
}

export type OwnSession = {
  id: string;
  current: boolean;
  browser: string;
  os: string;
  device: "mobile" | "tablet" | "desktop";
  label: string;
  /** Zkrácená adresa (poslední část skrytá). */
  ip: string | null;
  createdAt: Date;
  lastActiveAt: Date;
};

/** Aktivní přihlášení (zařízení) přihlášeného uživatele, nejnovější aktivita první. Každý vidí jen svá. */
export async function listOwnSessions(
  ctx: Ctx,
  currentSessionId: string | null,
): Promise<OwnSession[]> {
  const userId = me(ctx);
  const rows = await ctx.db
    .select({
      id: schema.session.id,
      userAgent: schema.session.userAgent,
      ipAddress: schema.session.ipAddress,
      createdAt: schema.session.createdAt,
      updatedAt: schema.session.updatedAt,
    })
    .from(schema.session)
    .where(and(eq(schema.session.userId, userId), gt(schema.session.expiresAt, new Date())))
    .orderBy(desc(schema.session.updatedAt));
  return rows.map((r) => ({
    id: r.id,
    current: r.id === currentSessionId,
    ...describeUserAgent(r.userAgent),
    ip: maskIp(r.ipAddress),
    createdAt: r.createdAt,
    lastActiveAt: r.updatedAt,
  }));
}

/** Odhlásí jedno vlastní zařízení. Cizí přihlášení se tváří jako neexistující. */
export async function revokeOwnSession(
  ctx: Ctx,
  sessionId: string,
  currentSessionId: string | null,
): Promise<{ current: boolean }> {
  const userId = me(ctx);
  await inTx(ctx, async (c) => {
    const deleted = await c.db
      .delete(schema.session)
      .where(and(eq(schema.session.id, sessionId), eq(schema.session.userId, userId)))
      .returning({ id: schema.session.id });
    if (!deleted.length) throw new NotFoundError("Přihlášení nenalezeno, možná už skončilo.");
    await recordSecurityEvent(c.db, {
      action: "revoke_session",
      userId,
      summary:
        sessionId === currentSessionId
          ? "Odhlášeno toto zařízení"
          : "Odhlášeno jedno z ostatních zařízení",
      ip: c.ip ?? null,
      requestId: c.requestId ?? null,
    });
  });
  return { current: sessionId === currentSessionId };
}

/** Odhlásí všechna vlastní zařízení kromě aktuálního. Vrací počet odhlášených. */
export async function revokeOtherOwnSessions(
  ctx: Ctx,
  currentSessionId: string | null,
): Promise<number> {
  const userId = me(ctx);
  if (!currentSessionId) throw new UserError("Přihlášení vypršelo. Přihlaste se znovu.");
  return inTx(ctx, async (c) => {
    const deleted = await c.db
      .delete(schema.session)
      .where(and(eq(schema.session.userId, userId), ne(schema.session.id, currentSessionId)))
      .returning({ id: schema.session.id });
    await recordSecurityEvent(c.db, {
      action: "revoke_sessions",
      userId,
      summary: `Odhlášena ostatní zařízení (${deleted.length})`,
      ip: c.ip ?? null,
      requestId: c.requestId ?? null,
    });
    return deleted.length;
  });
}
