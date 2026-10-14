import { and, asc, eq, inArray } from "drizzle-orm";
import { getLookup } from "@rebar/core/config-data";
import { schema } from "@rebar/core/db";
import { assertEntityAccess } from "@rebar/core/entities";
import type { PhaseTransitionHook } from "@rebar/core/entities";
import { notify } from "@rebar/core/notifications";
import { inTx, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { job } from "@rebar/zakazky/schema";
import { LOST_REASON_LOOKUP } from "@rebar/zakazky/server";
import { crmFollower } from "../../schema";
import type { FollowerList } from "./logic";
import { CRM_DEAL_LOST, CRM_DEAL_STAGE, CRM_DEAL_WON } from "./notifications";

/** Sledující zakázky se jmény (jen aktivní uživatelé). Přístup k zakázce hlídá volající. */
export async function listFollowers(ctx: Ctx, jobId: string): Promise<FollowerList> {
  const rows = await ctx.db
    .select({
      userId: crmFollower.userId,
      name: schema.user.name,
      since: crmFollower.createdAt,
    })
    .from(crmFollower)
    .innerJoin(schema.user, eq(schema.user.id, crmFollower.userId))
    .where(and(eq(crmFollower.jobId, jobId), eq(schema.user.active, true)))
    .orderBy(asc(crmFollower.createdAt));
  const me = ctx.actor.userId;
  return {
    count: rows.length,
    following: !!me && rows.some((r) => r.userId === me),
    followers: rows.map((r) => ({ userId: r.userId, name: r.name, since: r.since.toISOString() })),
  };
}

/**
 * Přidá sledujícího (sebe, nebo jiného uživatele; cizího smí přidat ten, kdo smí zakázku upravovat). Opakované přidání nic
 * nemění. Vrací aktuální seznam.
 */
export async function follow(
  ctx: Ctx,
  jobId: string,
  userId: string | undefined,
): Promise<FollowerList> {
  return inTx(ctx, async (c) => {
    const me = c.actor.userId;
    const target = userId ?? me;
    if (!target) throw new UserError("Sledovat zakázku může jen přihlášený uživatel.");
    await assertEntityAccess(c, "job", jobId, target === me ? "read" : "write");
    const [u] = await c.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(and(eq(schema.user.id, target), eq(schema.user.active, true)));
    if (!u) throw new UserError("Uživatel nenalezen.");
    await c.db.insert(crmFollower).values({ jobId, userId: target }).onConflictDoNothing();
    return listFollowers(c, jobId);
  });
}

/** Odebere sledujícího (sebe, nebo jiného uživatele; cizího smí odebrat ten, kdo smí zakázku upravovat). */
export async function unfollow(
  ctx: Ctx,
  jobId: string,
  userId: string | undefined,
): Promise<FollowerList> {
  return inTx(ctx, async (c) => {
    const me = c.actor.userId;
    const target = userId ?? me;
    if (!target) throw new UserError("Přestat sledovat může jen přihlášený uživatel.");
    await assertEntityAccess(c, "job", jobId, target === me ? "read" : "write");
    await c.db
      .delete(crmFollower)
      .where(and(eq(crmFollower.jobId, jobId), eq(crmFollower.userId, target)));
    return listFollowers(c, jobId);
  });
}

/**
 * Hook změny stavu zakázky: sledujícím pošle upozornění o posunu (nebo výhře či prohře). Zakládání zakázky se nehlásí.
 * Příjemce bez práva číst zakázku upozornění nedostane (to hlídá katalog), ten, kdo změnu udělal, také ne.
 */
export const followerHooks: PhaseTransitionHook[] = [
  {
    id: "crm.followers",
    entity: "job",
    to: ["*"],
    afterStage: async (ctx, row, change) => {
      if (!change.fromStageId || change.fromStageId === change.toStageId) return;
      const jobId = String(row.id);
      const followers = await ctx.db
        .select({ userId: crmFollower.userId })
        .from(crmFollower)
        .where(eq(crmFollower.jobId, jobId));
      if (!followers.length) return;
      const [j] = await ctx.db
        .select({ number: job.number, title: job.title, lostReason: job.lostReason })
        .from(job)
        .where(eq(job.id, jobId));
      if (!j) return;
      const base = {
        record: { type: "job", id: jobId },
        to: { followers: followers.map((f) => f.userId) },
        actorId: ctx.actor.userId,
      };
      const openFrom = change.fromPhase === "inquiry" || change.fromPhase === "offer";
      if (change.toPhase === "lost") {
        const reasons = await getLookup(ctx.db, LOST_REASON_LOOKUP);
        const reason = reasons.find((r) => r.value === j.lostReason)?.label ?? j.lostReason ?? "";
        await notify(ctx.db, CRM_DEAL_LOST, {
          ...base,
          params: { number: j.number, title: j.title, reason },
        });
      } else if (openFrom && change.toPhase === "preparation") {
        await notify(ctx.db, CRM_DEAL_WON, {
          ...base,
          params: { number: j.number, title: j.title },
        });
      } else {
        const names = await ctx.db
          .select({ id: schema.pipelineStage.id, name: schema.pipelineStage.name })
          .from(schema.pipelineStage)
          .where(inArray(schema.pipelineStage.id, [change.fromStageId, change.toStageId]));
        const nameOf = (id: string) => names.find((n) => n.id === id)?.name ?? "";
        await notify(ctx.db, CRM_DEAL_STAGE, {
          ...base,
          params: {
            number: j.number,
            title: j.title,
            from: nameOf(change.fromStageId),
            to: nameOf(change.toStageId),
          },
        });
      }
    },
  },
];
