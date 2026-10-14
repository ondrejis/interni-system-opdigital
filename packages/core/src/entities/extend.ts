import type { EntityDef } from "./types";

/** Háčky, které modul doplní k cizí entitě (`extendEntity`). Stejné významy jako u `EntityDef`. */
export type EntityHooks = Pick<
  EntityDef,
  "beforeCreate" | "beforeUpdate" | "afterCreate" | "afterUpdate" | "beforeDelete"
>;

/** Rozšíření cizí entity o háčky; vyrábí `extendEntity`, skládá `applyEntityExtensions` (`collectServers`). */
export type EntityExtension = { extends: string; hooks: EntityHooks };

/**
 * Doplní k entitě jiného modulu háčky (např. `klienti` hlídá změnu `name` a `services` u `company`) bez zásahu do
 * jejího modulu. Použití: `entities: [extendEntity("company", { afterUpdate })]` v `server.ts`. Háček rozšíření běží
 * až po háčku entity samotné; chybí-li cílová entita (modul není zapnutý), rozšíření se tiše přeskočí.
 */
export function extendEntity(key: string, hooks: EntityHooks): EntityExtension {
  return { extends: key, hooks };
}

/** Je položka seznamu `entities` rozšířením (`extendEntity`), ne definicí entity? */
export function isEntityExtension(x: EntityDef | EntityExtension): x is EntityExtension {
  return "extends" in x;
}

/**
 * Z položek `entities` všech modulů (definice i rozšíření) složí definice: háčky rozšíření se zřetězí za háčky entity
 * v pořadí, v jakém moduly přicházejí. Rozšíření entity, která není v sestavě, se přeskočí.
 */
export function applyEntityExtensions(
  items: readonly (EntityDef | EntityExtension)[],
): EntityDef[] {
  const defs = items.filter((x): x is EntityDef => !isEntityExtension(x));
  const extensions = items.filter(isEntityExtension);
  return defs.map((def) => {
    const mine = extensions.filter((x) => x.extends === def.key);
    if (!mine.length) return def;
    let out: EntityDef = def;
    for (const { hooks } of mine) out = chain(out, hooks);
    return out;
  });
}

function chain(def: EntityDef, h: EntityHooks): EntityDef {
  const out: EntityDef = { ...def };
  const { beforeCreate, beforeUpdate, afterCreate, afterUpdate, beforeDelete } = def;
  if (h.beforeCreate) {
    const next = h.beforeCreate;
    out.beforeCreate = async (ctx, values) =>
      next(ctx, (await beforeCreate?.(ctx, values)) ?? values);
  }
  if (h.beforeUpdate) {
    const next = h.beforeUpdate;
    out.beforeUpdate = async (ctx, before, changes) => {
      const first = await beforeUpdate?.(ctx, before, changes);
      const second = await next(ctx, before, first ? { ...changes, ...first } : changes);
      return first || second ? { ...first, ...second } : undefined;
    };
  }
  if (h.afterCreate) {
    const next = h.afterCreate;
    out.afterCreate = async (ctx, created) => {
      await afterCreate?.(ctx, created);
      await next(ctx, created);
    };
  }
  if (h.afterUpdate) {
    const next = h.afterUpdate;
    out.afterUpdate = async (ctx, before, after) => {
      await afterUpdate?.(ctx, before, after);
      await next(ctx, before, after);
    };
  }
  if (h.beforeDelete) {
    const next = h.beforeDelete;
    out.beforeDelete = async (ctx, raw) => {
      await beforeDelete?.(ctx, raw);
      await next(ctx, raw);
    };
  }
  return out;
}
