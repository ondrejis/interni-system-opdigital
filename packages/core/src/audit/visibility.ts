import { and, eq, or, sql, type SQL } from "drizzle-orm";
import { schema } from "../db/client";
import { canSeePrivate } from "../rbac/permissions";
import type { Ctx } from "../rbac/types";

/**
 * Podmínka do `WHERE` pro každé čtení `audit_log` (historie záznamu, `/historie`, přehled změn, export CSV).
 * Vlastník (`private.read`) vidí vše (`undefined`). Ostatní nevidí: (1) záznamy zapsané jako soukromé (`is_private`,
 * kopie zámku v době změny, takže staré soukromé záznamy zůstanou skryté i po zveřejnění, R-33), (2) historii záznamů,
 * které jsou právě soukromé (`private_record`), včetně vedlejších záznamů o nich (komentáře, soubory přes `context`),
 * (3) bezpečnostní události (`category = security`) kromě vlastních (HIS-05).
 */
export function auditReadScope(ctx: Ctx): SQL | undefined {
  if (canSeePrivate(ctx)) return undefined;
  const a = schema.auditLog;
  const me = ctx.actor.userId;
  return and(
    sql`not ${a.isPrivate}`,
    sql`not exists (select 1 from private_record pr where pr.entity_type = ${a.entityType} and pr.entity_id::text = ${a.entityId})`,
    sql`not exists (select 1 from private_record pr where pr.entity_type = ${a.context}->>'entityType' and pr.entity_id::text = ${a.context}->>'entityId')`,
    or(
      sql`${a.category} <> 'security'`,
      me ? eq(a.actorId, me) : sql`false`,
      me ? and(eq(a.entityType, "user"), eq(a.entityId, me)) : sql`false`,
    ),
  );
}
