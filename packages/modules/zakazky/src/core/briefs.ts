import { and, inArray } from "drizzle-orm";
import type { JobBrief } from "../api";
import { visibleJobs } from "../access";
import { job } from "../schema";
import type { Ctx } from "@rebar/core/rbac";

const brief = (r: typeof job.$inferSelect): JobBrief => ({
  id: r.id,
  number: r.number,
  title: r.title,
  type: r.type,
  companyId: r.companyId,
  ownerId: r.ownerId,
  status: r.status,
  isPrivate: r.isPrivate,
  startDate: r.startDate,
  billingModel: r.billingModel,
  marketingStage: r.marketingStage,
});

/** Stručné popisy zakázek, které aktér smí vidět (ostatní se vynechají). */
export async function getJobBriefsImpl(ctx: Ctx, ids: readonly string[]): Promise<JobBrief[]> {
  const unique = [...new Set(ids)];
  if (!unique.length) return [];
  const rows = await ctx.db
    .select()
    .from(job)
    .where(and(inArray(job.id, unique), visibleJobs(ctx)));
  return rows.map(brief);
}

/** Stručný popis jedné zakázky, nebo `null`. */
export async function getJobBriefImpl(ctx: Ctx, id: string): Promise<JobBrief | null> {
  return (await getJobBriefsImpl(ctx, [id]))[0] ?? null;
}
