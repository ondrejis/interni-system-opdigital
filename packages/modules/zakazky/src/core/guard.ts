import { and, eq, isNull } from "drizzle-orm";
import { can, PermissionError, type Ctx } from "@rebar/core/rbac";
import { jobMember } from "../schema";
import type { JobRow } from "./lookups";

/**
 * Ověří, že aktér smí zakázku měnit: oprávnění `zakazky.write` (u rozsahu „jen moje“ jen jako vlastník nebo člen týmu).
 * Čtení zakázky (`loadJob`) už proběhlo, takže neviditelná zakázka sem vůbec nedojde.
 */
export async function assertJobWrite(c: Ctx, j: Pick<JobRow, "id" | "ownerId">): Promise<void> {
  const members = await c.db
    .select({ userId: jobMember.userId })
    .from(jobMember)
    .where(and(eq(jobMember.jobId, j.id), isNull(jobMember.deletedAt)));
  if (!can(c, "zakazky.write", { ownerIds: [j.ownerId, ...members.map((m) => m.userId)] }))
    throw new PermissionError();
}
