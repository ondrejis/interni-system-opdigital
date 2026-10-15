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
 * Založí chybějící role z výchozí definice (seed klienta). Existující role správce upravil v administraci, proto se jim
 * dorovná jen povinné 2FA podle konfigurace a oprávnění, která seed přidal nově (např. nový modul): ta se jen přidají,
 * nikdy neodeberou a nepřidá se znovu to, co správce ručně odebral (seznam už nasazených oprávnění je v nastavení
 * `rbac.seeded.<klíč role>`). Oprávnění `private.read` nedostane žádná role kromě systémové.
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
      if (!existing.isSystem) await addNewPermissions(db, existing.id, def, catalog);
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
      .filter(([key]) => (!catalog || catalog.has(key)) && key !== "private.read")
      .map(([permission, scope]) => ({
        roleId: role!.id,
        permission,
        scope: scope === true ? ("all" as const) : scope,
      }));
    if (rows.length) await db.insert(schema.rolePermission).values(rows);
    await addNewPermissions(db, role!.id, def, catalog); // jen zapíše, co je nasazené
  }
}

/** Doplní existující roli oprávnění, která seed přidal od posledního běhu (ne ta, která správce odebral). */
async function addNewPermissions(
  db: Executor,
  roleId: string,
  def: RoleDef,
  catalog: ReadonlySet<string> | undefined,
): Promise<void> {
  const wanted = Object.entries(def.permissions ?? {}).filter(
    ([key]) => key !== "private.read" && (!catalog || catalog.has(key)),
  );
  if (!wanted.length) return;
  const markerKey = `rbac.seeded.${def.key}`;
  const [marker] = await db.select().from(schema.setting).where(eq(schema.setting.key, markerKey));
  const seeded = new Set((marker?.value as string[] | undefined) ?? []);
  const fresh = wanted.filter(([key]) => !seeded.has(key));
  if (marker && fresh.length)
    await db
      .insert(schema.rolePermission)
      .values(
        fresh.map(([permission, scope]) => ({
          roleId,
          permission,
          scope: scope === true ? ("all" as const) : scope,
        })),
      )
      .onConflictDoNothing();
  const all = [...new Set([...seeded, ...wanted.map(([k]) => k)])].sort();
  if (!marker || fresh.length)
    await db
      .insert(schema.setting)
      .values({ key: markerKey, value: all })
      .onConflictDoUpdate({ target: schema.setting.key, set: { value: all } });
}
