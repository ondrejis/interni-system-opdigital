import { randomBytes } from "node:crypto";
import { and, count, desc, eq, isNull, like, ne, sql } from "drizzle-orm";
import { recordAudit } from "../audit/audit";
import type { Auth } from "../auth/create-auth";
import { schema } from "../db/client";
import { removeUserSubscriptions } from "../push/push";
import { inTx } from "../rbac/context";
import { NotFoundError, PermissionError, UserError } from "../rbac/errors";
import { assertCan, can } from "../rbac/permissions";
import type { Ctx } from "../rbac/types";

function me(ctx: Ctx): string {
  if (!ctx.actor.userId) throw new PermissionError();
  return ctx.actor.userId;
}

/** Seznam uživatelů pro administraci. */
export async function listUsers(ctx: Ctx) {
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
    })
    .from(schema.user)
    .innerJoin(schema.role, eq(schema.user.roleId, schema.role.id))
    .where(isNull(schema.user.deletedAt))
    .orderBy(schema.user.name);
}

/** V každé systémové roli (majitel) musí vždy zůstat aspoň jeden aktivní uživatel, jinak by se nikdo nedostal k nastavení. */
async function assertAnotherOwner(ctx: Ctx, exceptUserId: string, systemRoleId: string) {
  const [row] = await ctx.db
    .select({ n: count() })
    .from(schema.user)
    .where(
      and(
        eq(schema.user.roleId, systemRoleId),
        eq(schema.user.active, true),
        isNull(schema.user.deletedAt),
        ne(schema.user.id, exceptUserId),
      ),
    );
  if (!row?.n) throw new UserError("V systému musí zůstat alespoň jeden aktivní majitel.");
}

async function loadTarget(ctx: Ctx, userId: string) {
  const [u] = await ctx.db
    .select({ user: schema.user, roleIsSystem: schema.role.isSystem, roleName: schema.role.name })
    .from(schema.user)
    .innerJoin(schema.role, eq(schema.user.roleId, schema.role.id))
    .where(and(eq(schema.user.id, userId), isNull(schema.user.deletedAt)));
  if (!u) throw new NotFoundError("Uživatel nenalezen.");
  return u;
}

/** Správu majitele (systémové role) smí dělat jen majitel — jinak by se z `users.manage` dalo stát majitelem. */
function assertCanManageSystemRole(ctx: Ctx) {
  if (!ctx.actor.unrestricted && !ctx.actor.systemRole)
    throw new PermissionError("Majitele nebo systémovou roli smí spravovat jen majitel.");
}

export async function setUserRole(ctx: Ctx, userId: string, roleId: string) {
  assertCan(ctx, "users.manage");
  const actor = me(ctx);
  if (userId === actor) throw new UserError("Svou vlastní roli změnit nemůžete.");
  await inTx(ctx, async (c) => {
    const target = await loadTarget(c, userId);
    const [role] = await c.db
      .select()
      .from(schema.role)
      .where(and(eq(schema.role.id, roleId), isNull(schema.role.deletedAt)));
    if (!role) throw new UserError("Vybraná role neexistuje.");
    if (role.isSystem || target.roleIsSystem) assertCanManageSystemRole(c);
    if (target.roleIsSystem && target.user.roleId !== roleId)
      await assertAnotherOwner(c, userId, target.user.roleId);
    if (target.user.roleId === roleId) return;
    await c.db
      .update(schema.user)
      .set({ roleId, updatedBy: actor })
      .where(eq(schema.user.id, userId));
    await c.db.delete(schema.session).where(eq(schema.session.userId, userId)); // nová oprávnění platí hned, uživatel se přihlásí znovu
    await recordAudit(c, {
      action: "update",
      entityType: "user",
      entityId: userId,
      summary: `Změna role: ${target.roleName} → ${role.name}`,
      changes: [{ field: "role", old: target.roleName, new: role.name }],
    });
  });
}

/** Deaktivuje nebo znovu aktivuje účet. Deaktivovaný se okamžitě odhlásí ze všech zařízení. */
export async function setUserActive(ctx: Ctx, userId: string, active: boolean) {
  assertCan(ctx, "users.manage");
  const actor = me(ctx);
  if (userId === actor) throw new UserError("Sami sebe nemůžete deaktivovat.");
  await inTx(ctx, async (c) => {
    const target = await loadTarget(c, userId);
    if (target.roleIsSystem) assertCanManageSystemRole(c);
    if (!active && target.roleIsSystem) await assertAnotherOwner(c, userId, target.user.roleId);
    if (target.user.active === active) return;
    await c.db
      .update(schema.user)
      .set({ active, updatedBy: actor })
      .where(eq(schema.user.id, userId));
    if (!active) {
      await c.db.delete(schema.session).where(eq(schema.session.userId, userId));
      // deaktivovanému účtu nesmí chodit upozornění do žádného zařízení
      await removeUserSubscriptions(c.db, userId);
    }
    await recordAudit(c, {
      action: active ? "activate" : "deactivate",
      entityType: "user",
      entityId: userId,
      summary: `${active ? "Aktivován" : "Deaktivován"} účet ${target.user.email}`,
      changes: [{ field: "active", old: !active, new: active }],
    });
  });
}

/** Odhlásí uživatele ze všech zařízení — sebe kdykoli, jiné jen správce uživatelů (majitele jen majitel). */
export async function revokeSessions(ctx: Ctx, userId: string) {
  if (userId !== me(ctx)) assertCan(ctx, "users.manage");
  await inTx(ctx, async (c) => {
    const target = await loadTarget(c, userId);
    if (userId !== me(c) && target.roleIsSystem) assertCanManageSystemRole(c);
    await c.db.delete(schema.session).where(eq(schema.session.userId, userId));
    await removeUserSubscriptions(c.db, userId); // odhlášení ze všech zařízení zruší i jejich odběry upozornění
    await recordAudit(c, {
      action: "revoke_sessions",
      entityType: "user",
      entityId: userId,
      summary: "Odhlášen ze všech zařízení",
    });
  });
}

/** Jak dlouho platí odkaz pro nastavení hesla (stejně jako odkaz z e-mailu). */
export const PASSWORD_RESET_TTL_MINUTES = 60;

export type PasswordResetResult =
  | { delivery: "email"; email: string }
  | { delivery: "link"; email: string; url: string; expiresAt: Date };

/**
 * Správce uživateli umožní nastavit si nové heslo (heslo za něj nikdy nenastavuje a nevidí).
 *
 * - S nastaveným odesíláním e-mailů (`deliverByEmail`) pošle uživateli odkaz e-mailem; správce ho nevidí.
 * - Bez e-mailů vznikne jednorázový odkaz s platností 1 hodina, který správce jednou dostane k předání (osobně, telefonem).
 *   Odkaz je stejný jako z e-mailu, takže po jeho použití se zruší všechna přihlášení uživatele a 2FA zůstává v platnosti.
 *   V auditu je jen to, že odkaz vznikl, nikdy jeho obsah.
 *
 * Dříve vydané, nepoužité odkazy tohoto uživatele se zneplatní.
 */
export async function sendPasswordReset(
  ctx: Ctx,
  deps: { auth: Auth; baseURL?: string; deliverByEmail?: boolean },
  userId: string,
): Promise<PasswordResetResult> {
  assertCan(ctx, "users.manage");
  const target = await loadTarget(ctx, userId);
  if (target.roleIsSystem) assertCanManageSystemRole(ctx);
  if (!target.user.active) throw new UserError("Účet je deaktivovaný. Nejdřív ho znovu aktivujte.");
  const email = target.user.email;
  const byEmail = deps.deliverByEmail ?? true;

  const purgeOld = (db: Ctx["db"]) =>
    db
      .delete(schema.verification)
      .where(
        and(
          like(schema.verification.identifier, "reset-password:%"),
          eq(schema.verification.value, userId),
        ),
      );

  if (byEmail) {
    await purgeOld(ctx.db);
    await deps.auth.api.requestPasswordReset({ body: { email, redirectTo: "/obnova-hesla" } });
    await recordAudit(ctx, {
      action: "password_reset_sent",
      entityType: "user",
      entityId: userId,
      summary: `Odeslán odkaz pro nastavení hesla: ${email}`,
    });
    return { delivery: "email", email };
  }

  if (!deps.baseURL) throw new Error("Chybí adresa aplikace pro odkaz.");
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60_000);
  // Odkaz i audit vznikají v jedné transakci; formát řádku je stejný, jaký vytváří žádost o reset hesla.
  await inTx(ctx, async (c) => {
    await purgeOld(c.db);
    await c.db.insert(schema.verification).values({
      identifier: `reset-password:${token}`,
      value: userId,
      expiresAt,
    });
    await recordAudit(c, {
      action: "password_reset_link",
      entityType: "user",
      entityId: userId,
      summary: `Vytvořen jednorázový odkaz pro nastavení hesla (bez e-mailu): ${email}`,
    });
  });
  const url = new URL("/obnova-hesla", deps.baseURL);
  url.searchParams.set("token", token);
  return { delivery: "link", email, url: url.toString(), expiresAt };
}

/** Historie přihlášení: svá vidí každý, cizí správce uživatelů. */
export async function listLoginEvents(ctx: Ctx, userId: string, limit = 50) {
  if (userId !== me(ctx) && !can(ctx, "users.manage")) throw new PermissionError();
  return ctx.db
    .select({
      outcome: schema.loginEvent.outcome,
      ipAddress: schema.loginEvent.ipAddress,
      userAgent: schema.loginEvent.userAgent,
      createdAt: schema.loginEvent.createdAt,
    })
    .from(schema.loginEvent)
    .where(eq(schema.loginEvent.userId, userId))
    .orderBy(desc(schema.loginEvent.createdAt))
    .limit(Math.min(limit, 200));
}

/** Změna vlastního jména. */
export async function updateOwnName(ctx: Ctx, name: string) {
  const id = me(ctx);
  const clean = name.trim();
  if (clean.length < 2) throw new UserError("Vyplňte jméno.");
  await inTx(ctx, async (c) => {
    const [before] = await c.db
      .select({ name: schema.user.name })
      .from(schema.user)
      .where(eq(schema.user.id, id));
    await c.db
      .update(schema.user)
      .set({ name: clean, updatedBy: id })
      .where(eq(schema.user.id, id));
    await recordAudit(c, {
      action: "update",
      entityType: "user",
      entityId: id,
      changes: [{ field: "name", old: before?.name ?? null, new: clean }],
    });
  });
}

/** Aktivní uživatelé pro výběr (řešitel úkolu, vedoucí zakázky, zmínka). Jména vidí každý přihlášený. */
export async function lookupUsers(ctx: Ctx, query: string, limit = 20) {
  me(ctx);
  const q = query.trim();
  const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  return ctx.db
    .select({ id: schema.user.id, name: schema.user.name })
    .from(schema.user)
    .where(
      and(
        eq(schema.user.active, true),
        isNull(schema.user.deletedAt),
        q
          ? sql`lower(f_unaccent(${schema.user.name})) like lower(f_unaccent(${pattern})) escape '\\'`
          : undefined,
      ),
    )
    .orderBy(schema.user.name)
    .limit(Math.min(limit, 50));
}
