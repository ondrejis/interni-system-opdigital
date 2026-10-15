import { and, eq, inArray, isNull } from "drizzle-orm";
import type { BillingModel, JobStatus, MarketingStage, ServiceType } from "@rebar/core/contracts";
import type { Executor } from "@rebar/core/db";
import type { Ctx } from "@rebar/core/rbac";
import { job } from "@rebar/zakazky/schema";
import { privateScope } from "./private";

/** Zakázka tak, jak ji potřebují finance (čtení přímo z tabulky zakázek, vždy s ohledem na soukromé záznamy). */
export type JobInfo = {
  id: string;
  number: string;
  title: string;
  type: ServiceType;
  companyId: string;
  ownerId: string | null;
  status: JobStatus;
  isPrivate: boolean;
  startDate: string | null;
  billingModel: BillingModel;
  marketingStage: MarketingStage | null;
};

const columns = {
  id: job.id,
  number: job.number,
  title: job.title,
  type: job.type,
  companyId: job.companyId,
  ownerId: job.ownerId,
  status: job.status,
  isPrivate: job.isPrivate,
  startDate: job.startDate,
  billingModel: job.billingModel,
  marketingStage: job.marketingStage,
} as const;

/** Zakázka, nebo `null`, když neexistuje, je smazaná, nebo ji aktér nesmí vidět (soukromá). */
export async function loadJob(ctx: Ctx, jobId: string): Promise<JobInfo | null> {
  const [row] = await ctx.db
    .select(columns)
    .from(job)
    .where(and(eq(job.id, jobId), isNull(job.deletedAt), privateScope(ctx, job)));
  return (row as JobInfo | undefined) ?? null;
}

/** Zakázky podle id (neviditelné a neexistující se vynechají). */
export async function loadJobs(
  ctx: Ctx | { db: Executor; isSystem: true },
  ids: readonly string[],
  scopeCtx?: Ctx,
): Promise<Map<string, JobInfo>> {
  const out = new Map<string, JobInfo>();
  if (!ids.length) return out;
  const rows = await ctx.db
    .select(columns)
    .from(job)
    .where(
      and(
        inArray(job.id, [...ids]),
        isNull(job.deletedAt),
        scopeCtx ? privateScope(scopeCtx, job) : "actor" in ctx ? privateScope(ctx, job) : undefined,
      ),
    );
  for (const r of rows) out.set(r.id, r as JobInfo);
  return out;
}
