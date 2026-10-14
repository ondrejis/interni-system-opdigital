import { and, eq, isNull, sql } from "drizzle-orm";
import { schema, type Executor } from "../db/client";
import type { Actor } from "../rbac/types";
import { MONEY_PERMISSIONS } from "./money";

/**
 * Aktivní uživatelé, kteří mají dané oprávnění (v kterémkoli rozsahu), a majitelé (systémová role má vždy všechna).
 * Pro upozornění typu „schválená vícepráce → fakturace“.
 */
export async function usersWithPermission(db: Executor, permission: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ id: schema.user.id })
    .from(schema.user)
    .innerJoin(schema.role, eq(schema.user.roleId, schema.role.id))
    .leftJoin(schema.rolePermission, eq(schema.rolePermission.roleId, schema.role.id))
    .where(
      and(
        isNull(schema.user.deletedAt),
        eq(schema.user.active, true),
        sql`(${schema.role.isSystem} or ${schema.rolePermission.permission} = ${permission})`,
      ),
    );
  return rows.map((r) => r.id);
}

/** Aktivní uživatelé s danou rolí (podle klíče role). */
export async function usersWithRole(db: Executor, roleKey: string): Promise<string[]> {
  const rows = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .innerJoin(schema.role, eq(schema.user.roleId, schema.role.id))
    .where(
      and(
        eq(schema.role.key, roleKey),
        isNull(schema.role.deletedAt),
        isNull(schema.user.deletedAt),
        eq(schema.user.active, true),
      ),
    );
  return rows.map((r) => r.id);
}

/**
 * Má aktér oprávnění? Vlastník (systémová role) má vždy všechna; u rozsahu `own` rozhodují vlastníci záznamu.
 * Nezávisí na katalogu oprávnění, takže funguje i pro aktéra načteného bez něj.
 */
export function actorHas(
  actor: Actor,
  permission: string,
  owners?: { ownerIds: ReadonlyArray<string | null | undefined> },
): boolean {
  if (actor.systemRole || actor.unrestricted) return true;
  const scope = actor.permissions.get(permission);
  if (!scope) return false;
  if (scope === "all" || !owners) return true;
  return !!actor.userId && owners.ownerIds.includes(actor.userId);
}

export const actorHasAny = (
  actor: Actor,
  permissions: string | readonly string[],
  owners?: { ownerIds: ReadonlyArray<string | null | undefined> },
) =>
  (typeof permissions === "string" ? [permissions] : permissions).some((p) =>
    actorHas(actor, p, owners),
  );

/** Smí aktér vidět částky? */
export const canSeeMoney = (actor: Actor) => actorHasAny(actor, MONEY_PERMISSIONS);
