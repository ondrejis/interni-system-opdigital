import { and, count, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import "../zod-locale";
import { recordAudit } from "../audit/audit";
import { schema } from "../db/client";
import { inTx } from "../rbac/context";
import { NotFoundError, UserError } from "../rbac/errors";
import { assertCan, can } from "../rbac/permissions";
import type { Ctx, Scope } from "../rbac/types";

/** Role s oprávněními a počtem uživatelů (pro matici oprávnění v administraci). */
export async function listRoles(ctx: Ctx) {
  assertCan(ctx, "roles.manage");
  const roles = await ctx.db
    .select()
    .from(schema.role)
    .where(isNull(schema.role.deletedAt))
    .orderBy(schema.role.name);
  const perms = await ctx.db.select().from(schema.rolePermission);
  const users = await ctx.db
    .select({ roleId: schema.user.roleId, n: count() })
    .from(schema.user)
    .where(isNull(schema.user.deletedAt))
    .groupBy(schema.user.roleId);
  return roles.map((r) => ({
    ...r,
    permissions: Object.fromEntries(
      perms.filter((p) => p.roleId === r.id).map((p) => [p.permission, p.scope]),
    ) as Record<string, Scope>,
    userCount: users.find((u) => u.roleId === r.id)?.n ?? 0,
  }));
}

/**
 * Role k výběru při přidělování (id, název, příznak systémové). Smí ji vidět ten, kdo spravuje uživatele nebo role;
 * oprávnění jednotlivých rolí z ní nevyčtete (ta jsou jen pro `roles.manage`).
 */
export async function lookupRoles(ctx: Ctx) {
  if (!can(ctx, "users.manage") && !can(ctx, "roles.manage")) assertCan(ctx, "users.manage");
  return ctx.db
    .select({ id: schema.role.id, name: schema.role.name, isSystem: schema.role.isSystem })
    .from(schema.role)
    .where(isNull(schema.role.deletedAt))
    .orderBy(schema.role.name);
}

const roleInput = z.object({
  key: z
    .string()
    .regex(
      /^[a-z][a-z0-9_]{1,30}$/,
      "Klíč role: malá písmena, číslice a podtržítko, začíná písmenem.",
    ),
  name: z.string().trim().min(2, "Vyplňte název role.").max(60),
  description: z.string().trim().max(200).nullish(),
  require2fa: z.boolean().default(false),
});

async function loadRole(ctx: Ctx, id: string) {
  const [role] = await ctx.db
    .select()
    .from(schema.role)
    .where(and(eq(schema.role.id, id), isNull(schema.role.deletedAt)));
  if (!role) throw new NotFoundError("Role nenalezena.");
  return role;
}

export async function createRole(ctx: Ctx, raw: z.input<typeof roleInput>) {
  assertCan(ctx, "roles.manage");
  const d = roleInput.parse(raw);
  return inTx(ctx, async (c) => {
    const [dup] = await c.db
      .select({ id: schema.role.id })
      .from(schema.role)
      .where(and(eq(schema.role.key, d.key), isNull(schema.role.deletedAt)));
    if (dup) throw new UserError("Role s tímto klíčem už existuje.");
    const [role] = await c.db
      .insert(schema.role)
      .values({
        key: d.key,
        name: d.name,
        description: d.description ?? null,
        require2fa: d.require2fa,
        createdBy: c.actor.userId,
        updatedBy: c.actor.userId,
      })
      .returning();
    await recordAudit(c, {
      action: "create",
      entityType: "role",
      entityId: role!.id,
      summary: `Role ${d.name}`,
      changes: [{ field: "name", old: null, new: d.name }],
    });
    return role!;
  });
}

/** Systémovou roli (majitel) nejde měnit ani mazat — správce by se mohl zamknout mimo systém. */
export async function updateRole(
  ctx: Ctx,
  id: string,
  patch: { name?: string; description?: string | null; require2fa?: boolean },
) {
  assertCan(ctx, "roles.manage");
  await inTx(ctx, async (c) => {
    const before = await loadRole(c, id);
    if (before.isSystem) throw new UserError("Systémovou roli nelze upravit.");
    const after = {
      name: patch.name?.trim() || before.name,
      description:
        patch.description === undefined ? before.description : patch.description?.trim() || null,
      require2fa: patch.require2fa ?? before.require2fa,
    };
    if (after.name.length < 2) throw new UserError("Vyplňte název role.");
    await c.db
      .update(schema.role)
      .set({ ...after, updatedBy: c.actor.userId })
      .where(eq(schema.role.id, id));
    const changes = (["name", "description", "require2fa"] as const)
      .filter((f) => after[f] !== before[f])
      .map((f) => ({ field: f, old: before[f], new: after[f] }));
    if (changes.length)
      await recordAudit(c, {
        action: "update",
        entityType: "role",
        entityId: id,
        summary: `Role ${after.name}`,
        changes,
      });
  });
}

/**
 * Nastaví oprávnění role (celá sada najednou). Klíče musí být v katalogu zapnutých modulů.
 * Změny se zapíší do auditu po jednotlivých oprávněních; platí pro další požadavek uživatelů role.
 */
export async function setRolePermissions(
  ctx: Ctx,
  id: string,
  permissions: Record<string, Scope>,
  catalog: ReadonlySet<string>,
) {
  assertCan(ctx, "roles.manage");
  const unknown = Object.keys(permissions).filter((k) => !catalog.has(k));
  if (unknown.length) throw new UserError(`Neznámá oprávnění: ${unknown.join(", ")}.`);
  for (const [k, s] of Object.entries(permissions))
    if (s !== "all" && s !== "own") throw new UserError(`Neplatný rozsah u oprávnění ${k}.`);
  // soukromé záznamy vidí jen vlastník (systémová role); žádné roli, ani Patrikově, ho nejde přidělit
  if ("private.read" in permissions)
    throw new UserError(
      "Oprávnění vidět soukromé záznamy nejde přidělit žádné roli: vidí je jen vlastník.",
    );

  await inTx(ctx, async (c) => {
    const role = await loadRole(c, id);
    if (role.isSystem)
      throw new UserError("Oprávnění systémové role nelze měnit — majitel má vždy všechna.");
    const current = await c.db
      .select()
      .from(schema.rolePermission)
      .where(eq(schema.rolePermission.roleId, id));
    const before = Object.fromEntries(current.map((p) => [p.permission, p.scope as Scope]));

    await c.db.delete(schema.rolePermission).where(eq(schema.rolePermission.roleId, id));
    const rows = Object.entries(permissions).map(([permission, scope]) => ({
      roleId: id,
      permission,
      scope,
    }));
    if (rows.length) await c.db.insert(schema.rolePermission).values(rows);

    const keys = new Set([...Object.keys(before), ...Object.keys(permissions)]);
    const changes = [...keys]
      .filter((k) => before[k] !== permissions[k])
      .sort()
      .map((k) => ({
        field: `oprávnění ${k}`,
        old: before[k] ?? null,
        new: permissions[k] ?? null,
      }));
    if (changes.length)
      await recordAudit(c, {
        action: "update",
        entityType: "role",
        entityId: id,
        summary: `Oprávnění role ${role.name}`,
        changes,
      });
  });
}

export async function deleteRole(ctx: Ctx, id: string) {
  assertCan(ctx, "roles.manage");
  await inTx(ctx, async (c) => {
    const role = await loadRole(c, id);
    if (role.isSystem) throw new UserError("Systémovou roli nelze smazat.");
    const [users] = await c.db
      .select({ n: count() })
      .from(schema.user)
      .where(and(eq(schema.user.roleId, id), isNull(schema.user.deletedAt)));
    if (users?.n)
      throw new UserError(`Roli má přiřazeno ${users.n} uživatelů. Nejdřív jim nastavte jinou.`);
    await c.db
      .update(schema.role)
      .set({ deletedAt: new Date(), updatedBy: c.actor.userId })
      .where(eq(schema.role.id, id));
    await recordAudit(c, {
      action: "delete",
      entityType: "role",
      entityId: id,
      summary: `Role ${role.name} smazána`,
    });
  });
}
