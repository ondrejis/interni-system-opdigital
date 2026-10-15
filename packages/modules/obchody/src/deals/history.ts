import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { Executor } from "@rebar/core/db";
import { dealStageHistory } from "../schema";
import type { Ctx } from "@rebar/core/rbac";
import { daysSince, durationSec } from "./logic";
import { stagesById, userNames } from "./common";
import type { StageHistoryRow } from "../contract";

/**
 * Otevře pobyt ve fázi: uzavře dosud otevřený řádek historie (`left_at`, `duration_sec`) a založí nový. Vrací počet
 * sekund v předchozím pobytu (`null`, když žádný otevřený nebyl, tedy při založení obchodu). `at` je okamžik přechodu.
 */
export async function enterStage(
  db: Executor,
  input: {
    dealId: string;
    fromStageId: string | null;
    toStageId: string;
    at: Date;
    byUserId: string | null;
  },
): Promise<number | null> {
  const [open] = await db
    .select()
    .from(dealStageHistory)
    .where(and(eq(dealStageHistory.dealId, input.dealId), isNull(dealStageHistory.leftAt)))
    .orderBy(sql`${dealStageHistory.enteredAt} desc`)
    .limit(1);
  let previous: number | null = null;
  if (open) {
    previous = durationSec(open.enteredAt, input.at);
    await db
      .update(dealStageHistory)
      .set({ leftAt: input.at, durationSec: previous })
      .where(eq(dealStageHistory.id, open.id));
  }
  await db.insert(dealStageHistory).values({
    dealId: input.dealId,
    fromStageId: input.fromStageId,
    toStageId: input.toStageId,
    enteredAt: input.at,
    byUserId: input.byUserId,
  });
  return previous;
}

/** Uzavře otevřený pobyt ve fázi bez založení nového (výhra, prohra: obchod opouští pipeline). */
export async function leaveStage(db: Executor, dealId: string, at: Date): Promise<number | null> {
  const [open] = await db
    .select()
    .from(dealStageHistory)
    .where(and(eq(dealStageHistory.dealId, dealId), isNull(dealStageHistory.leftAt)))
    .orderBy(sql`${dealStageHistory.enteredAt} desc`)
    .limit(1);
  if (!open) return null;
  const sec = durationSec(open.enteredAt, at);
  await db
    .update(dealStageHistory)
    .set({ leftAt: at, durationSec: sec })
    .where(eq(dealStageHistory.id, open.id));
  return sec;
}

/**
 * Historie fází obchodu od nejstaršího pobytu po aktuální. Oprávnění nekontroluje (volající ověří přístup k obchodu).
 */
export async function stageHistory(
  ctx: Ctx,
  dealId: string,
  now: Date = new Date(),
): Promise<StageHistoryRow[]> {
  const rows = await ctx.db
    .select()
    .from(dealStageHistory)
    .where(eq(dealStageHistory.dealId, dealId))
    .orderBy(asc(dealStageHistory.enteredAt), asc(dealStageHistory.id));
  const stages = await stagesById(
    ctx.db,
    rows.map((r) => r.toStageId),
  );
  const users = await userNames(
    ctx.db,
    rows.map((r) => r.byUserId),
  );
  return rows.map((r) => {
    const s = stages.get(r.toStageId);
    return {
      id: r.id,
      fromStageId: r.fromStageId,
      toStageId: r.toStageId,
      stageName: s?.name ?? "—",
      stageColor: s?.color ?? "gray",
      stageDeleted: !s || s.deletedAt !== null,
      enteredAt: r.enteredAt.toISOString(),
      leftAt: r.leftAt?.toISOString() ?? null,
      durationSec: r.durationSec ?? durationSec(r.enteredAt, r.leftAt ?? now),
      days: daysSince(r.enteredAt, r.leftAt ?? now),
      byUserId: r.byUserId,
      byUserName: r.byUserId ? (users.get(r.byUserId) ?? null) : null,
    };
  });
}
