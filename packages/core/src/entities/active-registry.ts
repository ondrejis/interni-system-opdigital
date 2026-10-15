import type { EntityRegistry } from "./engine";
import type { EntityDef } from "./types";

/**
 * Registr entit zapnutých modulů, ke kterému se dostanou funkce bez parametru `registry` (smazání a obnovení záznamu
 * s potomky, úklid koše, `assertAssignable`). Nastavuje ho `registerEntityPolicies` při sestavení aplikace i workeru.
 * Je na `globalThis`: Next.js bundluje route handlery a server actions zvlášť, takže by každý měl vlastní kopii modulu.
 */
const g = globalThis as { __activeEntityRegistry?: EntityRegistry };

/** Zapamatuje registr entit pro funkce, které ho nedostávají jako parametr. */
export function setActiveRegistry(registry: EntityRegistry | undefined): void {
  if (registry) g.__activeEntityRegistry = registry;
  else delete g.__activeEntityRegistry;
}

/** Registr entit zapnutých modulů; mimo sestavenou aplikaci (a bez `registerEntityPolicies`) vyhodí chybu. */
export function getActiveRegistry(): EntityRegistry {
  const r = g.__activeEntityRegistry;
  if (!r) throw new Error("Registr entit není sestavený (chybí volání buildRegistry).");
  return r;
}

/** Registr entit, nebo `undefined`, když ještě není sestavený. */
export function findActiveRegistry(): EntityRegistry | undefined {
  return g.__activeEntityRegistry;
}

/**
 * Aktivní registr, a když ještě není sestavený, mini-registr jen s danou entitou (bez potomků a rodičů): funkce
 * mazání a obnovy tak fungují i v testech, které si registr nesestavují.
 */
export function registryOrSelf(def: EntityDef): EntityRegistry {
  return (
    g.__activeEntityRegistry ?? {
      get: (key: string) => (key === def.key ? def : undefined),
      all: () => [def],
    }
  );
}
