import { and, eq, isNull } from "drizzle-orm";
import { schema, type Executor } from "../db/client";
import type { Scope } from "./types";

export type RoleDef = {
  key: string;
  name: string;
  description?: string;
  /** Systémová role dostane všechna oprávnění sestavy a nejde smazat (owner). */
  isSystem?: boolean;
  /** Oprávnění role: klíč → rozsah (`all`, `own`); `true` = `all`. */
  permissions?: Record<string, Scope | true>;
};

export type EnsureRolesOptions = {
  /** Katalog oprávnění zapnutých modulů. Klíče mimo katalog se u nových rolí přeskočí; neznámý tvar je chyba. */
  catalog?: ReadonlySet<string>;
  /** Klíče rolí, pro které je 2FA povinné. Hodnota z konfigurace je minimum — nikdy se nesnižuje. */
  require2faRoles?: readonly string[];
};

/**
 * Založí chybějící role z výchozí definice (seed klienta). Existující role se nemění
 * (správce je upravil v administraci), jen se jim dorovná povinné 2FA podle konfigurace.
 */
export async function ensureRoles(
  db: Executor,
  defs: readonly RoleDef[],
  { catalog, require2faRoles = [] }: EnsureRolesOptions = {},
): Promise<void> {
  for (const def of defs) {
    const need2fa = require2faRoles.includes(def.key);
    const [existing] = await db
      .select()
      .from(schema.role)
      .where(and(eq(schema.role.key, def.key), isNull(schema.role.deletedAt)));
    if (existing) {
      if (need2fa && !existing.require2fa)
        await db
          .update(schema.role)
          .set({ require2fa: true })
          .where(eq(schema.role.id, existing.id));
      continue;
    }
    const [role] = await db
      .insert(schema.role)
      .values({
        key: def.key,
        name: def.name,
        description: def.description ?? null,
        isSystem: def.isSystem ?? false,
        require2fa: need2fa,
      })
      .returning({ id: schema.role.id });
    const rows = Object.entries(def.permissions ?? {})
      .filter(([key]) => !catalog || catalog.has(key))
      .map(([permission, scope]) => ({
        roleId: role!.id,
        permission,
        scope: scope === true ? ("all" as const) : scope,
      }));
    if (rows.length) await db.insert(schema.rolePermission).values(rows);
  }
}
