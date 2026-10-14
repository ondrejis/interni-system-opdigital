import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { recordAudit } from "@rebar/core/audit";
import { newId } from "@rebar/core/db";
import { NotFoundError, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import * as costsApi from "../costs/api";
import {
  job,
  budgetCalcLine,
  budgetItem,
  budgetObject,
  budgetSection,
  budgetVersion,
} from "../schema";
import { lockReason, versionTotals } from "./math";

/**
 * Databázová část rozpočtu. Všechny zapisující funkce předpokládají, že běží v transakci (`inTx`) a že volající
 * už ověřil oprávnění; kontrola přístupu je v příkazech (`commands.ts`), `api.ts` ji nedělá (jako poskytovatelé nákladů).
 */

export type VersionRow = typeof budgetVersion.$inferSelect;
export type ObjectRow = typeof budgetObject.$inferSelect;
export type SectionRow = typeof budgetSection.$inferSelect;
export type ItemRow = typeof budgetItem.$inferSelect;
export type CalcRow = typeof budgetCalcLine.$inferSelect;

export const DEFAULT_OBJECT_TITLE = "Celá zakázka";
export const MAX_SECTION_DEPTH = 6;

/** Přepočet souhrnu zakázky (oblast Náklady). Dokud rozhraní neexistuje, je to prázdná operace. */
export async function recomputeSummary(c: Ctx, jobId: string): Promise<void> {
  const fn = (
    costsApi as unknown as { recomputeJobSummary?: (ctx: Ctx, jobId: string) => Promise<unknown> }
  ).recomputeJobSummary;
  if (typeof fn === "function") await fn(c, jobId);
}

export async function auditJob(c: Ctx, jobId: string, summary: string, action = "update") {
  await recordAudit(c, { action, entityType: "job", entityId: jobId, summary });
}

/* ---------- zámky a načtení ---------- */

export async function lockJobRow(c: Ctx, jobId: string) {
  const [row] = await c.db
    .select({ id: job.id, number: job.number, phase: job.phase, vatMode: job.vatMode })
    .from(job)
    .where(and(eq(job.id, jobId), isNull(job.deletedAt)))
    .for("update");
  if (!row) throw new NotFoundError("Zakázka nenalezena.");
  return row;
}

/** Načte verzi se zámkem řádku, takže souběžné úpravy téže verze jdou jedna po druhé. */
export async function lockVersionRow(c: Ctx, versionId: string): Promise<VersionRow> {
  const [row] = await c.db
    .select()
    .from(budgetVersion)
    .where(and(eq(budgetVersion.id, versionId), isNull(budgetVersion.deletedAt)))
    .for("update");
  if (!row) throw new NotFoundError("Verze rozpočtu nenalezena.");
  return row;
}

export async function loadVersion(c: Ctx, versionId: string): Promise<VersionRow> {
  const [row] = await c.db
    .select()
    .from(budgetVersion)
    .where(and(eq(budgetVersion.id, versionId), isNull(budgetVersion.deletedAt)));
  if (!row) throw new NotFoundError("Verze rozpočtu nenalezena.");
  return row;
}

export function assertEditable(v: Pick<VersionRow, "kind" | "status">) {
  const reason = lockReason(v);
  if (reason) throw new UserError(reason);
}

export async function listVersions(c: Ctx, jobId: string): Promise<VersionRow[]> {
  return c.db
    .select()
    .from(budgetVersion)
    .where(and(eq(budgetVersion.jobId, jobId), isNull(budgetVersion.deletedAt)))
    .orderBy(asc(budgetVersion.kind), asc(budgetVersion.number));
}

/** Aktuální verze: poslední realizační, jinak poslední nabídka. */
export function pickCurrent<T extends { kind: string; number: number }>(versions: readonly T[]) {
  const latest = (kind: string) =>
    versions.filter((v) => v.kind === kind).sort((a, b) => b.number - a.number)[0];
  return latest("realization") ?? latest("offer") ?? null;
}

export async function currentVersion(c: Ctx, jobId: string): Promise<VersionRow | null> {
  return pickCurrent(await listVersions(c, jobId));
}

export async function latestOffer(c: Ctx, jobId: string): Promise<VersionRow | null> {
  const [row] = await c.db
    .select()
    .from(budgetVersion)
    .where(
      and(
        eq(budgetVersion.jobId, jobId),
        eq(budgetVersion.kind, "offer"),
        isNull(budgetVersion.deletedAt),
      ),
    )
    .orderBy(desc(budgetVersion.number))
    .limit(1);
  return row ?? null;
}

export async function realizationOf(c: Ctx, jobId: string): Promise<VersionRow | null> {
  const [row] = await c.db
    .select()
    .from(budgetVersion)
    .where(
      and(
        eq(budgetVersion.jobId, jobId),
        eq(budgetVersion.kind, "realization"),
        isNull(budgetVersion.deletedAt),
      ),
    )
    .orderBy(desc(budgetVersion.number))
    .limit(1);
  return row ?? null;
}

export async function loadStructure(c: Ctx, versionId: string) {
  const [objects, sections, items] = await Promise.all([
    c.db
      .select()
      .from(budgetObject)
      .where(and(eq(budgetObject.versionId, versionId), isNull(budgetObject.deletedAt)))
      .orderBy(asc(budgetObject.position)),
    c.db
      .select()
      .from(budgetSection)
      .where(and(eq(budgetSection.versionId, versionId), isNull(budgetSection.deletedAt)))
      .orderBy(asc(budgetSection.position)),
    c.db
      .select()
      .from(budgetItem)
      .where(and(eq(budgetItem.versionId, versionId), isNull(budgetItem.deletedAt)))
      .orderBy(asc(budgetItem.position)),
  ]);
  return { objects, sections, items };
}

/** Součty verze ve tvaru pro ostatní oblasti (`getBudgetTotals`). */
export async function totalsOf(c: Ctx, versionId: string) {
  const { sections, items } = await loadStructure(c, versionId);
  return versionTotals(sections, items);
}

/* ---------- vytváření ---------- */

export async function ensureDefaultObject(c: Ctx, versionId: string): Promise<ObjectRow> {
  const [existing] = await c.db
    .select()
    .from(budgetObject)
    .where(
      and(
        eq(budgetObject.versionId, versionId),
        eq(budgetObject.isDefault, true),
        isNull(budgetObject.deletedAt),
      ),
    );
  if (existing) return existing;
  const [row] = await c.db
    .insert(budgetObject)
    .values({
      versionId,
      title: DEFAULT_OBJECT_TITLE,
      isDefault: true,
      position: 0,
      createdBy: c.actor.userId,
      updatedBy: c.actor.userId,
    })
    .returning();
  return row!;
}

/** Založí prázdnou verzi s výchozím objektem. Číslo verze je další v řadě téhož druhu. */
export async function createVersion(
  c: Ctx,
  spec: {
    jobId: string;
    kind: "offer" | "realization";
    title?: string | null;
    note?: string | null;
  },
): Promise<VersionRow> {
  await lockJobRow(c, spec.jobId);
  const [n] = await c.db
    .select({ next: sql<number>`coalesce(max(${budgetVersion.number}), 0)::int + 1` })
    .from(budgetVersion)
    .where(and(eq(budgetVersion.jobId, spec.jobId), eq(budgetVersion.kind, spec.kind)));
  const [row] = await c.db
    .insert(budgetVersion)
    .values({
      jobId: spec.jobId,
      kind: spec.kind,
      number: n?.next ?? 1,
      title: spec.title ?? null,
      note: spec.note ?? null,
      createdBy: c.actor.userId,
      updatedBy: c.actor.userId,
    })
    .returning();
  await ensureDefaultObject(c, row!.id);
  return row!;
}

/** Nabídková verze zakázky; pokud žádná není, založí ji. */
export async function ensureOffer(
  c: Ctx,
  jobId: string,
): Promise<{ version: VersionRow; created: boolean }> {
  await lockJobRow(c, jobId);
  const existing = await latestOffer(c, jobId);
  if (existing) return { version: existing, created: false };
  return { version: await createVersion(c, { jobId, kind: "offer" }), created: true };
}

/** Realizační verze zakázky; pokud žádná není, založí prázdnou. */
export async function ensureRealization(
  c: Ctx,
  jobId: string,
): Promise<{ version: VersionRow; created: boolean }> {
  await lockJobRow(c, jobId);
  const existing = await realizationOf(c, jobId);
  if (existing) return { version: existing, created: false };
  return { version: await createVersion(c, { jobId, kind: "realization" }), created: true };
}

export async function isEmptyVersion(c: Ctx, versionId: string): Promise<boolean> {
  const [r] = await c.db
    .select({ n: sql<number>`count(*)::int` })
    .from(budgetItem)
    .where(and(eq(budgetItem.versionId, versionId), isNull(budgetItem.deletedAt)));
  const [s] = await c.db
    .select({ n: sql<number>`count(*)::int` })
    .from(budgetSection)
    .where(and(eq(budgetSection.versionId, versionId), isNull(budgetSection.deletedAt)));
  return (r?.n ?? 0) === 0 && (s?.n ?? 0) === 0;
}

/**
 * Zkopíruje obsah verze (objekty, oddíly, položky, řádky výkazu) do jiné prázdné verze. S `markOriginal` se u položek
 * uloží původní hodnoty (kopie nabídky do realizace: od teď je vidět, co se oproti dohodě změnilo).
 */
export async function copyVersionContent(
  c: Ctx,
  fromVersionId: string,
  toVersionId: string,
  opts: { markOriginal?: boolean; withPrices?: boolean } = {},
) {
  const withPrices = opts.withPrices !== false;
  const src = await loadStructure(c, fromVersionId);
  const actor = { createdBy: c.actor.userId, updatedBy: c.actor.userId };

  // prázdná cílová verze může nést jen výchozí objekt; nahradí ho zkopírované objekty
  await c.db
    .update(budgetObject)
    .set({ deletedAt: new Date() })
    .where(and(eq(budgetObject.versionId, toVersionId), isNull(budgetObject.deletedAt)));

  const objectIds = new Map<string, string>();
  const sectionIds = new Map<string, string>();
  const itemIds = new Map<string, string>();
  if (src.objects.length)
    await c.db.insert(budgetObject).values(
      src.objects.map((o) => {
        const id = newId();
        objectIds.set(o.id, id);
        return {
          id,
          versionId: toVersionId,
          code: o.code,
          title: o.title,
          isDefault: o.isDefault,
          responsibleId: o.responsibleId,
          position: o.position,
          ...actor,
        };
      }),
    );
  if (src.sections.length) {
    for (const s of src.sections) sectionIds.set(s.id, newId());
    await c.db.insert(budgetSection).values(
      src.sections.map((s) => ({
        id: sectionIds.get(s.id)!,
        versionId: toVersionId,
        objectId: objectIds.get(s.objectId)!,
        parentId: s.parentId ? (sectionIds.get(s.parentId) ?? null) : null,
        code: s.code,
        title: s.title,
        position: s.position,
        costCategory: s.costCategory,
        ...actor,
      })),
    );
  }
  if (src.items.length) {
    for (const i of src.items) itemIds.set(i.id, newId());
    await c.db.insert(budgetItem).values(
      src.items.map((i) => {
        const price = withPrices ? i.unitPriceMinor : 0;
        const cost = withPrices ? i.unitCostMinor : 0;
        return {
          id: itemIds.get(i.id)!,
          versionId: toVersionId,
          sectionId: sectionIds.get(i.sectionId)!,
          position: i.position,
          code: i.code,
          title: i.title,
          kind: i.kind,
          unit: i.unit,
          quantity: i.quantity,
          unitCostMinor: cost,
          unitPriceMinor: price,
          vatRateBp: i.vatRateBp,
          startDate: i.startDate,
          endDate: i.endDate,
          spec: i.spec,
          note: i.note,
          originalQuantity: opts.markOriginal ? i.quantity : null,
          originalUnitCostMinor: opts.markOriginal ? cost : null,
          originalUnitPriceMinor: opts.markOriginal ? price : null,
          catalogItemId: i.catalogItemId,
          ...actor,
        };
      }),
    );
    const calc = await c.db
      .select()
      .from(budgetCalcLine)
      .where(inArray(budgetCalcLine.itemId, [...itemIds.keys()]));
    if (calc.length)
      await c.db.insert(budgetCalcLine).values(
        calc.map((l) => ({
          itemId: itemIds.get(l.itemId)!,
          position: l.position,
          variable: l.variable,
          description: l.description,
          formula: l.formula,
          result: l.result,
        })),
      );
  }
  await ensureDefaultObject(c, toVersionId);
  return { objects: src.objects.length, sections: src.sections.length, items: src.items.length };
}

/** Zamkne verzi: uloží původní hodnoty položek, které je ještě nemají, a nastaví stav `locked`. */
export async function lockVersionTx(c: Ctx, v: VersionRow): Promise<VersionRow> {
  if (v.status === "locked") return v;
  await c.db
    .update(budgetItem)
    .set({
      originalQuantity: sql`coalesce(${budgetItem.originalQuantity}, ${budgetItem.quantity})`,
      originalUnitCostMinor: sql`coalesce(${budgetItem.originalUnitCostMinor}, ${budgetItem.unitCostMinor})`,
      originalUnitPriceMinor: sql`coalesce(${budgetItem.originalUnitPriceMinor}, ${budgetItem.unitPriceMinor})`,
    })
    .where(eq(budgetItem.versionId, v.id));
  const [row] = await c.db
    .update(budgetVersion)
    .set({
      status: "locked",
      lockedAt: new Date(),
      lockedBy: c.actor.userId,
      updatedBy: c.actor.userId,
    })
    .where(eq(budgetVersion.id, v.id))
    .returning();
  await auditJob(
    c,
    v.jobId,
    `${v.kind === "offer" ? "Nabídka" : "Rozpočet realizace"} ${v.number} zamčen${v.kind === "offer" ? "a" : ""}`,
  );
  return row!;
}

/** Je ve verzi aspoň jedna položka s uloženými původními hodnotami (verze byla zamčená nebo vznikla kopií)? */
export async function isBaselined(c: Ctx, versionId: string): Promise<boolean> {
  const [r] = await c.db
    .select({ n: sql<number>`count(*)::int` })
    .from(budgetItem)
    .where(
      and(
        eq(budgetItem.versionId, versionId),
        isNull(budgetItem.deletedAt),
        sql`${budgetItem.originalQuantity} is not null`,
      ),
    );
  return (r?.n ?? 0) > 0;
}

/* ---------- pořadí ---------- */

/** Vloží `id` na pozici `index` mezi sourozence (`ids` bez `id`) a vrátí nové pořadí. */
export function insertAt(ids: readonly string[], id: string, index?: number | null): string[] {
  const rest = ids.filter((x) => x !== id);
  const at =
    index === undefined || index === null ? rest.length : Math.max(0, Math.min(index, rest.length));
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}

export async function renumberItems(c: Ctx, orderedIds: readonly string[]) {
  for (let i = 0; i < orderedIds.length; i++)
    await c.db.update(budgetItem).set({ position: i }).where(eq(budgetItem.id, orderedIds[i]!));
}
export async function renumberSections(c: Ctx, orderedIds: readonly string[]) {
  for (let i = 0; i < orderedIds.length; i++)
    await c.db
      .update(budgetSection)
      .set({ position: i })
      .where(eq(budgetSection.id, orderedIds[i]!));
}
export async function renumberObjects(c: Ctx, orderedIds: readonly string[]) {
  for (let i = 0; i < orderedIds.length; i++)
    await c.db.update(budgetObject).set({ position: i }).where(eq(budgetObject.id, orderedIds[i]!));
}

export async function nextItemPosition(c: Ctx, sectionId: string): Promise<number> {
  const [r] = await c.db
    .select({ next: sql<number>`coalesce(max(${budgetItem.position}), -1)::int + 1` })
    .from(budgetItem)
    .where(and(eq(budgetItem.sectionId, sectionId), isNull(budgetItem.deletedAt)));
  return r?.next ?? 0;
}

export async function nextSectionPosition(
  c: Ctx,
  objectId: string,
  parentId: string | null,
): Promise<number> {
  const [r] = await c.db
    .select({ next: sql<number>`coalesce(max(${budgetSection.position}), -1)::int + 1` })
    .from(budgetSection)
    .where(
      and(
        eq(budgetSection.objectId, objectId),
        parentId ? eq(budgetSection.parentId, parentId) : isNull(budgetSection.parentId),
        isNull(budgetSection.deletedAt),
      ),
    );
  return r?.next ?? 0;
}

/** Sourozenecké položky oddílu v pořadí. */
export async function itemIdsIn(c: Ctx, sectionId: string): Promise<string[]> {
  const rows = await c.db
    .select({ id: budgetItem.id })
    .from(budgetItem)
    .where(and(eq(budgetItem.sectionId, sectionId), isNull(budgetItem.deletedAt)))
    .orderBy(asc(budgetItem.position), asc(budgetItem.createdAt));
  return rows.map((r) => r.id);
}

export async function sectionIdsIn(
  c: Ctx,
  objectId: string,
  parentId: string | null,
): Promise<string[]> {
  const rows = await c.db
    .select({ id: budgetSection.id })
    .from(budgetSection)
    .where(
      and(
        eq(budgetSection.objectId, objectId),
        parentId ? eq(budgetSection.parentId, parentId) : isNull(budgetSection.parentId),
        isNull(budgetSection.deletedAt),
      ),
    )
    .orderBy(asc(budgetSection.position), asc(budgetSection.createdAt));
  return rows.map((r) => r.id);
}

/** Id oddílu a všech jeho potomků (včetně něj). */
export function subtreeIds(
  sections: readonly Pick<SectionRow, "id" | "parentId">[],
  rootId: string,
) {
  const out = [rootId];
  for (let i = 0; i < out.length; i++)
    for (const s of sections) if (s.parentId === out[i] && !out.includes(s.id)) out.push(s.id);
  return out;
}

export function sectionDepth(sections: readonly Pick<SectionRow, "id" | "parentId">[], id: string) {
  const byId = new Map(sections.map((s) => [s.id, s]));
  let d = 1;
  for (let p = byId.get(id)?.parentId; p && d < 50; p = byId.get(p)?.parentId) d++;
  return d;
}
