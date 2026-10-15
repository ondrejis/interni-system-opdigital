import { and, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import "../zod-locale";
import { revokeSessions } from "../admin/users";
import { auditChange } from "../audit/audit";
import { schema } from "../db/client";
import { inTx } from "../rbac/context";
import { NotFoundError, PermissionError, UserError } from "../rbac/errors";
import { assertCan } from "../rbac/permissions";
import type { Ctx } from "../rbac/types";
import { assertShortNameFree } from "./account";
import type { OwnSession } from "./credentials";
import { recordSecurityEvent } from "./security-events";
import { deleteTrustedDevices } from "./trusted-devices";
import { describeUserAgent, maskIp } from "./user-agent";
import { billingToolField, icoField, shortNameField } from "./user-fields";

/*
  Správa uživatelů pro majitele (Nastavení → Uživatelé, NAS-06): přehled s poli IČO, fakturační nástroj a zkratka,
  úprava těchto polí a odhlášení zařízení kohokoli. Pozvánky jsou v `invitations.ts`, role a deaktivace v `admin/users.ts`.
  Všechno vyžaduje `users.manage`, které má jen majitel.
*/

/** Aktivní uživatelé a deaktivovaní, s poli pro rozpisy plateb a stavem zabezpečení. */
export async function listManagedUsers(ctx: Ctx) {
  assertCan(ctx, "users.manage");
  return ctx.db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      email: schema.user.email,
      roleId: schema.role.id,
      roleName: schema.role.name,
      roleKey: schema.role.key,
      active: schema.user.active,
      twoFactorEnabled: schema.user.twoFactorEnabled,
      lastLoginAt: schema.user.lastLoginAt,
      createdAt: schema.user.createdAt,
      shortName: schema.user.shortName,
      avatarColor: schema.user.avatarColor,
      ico: schema.user.ico,
      billingTool: schema.user.billingTool,
      sessionCount: sql<number>`(select count(*)::int from session s where s.user_id = ${schema.user.id} and s.expires_at > now())`,
    })
    .from(schema.user)
    .innerJoin(schema.role, eq(schema.user.roleId, schema.role.id))
    .where(isNull(schema.user.deletedAt))
    .orderBy(schema.user.name);
}

/** Vstup úpravy polí uživatele; neuvedené pole zůstává beze změny, prázdné se smaže. */
export const userFieldsInput = z.object({
  userId: z.uuid(),
  shortName: shortNameField.optional(),
  ico: icoField.optional(),
  billingTool: billingToolField.optional(),
});

/**
 * Upraví zkratku, IČO a fakturační nástroj uživatele (jen majitel). Zkratka a IČO jsou mezi aktivními uživateli
 * jedinečné. Změna jde do historie s hodnotami před a po.
 */
export async function updateUserFields(
  ctx: Ctx,
  raw: z.input<typeof userFieldsInput> | z.output<typeof userFieldsInput>,
) {
  assertCan(ctx, "users.manage");
  const input = userFieldsInput.parse(raw);
  await inTx(ctx, async (c) => {
    const [before] = await c.db
      .select({
        name: schema.user.name,
        shortName: schema.user.shortName,
        ico: schema.user.ico,
        billingTool: schema.user.billingTool,
      })
      .from(schema.user)
      .where(and(eq(schema.user.id, input.userId), isNull(schema.user.deletedAt)));
    if (!before) throw new NotFoundError("Uživatel nenalezen.");

    const next = {
      shortName: input.shortName === undefined ? before.shortName : input.shortName,
      ico: input.ico === undefined ? before.ico : input.ico,
      billingTool: input.billingTool === undefined ? before.billingTool : input.billingTool,
    };
    if (next.shortName && next.shortName !== before.shortName)
      await assertShortNameFree(c, next.shortName, input.userId);
    if (next.ico && next.ico !== before.ico) {
      const [taken] = await c.db
        .select({ name: schema.user.name })
        .from(schema.user)
        .where(
          and(
            eq(schema.user.ico, next.ico),
            ne(schema.user.id, input.userId),
            isNull(schema.user.deletedAt),
            eq(schema.user.active, true),
          ),
        );
      if (taken) throw new UserError(`IČO ${next.ico} už je přiřazené uživateli ${taken.name}.`);
    }
    await c.db
      .update(schema.user)
      .set({ ...next, updatedBy: c.actor.userId })
      .where(eq(schema.user.id, input.userId));
    await auditChange(c, {
      entityType: "user",
      entityId: input.userId,
      before: {
        shortName: before.shortName,
        ico: before.ico,
        billingTool: before.billingTool,
      },
      after: next,
      summary: `Úprava údajů uživatele ${before.name}`,
    });
  });
}

/** Přihlášená zařízení (relace) cizího uživatele; jen majitel. Adresa je zkrácená stejně jako u vlastních zařízení. */
export async function listUserSessions(ctx: Ctx, userId: string): Promise<OwnSession[]> {
  assertCan(ctx, "users.manage");
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
    current: false,
    ...describeUserAgent(r.userAgent),
    ip: maskIp(r.ipAddress),
    createdAt: r.createdAt,
    lastActiveAt: r.updatedAt,
  }));
}

/**
 * Odhlásí uživatele ze všech zařízení a zruší jeho důvěryhodná zařízení (příště se vyžádá kód). Sebe kdykoli, jiné jen
 * majitel (`users.manage`, majitele jen majitel). Do historie jde událost „odhlášena zařízení“ u dotčeného účtu.
 */
export async function revokeUserSessions(ctx: Ctx, userId: string): Promise<void> {
  await revokeSessions(ctx, userId);
  await deleteTrustedDevices(ctx.db, userId);
}

/** Odhlásí jedno konkrétní zařízení cizího uživatele (jen majitel). */
export async function revokeUserSession(
  ctx: Ctx,
  userId: string,
  sessionId: string,
): Promise<void> {
  assertCan(ctx, "users.manage");
  if (userId === ctx.actor.userId) throw new PermissionError();
  await inTx(ctx, async (c) => {
    const deleted = await c.db
      .delete(schema.session)
      .where(and(eq(schema.session.id, sessionId), eq(schema.session.userId, userId)))
      .returning({ id: schema.session.id });
    if (!deleted.length) throw new NotFoundError("Přihlášení nenalezeno, možná už skončilo.");
    await recordSecurityEvent(c.db, {
      action: "revoke_session",
      userId,
      actorId: c.actor.userId,
      summary: "Správce odhlásil jedno zařízení uživatele",
      ip: c.ip ?? null,
      requestId: c.requestId ?? null,
    });
  });
}
