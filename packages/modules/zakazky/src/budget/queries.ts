import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { NotFoundError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { job, budgetCalcLine, budgetItem } from "../schema";
import { buildTree, itemAmounts, lockReason, sumAmounts, vatBreakdown } from "./math";
import type {
  BudgetTreeView,
  ItemView,
  ObjectView,
  SectionView,
  VersionSummary,
  VersionView,
} from "./types";
import {
  listVersions,
  loadStructure,
  pickCurrent,
  type ItemRow,
  type ObjectRow,
  type SectionRow,
  type VersionRow,
} from "./service";

export const toVersionView = (v: VersionRow): VersionView => ({
  id: v.id,
  jobId: v.jobId,
  kind: v.kind,
  number: v.number,
  title: v.title,
  status: v.status,
  lockedAt: v.lockedAt ? v.lockedAt.toISOString() : null,
  note: v.note,
  sourceVersionId: v.sourceVersionId,
  lockReason: lockReason(v),
});

const toObject = (o: ObjectRow): ObjectView => ({
  id: o.id,
  position: o.position,
  code: o.code,
  title: o.title,
  isDefault: o.isDefault,
  responsibleId: o.responsibleId,
});
const toSection = (s: SectionRow): SectionView => ({
  id: s.id,
  objectId: s.objectId,
  parentId: s.parentId,
  position: s.position,
  code: s.code,
  title: s.title,
  costCategory: s.costCategory,
});
export const toItem = (i: ItemRow, calcCount = 0): ItemView => ({
  id: i.id,
  sectionId: i.sectionId,
  position: i.position,
  code: i.code,
  title: i.title,
  kind: i.kind,
  unit: i.unit,
  quantity: i.quantity,
  unitCostMinor: i.unitCostMinor,
  unitPriceMinor: i.unitPriceMinor,
  vatRateBp: i.vatRateBp,
  startDate: i.startDate,
  endDate: i.endDate,
  spec: i.spec,
  note: i.note,
  originalQuantity: i.originalQuantity,
  originalUnitCostMinor: i.originalUnitCostMinor,
  originalUnitPriceMinor: i.originalUnitPriceMinor,
  changeId: i.changeId,
  calcCount,
});

async function calcCounts(c: Ctx, itemIds: readonly string[]): Promise<Map<string, number>> {
  if (!itemIds.length) return new Map();
  const rows = await c.db
    .select({ itemId: budgetCalcLine.itemId, n: sql<number>`count(*)::int` })
    .from(budgetCalcLine)
    .where(inArray(budgetCalcLine.itemId, [...itemIds]))
    .groupBy(budgetCalcLine.itemId);
  return new Map(rows.map((r) => [r.itemId, r.n]));
}

/** Součty prodeje a nákladu každé verze zakázky (do přepínače verzí). */
export async function versionSummaries(
  c: Ctx,
  versions: readonly VersionRow[],
): Promise<VersionSummary[]> {
  if (!versions.length) return [];
  const items = await c.db
    .select()
    .from(budgetItem)
    .where(
      and(
        inArray(
          budgetItem.versionId,
          versions.map((v) => v.id),
        ),
        isNull(budgetItem.deletedAt),
      ),
    );
  return versions.map((v) => {
    const t = sumAmounts(items.filter((i) => i.versionId === v.id).map(itemAmounts));
    return { ...toVersionView(v), sellMinor: t.sellMinor, costMinor: t.costMinor };
  });
}

/**
 * Celý strom verze s dopočtenými součty. Bez `versionId` se vezme aktuální verze (realizace, jinak poslední nabídka).
 * Nekontroluje oprávnění: volající musí mít ověřené `zakazky.economics` (cena a náklad jsou v odpovědi).
 */
export async function budgetTreeView(
  c: Ctx,
  jobId: string,
  versionId?: string | null,
): Promise<BudgetTreeView> {
  const [j] = await c.db
    .select({
      id: job.id,
      number: job.number,
      title: job.title,
      phase: job.phase,
      vatMode: job.vatMode,
      currency: job.currency,
      valueMinor: job.valueMinor,
    })
    .from(job)
    .where(and(eq(job.id, jobId), isNull(job.deletedAt)));
  if (!j) throw new NotFoundError("Zakázka nenalezena.");
  const all = await listVersions(c, jobId);
  const chosen = versionId ? all.find((v) => v.id === versionId) : pickCurrent(all);
  if (versionId && !chosen) throw new NotFoundError("Verze rozpočtu nenalezena.");
  const versions = await versionSummaries(c, all);
  if (!chosen)
    return {
      job: j,
      versions,
      version: null,
      objects: [],
      totals: sumAmounts([]),
      vat: vatBreakdown([]),
      singleObject: true,
    };
  const st = await loadStructure(c, chosen.id);
  const counts = await calcCounts(
    c,
    st.items.map((i) => i.id),
  );
  const objects = buildTree(
    st.objects.map(toObject),
    st.sections.map(toSection),
    st.items.map((i) => toItem(i, counts.get(i.id) ?? 0)),
  );
  return {
    job: j,
    versions,
    version: toVersionView(chosen),
    objects,
    totals: sumAmounts(objects.map((o) => o.totals)),
    vat: vatBreakdown(st.items, j.vatMode === "reverse_charge" ? "reverse_charge" : "standard"),
    singleObject: st.objects.length <= 1,
  };
}

export type {
  BudgetTreeView,
  ItemView,
  ObjectView,
  SectionView,
  VersionSummary,
  VersionView,
} from "./types";
