import { visibleRecordTitles } from "@rebar/core/entities";
import { type Ctx } from "@rebar/core/rbac";
import type { People, PaymentRow } from "../contract";
import type { Allocation } from "../logic";
import type { FinDeps } from "./deps";
import { loadJobs } from "./jobs";
import { baseRow, loadAllocations, type PayRec } from "./model";
import { loadPeople, today, uniq } from "./util";

/** Řádky plateb pro UI: doplní zakázku, klienta a lidi (vše s ohledem na soukromé záznamy aktéra). */
export async function toRows(
  ctx: Ctx,
  deps: FinDeps,
  recs: readonly PayRec[],
  allocs?: Map<string, Allocation[]>,
): Promise<{ rows: PaymentRow[]; people: People }> {
  const alloc =
    allocs ??
    (await loadAllocations(
      ctx.db,
      recs.map((r) => r.id),
    ));
  const jobs = await loadJobs(ctx, uniq(recs.map((r) => r.jobId)));
  const companies = await visibleRecordTitles(
    ctx,
    deps.registry,
    "company",
    uniq(recs.map((r) => r.companyId)),
  );
  const now = today();
  const rows = recs.map((p): PaymentRow => {
    const j = p.jobId ? jobs.get(p.jobId) : undefined;
    return {
      ...baseRow(p, alloc.get(p.id) ?? [], now),
      jobNumber: j?.number ?? null,
      jobTitle: j?.title ?? null,
      jobType: j?.type ?? null,
      companyName: p.companyId ? (companies[p.companyId] ?? null) : null,
    };
  });
  const people = await loadPeople(ctx.db, [
    ...recs.map((r) => r.issuerId),
    ...rows.flatMap((r) => r.allocations.map((a) => a.userId)),
  ]);
  return { rows, people };
}
