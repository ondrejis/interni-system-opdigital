import { canSeePrivate, scopeOf } from "../rbac/permissions";
import type { Ctx } from "../rbac/types";
import type { RealtimeChange } from "./notify";

/** Co se pošle prohlížeči: bez příznaku soukromí (klient ho nepotřebuje a nemá ho znát). */
export type RealtimeEvent = Omit<RealtimeChange, "p">;

/**
 * Smí aktér dostat signál o změně? Soukromé záznamy se tomu, kdo nesmí vidět soukromé (`private.read`), neposílají.
 * Jedinou výjimkou je `visibility_changed` na soukromé: záznam byl právě zamčen a partner ho má ještě v seznamu, takže
 * potřebuje signál, aby zmizel (id znal už dřív, nic nového se nedozví). Typy záznamů, k jejichž čtení aktér nemá
 * oprávnění, se také neposílají. Signál nese jen typ a id; data si klient dotáhne přes engine s viditelností.
 */
export function realtimeFor(
  ctx: Ctx,
  change: RealtimeChange,
  readPermission: (entityType: string) => string | null,
): RealtimeEvent | null {
  if (change.p && !canSeePrivate(ctx) && change.a !== "visibility_changed") return null;
  const perm = readPermission(change.e);
  if (perm && !scopeOf(ctx, perm)) return null;
  const { p: _p, ...event } = change;
  // u zamčeného záznamu se nadřazený záznam nesděluje
  if (change.p && !canSeePrivate(ctx)) return { e: event.e, i: event.i, a: event.a };
  return event;
}
