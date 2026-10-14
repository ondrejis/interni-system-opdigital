import type { Executor } from "../db/client";
import { NotFoundError, PermissionError } from "../rbac/errors";
import { can } from "../rbac/permissions";
import type { Ctx } from "../rbac/types";

/**
 * Pravidla přístupu k záznamům jednoho typu (zakázka, firma, stroj…). Komentáře, úkoly a soubory
 * se vážou na libovolný záznam, proto se jejich oprávnění odvozují od záznamu, ke kterému patří.
 * Moduly svou politiku registrují (ve fázi 3 ji nahradí registr entit).
 */
export type EntityPolicy = {
  entityType: string;
  /** Oprávnění k čtení záznamu. */
  read: string;
  /** Oprávnění k úpravě záznamu (přidání souboru, změna). */
  write: string;
  /** Vlastníci záznamu pro rozsah `own`; `null`, když záznam neexistuje. */
  owners(db: Executor, id: string): Promise<{ ownerIds: (string | null)[] } | null>;
  /** Odkaz na záznam v aplikaci (pro upozornění). */
  url?: (id: string) => string;
};

/**
 * Registr je na `globalThis`: Next.js bundluje route handlery a server actions zvlášť, takže by každý měl vlastní
 * kopii modulu a politiky zaregistrované při startu služeb by jinde chyběly (nahrání souboru k záznamu by selhalo).
 */
const g = globalThis as { __entityPolicies?: Map<string, EntityPolicy> };
const registry = (g.__entityPolicies ??= new Map<string, EntityPolicy>());

export function registerEntityPolicy(policy: EntityPolicy) {
  registry.set(policy.entityType, policy);
}

export function getEntityPolicy(entityType: string): EntityPolicy | undefined {
  return registry.get(entityType);
}

/** Pro testy. */
export function clearEntityPolicies() {
  registry.clear();
}

/**
 * Ověří, že aktér smí se záznamem pracovat. Neznámý typ záznamu se odmítne (bezpečné výchozí chování),
 * záznam, který aktér nesmí vidět, se tváří jako neexistující.
 */
export async function assertEntityAccess(
  ctx: Ctx,
  entityType: string,
  entityId: string,
  mode: "read" | "write" = "read",
): Promise<EntityPolicy> {
  const policy = registry.get(entityType);
  if (!policy) throw new PermissionError("Tento typ záznamu není v systému povolen.");
  const found = await policy.owners(ctx.db, entityId);
  if (!found) throw new NotFoundError();
  if (!can(ctx, policy.read, found)) throw new NotFoundError();
  if (mode === "write" && !can(ctx, policy.write, found)) throw new PermissionError();
  return policy;
}
