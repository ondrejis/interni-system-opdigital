import { and, eq, isNull } from "drizzle-orm";
import type { Executor } from "../db/client";
import { schema } from "../db/client";
import type { Actor, Scope } from "./types";

export type LoadActorOptions = {
  /**
   * Katalog oprávnění zapnutých modulů (klíče). Oprávnění mimo katalog se zahodí,
   * takže vypnutý modul nezanechá žádné oprávnění. Bez katalogu se nefiltruje.
   */
  catalog?: ReadonlySet<string>;
};

/**
 * Načte aktéra (uživatele s oprávněními jeho role). Vrací `null` pro neexistujícího,
 * deaktivovaného nebo smazaného uživatele. Systémová role (owner) dostane všechna
 * oprávnění katalogu v rozsahu `all`, aby se po přidání modulu nemusela doplňovat.
 */
export async function loadActor(
  db: Executor,
  userId: string,
  options: LoadActorOptions = {},
): Promise<Actor | null> {
  const [row] = await db
    .select({
      active: schema.user.active,
      twoFactorEnabled: schema.user.twoFactorEnabled,
      roleId: schema.role.id,
      roleKey: schema.role.key,
      isSystem: schema.role.isSystem,
      require2fa: schema.role.require2fa,
    })
    .from(schema.user)
    .innerJoin(schema.role, eq(schema.user.roleId, schema.role.id))
    .where(
      and(eq(schema.user.id, userId), isNull(schema.user.deletedAt), isNull(schema.role.deletedAt)),
    );
  if (!row || !row.active) return null;

  const permissions = new Map<string, Scope>();
  if (row.isSystem && options.catalog) {
    for (const key of options.catalog) permissions.set(key, "all");
  } else {
    const rows = await db
      .select({ permission: schema.rolePermission.permission, scope: schema.rolePermission.scope })
      .from(schema.rolePermission)
      .where(eq(schema.rolePermission.roleId, row.roleId));
    for (const r of rows) {
      if (options.catalog && !options.catalog.has(r.permission)) continue;
      permissions.set(r.permission, r.scope);
    }
  }
  permissions.set("account.self", "all");

  return {
    kind: "user",
    userId,
    roleKey: row.roleKey,
    systemRole: row.isSystem,
    permissions,
    unrestricted: false,
    restriction: row.require2fa && !row.twoFactorEnabled ? "2fa_setup" : null,
  };
}
