import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { assertEntityAccess } from "@rebar/core/entities";
import { defaultVatRateBp } from "@rebar/core/config-data";
import { defineCommand } from "@rebar/core/module-server";
import { inTx, NotFoundError, PermissionError, scopeOf, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import {
  budgetCalcLine,
  budgetItem,
  budgetObject,
  budgetSection,
  budgetVersion,
  costAllocation,
  job,
  jobCost,
  jobOrder,
  workStatementLine,
} from "../schema";
import { evaluateCalcLines, sumCalcThousandths } from "./formula";
import {
  ITEM_KIND_KEYS,
  MAX_AMOUNT_MINOR,
  lineAmount,
  normalizeQuantity,
  quantityString,
  type ItemKind,
} from "./math";
import { budgetTreeView, toItem, versionSummaries } from "./queries";
import {
  assertEditable,
  auditJob,
  copyVersionContent,
  createVersion,
  ensureDefaultObject,
  insertAt,
  isBaselined,
  itemIdsIn,
  listVersions,
  loadStructure,
  lockVersionRow,
  lockVersionTx,
  nextSectionPosition,
  recomputeSummary,
  renumberItems,
  renumberSections,
  sectionDepth,
  MAX_SECTION_DEPTH,
  sectionIdsIn,
  subtreeIds,
  type ItemRow,
  type VersionRow,
} from "./service";
import { copyOfferToRealizationTx } from "./transitions";

const uuid = z.uuid();
const money = z.number().int().min(-MAX_AMOUNT_MINOR).max(MAX_AMOUNT_MINOR);
const vatBp = z.number().int().min(0).max(10_000);
const isoDate = z.iso.date().nullable();
const qty = z.preprocess(
  (v) => (typeof v === "number" ? String(v) : v),
  z
    .string()
    .trim()
    .refine(
      (v) => normalizeQuantity(v) !== null,
      "Množství zadejte jako číslo (nejvýš 3 desetinná místa).",
    )
    .transform((v) => normalizeQuantity(v)!),
);
const text = (max: number) => z.string().trim().max(max);
const nullableText = (max: number) =>
  text(max)
    .nullable()
    .transform((v) => (v ? v : null));

/* ---------- přístup ---------- */

/** Čtení rozpočtu: přístup k zakázce a oprávnění `zakazky.economics` (cena a náklad jsou citlivé). */
async function readGuard(ctx: Ctx, jobId: string) {
  await assertEntityAccess(ctx, "job", jobId, "read");
  if (!scopeOf(ctx, "zakazky.economics")) throw new PermissionError();
}

/** Zápis rozpočtu: přístup k zakázce a oprávnění `zakazky.budget`. */
async function writeGuard(ctx: Ctx, jobId: string) {
  await assertEntityAccess(ctx, "job", jobId, "write");
  if (!scopeOf(ctx, "zakazky.budget")) throw new PermissionError();
}

async function jobOfVersion(ctx: Ctx, versionId: string): Promise<string> {
  const [v] = await ctx.db
    .select({ jobId: budgetVersion.jobId })
    .from(budgetVersion)
    .where(and(eq(budgetVersion.id, versionId), isNull(budgetVersion.deletedAt)));
  if (!v) throw new NotFoundError("Verze rozpočtu nenalezena.");
  return v.jobId;
}

async function versionOf(
  ctx: Ctx,
  table: "item" | "section" | "object" | "calc",
  id: string,
): Promise<string> {
  const q =
    table === "item"
      ? ctx.db
          .select({ v: budgetItem.versionId })
          .from(budgetItem)
          .where(and(eq(budgetItem.id, id), isNull(budgetItem.deletedAt)))
      : table === "section"
        ? ctx.db
            .select({ v: budgetSection.versionId })
            .from(budgetSection)
            .where(and(eq(budgetSection.id, id), isNull(budgetSection.deletedAt)))
        : table === "object"
          ? ctx.db
              .select({ v: budgetObject.versionId })
              .from(budgetObject)
              .where(and(eq(budgetObject.id, id), isNull(budgetObject.deletedAt)))
          : ctx.db
              .select({ v: budgetItem.versionId })
              .from(budgetCalcLine)
              .innerJoin(budgetItem, eq(budgetItem.id, budgetCalcLine.itemId))
              .where(eq(budgetCalcLine.id, id));
  const [r] = await q;
  if (!r) throw new NotFoundError("Záznam rozpočtu nenalezen.");
  return r.v;
}

/**
 * Zápis do verze: ověří oprávnění, v transakci zamkne řádek verze (souběžné úpravy jdou po jedné), zkontroluje
 * zamčení, provede změnu, přepočte souhrn zakázky a zapíše audit.
 */
async function inVersion<T>(
  ctx: Ctx,
  versionId: string,
  opts: { allowLocked?: boolean },
  fn: (c: Ctx, v: VersionRow) => Promise<{ result: T; audit?: string }>,
): Promise<T> {
  await writeGuard(ctx, await jobOfVersion(ctx, versionId));
  return inTx(ctx, async (c) => {
    const v = await lockVersionRow(c, versionId);
    if (!opts.allowLocked) assertEditable(v);
    const { result, audit } = await fn(c, v);
    if (audit) await auditJob(c, v.jobId, audit);
    await recomputeSummary(c, v.jobId);
    return result;
  });
}

const where = (v: VersionRow) =>
  v.kind === "offer" ? `nabídka ${v.number}` : `rozpočet realizace ${v.number}`;

/* ---------- čtení ---------- */

export const budgetTree = defineCommand({
  name: "zakazky.budget.tree",
  permission: "zakazky.economics",
  input: z.object({ jobId: uuid, versionId: uuid.nullish() }),
  handler: async (ctx, i) => {
    await readGuard(ctx, i.jobId);
    return budgetTreeView(ctx, i.jobId, i.versionId);
  },
});

/* ---------- verze ---------- */

export const versionList = defineCommand({
  name: "zakazky.budget.version.list",
  permission: "zakazky.economics",
  input: z.object({ jobId: uuid }),
  handler: async (ctx, i) => {
    await readGuard(ctx, i.jobId);
    return versionSummaries(ctx, await listVersions(ctx, i.jobId));
  },
});

export const versionCreate = defineCommand({
  name: "zakazky.budget.version.create",
  permission: "zakazky.budget",
  input: z.object({
    jobId: uuid,
    /** Bez druhu se vybere podle fáze zakázky (poptávka a nabídka: nabídka, jinak realizace). */
    kind: z.enum(["offer", "realization"]).optional(),
    title: nullableText(120).optional(),
    /** Verze, ze které se zkopíruje obsah (nová revize nabídky). */
    copyFromVersionId: uuid.nullish(),
  }),
  handler: async (ctx, i) => {
    await writeGuard(ctx, i.jobId);
    return inTx(ctx, async (c) => {
      const [j] = await c.db
        .select({ phase: job.phase })
        .from(job)
        .where(and(eq(job.id, i.jobId), isNull(job.deletedAt)));
      if (!j) throw new NotFoundError("Zakázka nenalezena.");
      const kind =
        i.kind ?? (j.phase === "inquiry" || j.phase === "offer" ? "offer" : "realization");
      const existing = await listVersions(c, i.jobId);
      if (kind === "realization" && existing.some((v) => v.kind === "realization"))
        throw new UserError("Zakázka už má rozpočet realizace.");
      const v = await createVersion(c, { jobId: i.jobId, kind, title: i.title ?? null });
      if (i.copyFromVersionId) {
        const src = existing.find((x) => x.id === i.copyFromVersionId);
        if (!src) throw new NotFoundError("Zdrojová verze nenalezena.");
        await copyVersionContent(c, src.id, v.id, { markOriginal: false });
        await c.db
          .update(budgetVersion)
          .set({ sourceVersionId: src.id })
          .where(eq(budgetVersion.id, v.id));
      }
      await auditJob(c, i.jobId, `Založena ${where(v)}`, "create");
      await recomputeSummary(c, i.jobId);
      return { id: v.id, kind, number: v.number };
    });
  },
});

export const versionSetStatus = defineCommand({
  name: "zakazky.budget.version.setStatus",
  permission: "zakazky.budget",
  input: z.object({
    versionId: uuid,
    /** Bez stavu se mění jen název a poznámka (platnost nabídky pro PDF). */
    status: z.enum(["draft", "sent"]).optional(),
    title: nullableText(120).optional(),
    note: nullableText(2000).optional(),
  }),
  handler: async (ctx, i) => {
    const jobId = await jobOfVersion(ctx, i.versionId);
    await writeGuard(ctx, jobId);
    return inTx(ctx, async (c) => {
      const v = await lockVersionRow(c, i.versionId);
      if (!i.status) {
        assertEditable(v);
        await c.db
          .update(budgetVersion)
          .set({
            ...(i.title !== undefined ? { title: i.title } : {}),
            ...(i.note !== undefined ? { note: i.note } : {}),
            updatedBy: c.actor.userId,
          })
          .where(eq(budgetVersion.id, v.id));
        await auditJob(c, v.jobId, `Upraven název a poznámka: ${where(v)}`);
        return { id: v.id, status: v.status };
      }
      if (v.status === "locked") {
        // odemknutí smí jen ten, kdo schvaluje bez limitu; zapíše se do auditu
        if (i.status === "sent")
          throw new UserError("Zamčenou verzi nejde odeslat. Nejdřív ji odemkněte.");
        if (!scopeOf(c, "zakazky.approve_all"))
          throw new UserError("Zamčenou verzi smí odemknout jen ten, kdo schvaluje bez limitu.");
      }
      if (i.status === "sent" && v.kind !== "offer")
        throw new UserError("Odeslat zákazníkovi jde jen nabídku.");
      await c.db
        .update(budgetVersion)
        .set({
          status: i.status,
          ...(v.status === "locked" ? { lockedAt: null, lockedBy: null } : {}),
          ...(i.title !== undefined ? { title: i.title } : {}),
          ...(i.note !== undefined ? { note: i.note } : {}),
          updatedBy: c.actor.userId,
        })
        .where(eq(budgetVersion.id, v.id));
      await auditJob(
        c,
        v.jobId,
        v.status === "locked"
          ? `Odemčena ${where(v)}`
          : i.status === "sent"
            ? `Nabídka ${v.number} označena jako odeslaná zákazníkovi`
            : `${where(v)}: stav vrácen do rozpracovaných`,
      );
      return { id: v.id, status: i.status };
    });
  },
});

export const versionLock = defineCommand({
  name: "zakazky.budget.version.lock",
  permission: "zakazky.budget",
  input: z.object({ versionId: uuid }),
  handler: async (ctx, i) => {
    await writeGuard(ctx, await jobOfVersion(ctx, i.versionId));
    return inTx(ctx, async (c) => {
      const v = await lockVersionRow(c, i.versionId);
      const locked = await lockVersionTx(c, v);
      await recomputeSummary(c, v.jobId);
      return { id: locked.id, status: locked.status };
    });
  },
});

export const copyOffer = defineCommand({
  name: "zakazky.budget.copyOffer",
  permission: "zakazky.budget",
  input: z.object({ jobId: uuid }),
  handler: async (ctx, i) => {
    await writeGuard(ctx, i.jobId);
    return inTx(ctx, (c) => copyOfferToRealizationTx(c, i.jobId));
  },
});

/* ---------- objekty ---------- */

export const objectSave = defineCommand({
  name: "zakazky.budget.object.save",
  permission: "zakazky.budget",
  input: z.object({
    id: uuid.optional(),
    versionId: uuid.optional(),
    code: nullableText(40).optional(),
    title: text(200).min(1, "Vyplňte název objektu.").optional(),
    responsibleId: uuid.nullable().optional(),
  }),
  handler: async (ctx, i) => {
    const versionId = i.id ? await versionOf(ctx, "object", i.id) : i.versionId;
    if (!versionId) throw new UserError("Chybí verze rozpočtu.");
    return inVersion(ctx, versionId, {}, async (c, v) => {
      if (i.id) {
        const patch = {
          ...(i.code !== undefined ? { code: i.code } : {}),
          ...(i.title !== undefined ? { title: i.title } : {}),
          ...(i.responsibleId !== undefined ? { responsibleId: i.responsibleId } : {}),
          updatedBy: c.actor.userId,
        };
        const [r] = await c.db
          .update(budgetObject)
          .set(patch)
          .where(and(eq(budgetObject.id, i.id), eq(budgetObject.versionId, v.id)))
          .returning({ id: budgetObject.id });
        if (!r) throw new NotFoundError("Objekt nenalezen.");
        return { result: { id: i.id }, audit: `Upraven stavební objekt (${where(v)})` };
      }
      if (!i.title) throw new UserError("Vyplňte název objektu.");
      await ensureDefaultObject(c, v.id);
      const [n] = await c.db
        .select({ next: sql<number>`coalesce(max(${budgetObject.position}), -1)::int + 1` })
        .from(budgetObject)
        .where(and(eq(budgetObject.versionId, v.id), isNull(budgetObject.deletedAt)));
      const [r] = await c.db
        .insert(budgetObject)
        .values({
          versionId: v.id,
          code: i.code ?? null,
          title: i.title,
          responsibleId: i.responsibleId ?? null,
          position: n?.next ?? 0,
          createdBy: c.actor.userId,
          updatedBy: c.actor.userId,
        })
        .returning({ id: budgetObject.id });
      return { result: { id: r!.id }, audit: `Přidán stavební objekt „${i.title}“ (${where(v)})` };
    });
  },
});

export const objectDelete = defineCommand({
  name: "zakazky.budget.object.delete",
  permission: "zakazky.budget",
  input: z.object({ id: uuid }),
  handler: async (ctx, i) => {
    const versionId = await versionOf(ctx, "object", i.id);
    return inVersion(ctx, versionId, {}, async (c, v) => {
      const [o] = await c.db
        .select()
        .from(budgetObject)
        .where(and(eq(budgetObject.id, i.id), isNull(budgetObject.deletedAt)));
      if (!o) throw new NotFoundError("Objekt nenalezen.");
      if (o.isDefault) throw new UserError("Výchozí objekt „Celá zakázka“ nejde smazat.");
      const [s] = await c.db
        .select({ n: sql<number>`count(*)::int` })
        .from(budgetSection)
        .where(and(eq(budgetSection.objectId, o.id), isNull(budgetSection.deletedAt)));
      if ((s?.n ?? 0) > 0)
        throw new UserError(
          "Objekt obsahuje oddíly. Nejdřív je přesuňte do jiného objektu nebo smažte.",
        );
      await c.db
        .update(budgetObject)
        .set({ deletedAt: new Date(), updatedBy: c.actor.userId })
        .where(eq(budgetObject.id, o.id));
      return { result: { id: o.id }, audit: `Smazán stavební objekt „${o.title}“ (${where(v)})` };
    });
  },
});

/* ---------- oddíly ---------- */

export const sectionSave = defineCommand({
  name: "zakazky.budget.section.save",
  permission: "zakazky.budget",
  input: z.object({
    id: uuid.optional(),
    versionId: uuid.optional(),
    /** Při vytvoření: objekt (výchozí, když chybí) a nadřazený oddíl. */
    objectId: uuid.optional(),
    parentId: uuid.nullish(),
    code: nullableText(40).optional(),
    title: text(200).min(1, "Vyplňte název oddílu.").optional(),
    costCategory: z.enum(ITEM_KIND_KEYS).nullable().optional(),
  }),
  handler: async (ctx, i) => {
    const versionId = i.id ? await versionOf(ctx, "section", i.id) : i.versionId;
    if (!versionId) throw new UserError("Chybí verze rozpočtu.");
    return inVersion(ctx, versionId, {}, async (c, v) => {
      if (i.id) {
        const patch = {
          ...(i.code !== undefined ? { code: i.code } : {}),
          ...(i.title !== undefined ? { title: i.title } : {}),
          ...(i.costCategory !== undefined ? { costCategory: i.costCategory } : {}),
          updatedBy: c.actor.userId,
        };
        const [r] = await c.db
          .update(budgetSection)
          .set(patch)
          .where(and(eq(budgetSection.id, i.id), eq(budgetSection.versionId, v.id)))
          .returning({ id: budgetSection.id });
        if (!r) throw new NotFoundError("Oddíl nenalezen.");
        return { result: { id: i.id }, audit: `Upraven oddíl rozpočtu (${where(v)})` };
      }
      if (!i.title) throw new UserError("Vyplňte název oddílu.");
      const all = (await loadStructure(c, v.id)).sections;
      let objectId = i.objectId;
      let parentId = i.parentId ?? null;
      if (parentId) {
        const p = all.find((s) => s.id === parentId);
        if (!p) throw new NotFoundError("Nadřazený oddíl nenalezen.");
        objectId = p.objectId;
        if (sectionDepth(all, parentId) >= MAX_SECTION_DEPTH)
          throw new UserError(`Oddíly lze vnořit nejvýš do ${MAX_SECTION_DEPTH} úrovní.`);
      }
      if (!objectId) objectId = (await ensureDefaultObject(c, v.id)).id;
      else {
        const [o] = await c.db
          .select({ id: budgetObject.id })
          .from(budgetObject)
          .where(
            and(
              eq(budgetObject.id, objectId),
              eq(budgetObject.versionId, v.id),
              isNull(budgetObject.deletedAt),
            ),
          );
        if (!o) throw new NotFoundError("Objekt nenalezen.");
      }
      parentId = parentId ?? null;
      const [r] = await c.db
        .insert(budgetSection)
        .values({
          versionId: v.id,
          objectId,
          parentId,
          code: i.code ?? null,
          title: i.title,
          costCategory: i.costCategory ?? null,
          position: await nextSectionPosition(c, objectId, parentId),
          createdBy: c.actor.userId,
          updatedBy: c.actor.userId,
        })
        .returning({ id: budgetSection.id });
      return { result: { id: r!.id }, audit: `Přidán oddíl „${i.title}“ (${where(v)})` };
    });
  },
});

/** Kolik vazeb na oddíly a položky zabraňuje smazání (náklady, objednávky, soupisy prací). */
async function usageOf(c: Ctx, sectionIds: readonly string[], itemIds: readonly string[]) {
  const count = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
  const secs = sectionIds.length
    ? await Promise.all([
        count(
          c.db
            .select({ n: sql<number>`count(*)::int` })
            .from(costAllocation)
            .where(inArray(costAllocation.sectionId, [...sectionIds])),
        ),
        count(
          c.db
            .select({ n: sql<number>`count(*)::int` })
            .from(jobCost)
            .where(and(inArray(jobCost.sectionId, [...sectionIds]), isNull(jobCost.deletedAt))),
        ),
        count(
          c.db
            .select({ n: sql<number>`count(*)::int` })
            .from(jobOrder)
            .where(and(inArray(jobOrder.sectionId, [...sectionIds]), isNull(jobOrder.deletedAt))),
        ),
      ])
    : [0, 0, 0];
  const items = itemIds.length
    ? await Promise.all([
        count(
          c.db
            .select({ n: sql<number>`count(*)::int` })
            .from(workStatementLine)
            .where(inArray(workStatementLine.itemId, [...itemIds])),
        ),
        count(
          c.db
            .select({ n: sql<number>`count(*)::int` })
            .from(costAllocation)
            .where(inArray(costAllocation.itemId, [...itemIds])),
        ),
        count(
          c.db
            .select({ n: sql<number>`count(*)::int` })
            .from(jobCost)
            .where(and(inArray(jobCost.itemId, [...itemIds]), isNull(jobCost.deletedAt))),
        ),
      ])
    : [0, 0, 0];
  return {
    costs: secs[0]! + secs[1]! + items[1]! + items[2]!,
    orders: secs[2]!,
    statements: items[0]!,
  };
}

function usageProblem(u: { costs: number; orders: number; statements: number }, what: string) {
  if (u.statements) return `${what} je v soupisu provedených prací, nejde ho smazat.`;
  if (u.costs) return `K ${what.toLowerCase()} jsou přiřazeny náklady. Nejdřív je přeřaďte jinam.`;
  if (u.orders) return `K ${what.toLowerCase()} patří objednávka. Nejdřív ji přeřaďte jinam.`;
  return null;
}

export const sectionDelete = defineCommand({
  name: "zakazky.budget.section.delete",
  permission: "zakazky.budget",
  input: z.object({ id: uuid, cascade: z.boolean().default(false) }),
  handler: async (ctx, i) => {
    const versionId = await versionOf(ctx, "section", i.id);
    return inVersion(ctx, versionId, {}, async (c, v) => {
      const st = await loadStructure(c, v.id);
      const root = st.sections.find((s) => s.id === i.id);
      if (!root) throw new NotFoundError("Oddíl nenalezen.");
      const ids = subtreeIds(st.sections, root.id);
      const items = st.items.filter((x) => ids.includes(x.sectionId));
      if ((ids.length > 1 || items.length) && !i.cascade)
        throw new UserError(
          `Oddíl není prázdný (pododdíly ${ids.length - 1}, položky ${items.length}). Nejdřív ho vyprázdněte nebo potvrďte smazání i s obsahem.`,
        );
      const problem = usageProblem(
        await usageOf(
          c,
          ids,
          items.map((x) => x.id),
        ),
        "oddílu",
      );
      if (problem) throw new UserError(problem);
      const now = new Date();
      if (items.length)
        await c.db
          .update(budgetItem)
          .set({ deletedAt: now, updatedBy: c.actor.userId })
          .where(
            inArray(
              budgetItem.id,
              items.map((x) => x.id),
            ),
          );
      await c.db
        .update(budgetSection)
        .set({ deletedAt: now, updatedBy: c.actor.userId })
        .where(inArray(budgetSection.id, ids));
      return {
        result: { id: root.id, deletedItems: items.length },
        audit: `Smazán oddíl „${root.title}“ i s obsahem (${items.length} položek, ${where(v)})`,
      };
    });
  },
});

export const sectionMove = defineCommand({
  name: "zakazky.budget.section.move",
  permission: "zakazky.budget",
  input: z.object({
    id: uuid,
    /** Nový nadřazený oddíl (`null` = kořen objektu); bez hodnoty se nemění. */
    parentId: uuid.nullish(),
    /** Nový objekt (jen při přesunu na kořen). */
    objectId: uuid.optional(),
    /** Pozice mezi sourozenci (od 0); bez ní na konec. */
    index: z.number().int().min(0).optional(),
  }),
  handler: async (ctx, i) => {
    const versionId = await versionOf(ctx, "section", i.id);
    return inVersion(ctx, versionId, {}, async (c, v) => {
      const st = await loadStructure(c, v.id);
      const s = st.sections.find((x) => x.id === i.id);
      if (!s) throw new NotFoundError("Oddíl nenalezen.");
      let parentId: string | null = i.parentId === undefined ? s.parentId : i.parentId;
      let objectId = i.objectId ?? s.objectId;
      if (parentId) {
        const p = st.sections.find((x) => x.id === parentId);
        if (!p) throw new NotFoundError("Cílový oddíl nenalezen.");
        if (subtreeIds(st.sections, s.id).includes(p.id))
          throw new UserError("Oddíl nejde přesunout do sebe sama ani do svého pododdílu.");
        objectId = p.objectId;
        const sub = subtreeIds(st.sections, s.id);
        const deepest = Math.max(
          ...sub.map((id) => sectionDepth(st.sections, id) - sectionDepth(st.sections, s.id)),
        );
        if (sectionDepth(st.sections, p.id) + 1 + deepest > MAX_SECTION_DEPTH)
          throw new UserError(`Oddíly lze vnořit nejvýš do ${MAX_SECTION_DEPTH} úrovní.`);
      } else if (!st.objects.some((o) => o.id === objectId)) {
        throw new NotFoundError("Objekt nenalezen.");
      }
      parentId = parentId ?? null;
      const oldKey = `${s.objectId}/${s.parentId ?? ""}`;
      const newKey = `${objectId}/${parentId ?? ""}`;
      const sub = subtreeIds(st.sections, s.id);
      await c.db
        .update(budgetSection)
        .set({ parentId, objectId, updatedBy: c.actor.userId })
        .where(eq(budgetSection.id, s.id));
      if (objectId !== s.objectId)
        await c.db.update(budgetSection).set({ objectId }).where(inArray(budgetSection.id, sub));
      const order = insertAt(await sectionIdsIn(c, objectId, parentId), s.id, i.index);
      await renumberSections(c, order);
      if (oldKey !== newKey)
        await renumberSections(c, await sectionIdsIn(c, s.objectId, s.parentId));
      return { result: { id: s.id }, audit: `Přesunut oddíl „${s.title}“ (${where(v)})` };
    });
  },
});

/* ---------- položky ---------- */

const itemPatch = {
  code: nullableText(40).optional(),
  title: text(300).min(1, "Vyplňte název položky.").optional(),
  kind: z.enum(ITEM_KIND_KEYS).optional(),
  unit: text(12).min(1, "Vyplňte měrnou jednotku.").optional(),
  quantity: qty.optional(),
  unitCostMinor: money.optional(),
  unitPriceMinor: money.optional(),
  vatRateBp: vatBp.optional(),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  spec: nullableText(4000).optional(),
  note: nullableText(2000).optional(),
};

function checkAmounts(q: string, cost: number, price: number, title: string) {
  if (
    Math.abs(lineAmount(q, cost)) > MAX_AMOUNT_MINOR ||
    Math.abs(lineAmount(q, price)) > MAX_AMOUNT_MINOR
  )
    throw new UserError(`Částka položky „${title}“ je příliš vysoká.`);
}

export const itemSave = defineCommand({
  name: "zakazky.budget.item.save",
  permission: "zakazky.budget",
  input: z.object({
    id: uuid.optional(),
    /** Při vytvoření: oddíl, do kterého položka patří. */
    sectionId: uuid.optional(),
    /** Při vytvoření: pozice v oddíle (od 0); bez ní na konec. */
    index: z.number().int().min(0).optional(),
    ...itemPatch,
  }),
  handler: async (ctx, i) => {
    const versionId = i.id
      ? await versionOf(ctx, "item", i.id)
      : i.sectionId
        ? await versionOf(ctx, "section", i.sectionId)
        : null;
    if (!versionId) throw new UserError("Chybí oddíl, do kterého položka patří.");
    return inVersion(ctx, versionId, {}, async (c, v) => {
      const common = {
        ...(i.code !== undefined ? { code: i.code } : {}),
        ...(i.title !== undefined ? { title: i.title } : {}),
        ...(i.kind !== undefined ? { kind: i.kind } : {}),
        ...(i.unit !== undefined ? { unit: i.unit } : {}),
        ...(i.unitCostMinor !== undefined ? { unitCostMinor: i.unitCostMinor } : {}),
        ...(i.unitPriceMinor !== undefined ? { unitPriceMinor: i.unitPriceMinor } : {}),
        ...(i.vatRateBp !== undefined ? { vatRateBp: i.vatRateBp } : {}),
        ...(i.startDate !== undefined ? { startDate: i.startDate } : {}),
        ...(i.endDate !== undefined ? { endDate: i.endDate } : {}),
        ...(i.spec !== undefined ? { spec: i.spec } : {}),
        ...(i.note !== undefined ? { note: i.note } : {}),
      };
      if (i.id) {
        const [cur] = await c.db
          .select()
          .from(budgetItem)
          .where(
            and(
              eq(budgetItem.id, i.id),
              eq(budgetItem.versionId, v.id),
              isNull(budgetItem.deletedAt),
            ),
          );
        if (!cur) throw new NotFoundError("Položka nenalezena.");
        if (i.quantity !== undefined && i.quantity !== cur.quantity) {
          const [n] = await c.db
            .select({ n: sql<number>`count(*)::int` })
            .from(budgetCalcLine)
            .where(eq(budgetCalcLine.itemId, cur.id));
          if ((n?.n ?? 0) > 0)
            throw new UserError(
              "Množství vychází z výkazu výměr. Upravte řádky výkazu, nebo je smažte a zadejte množství ručně.",
            );
        }
        const q = i.quantity ?? cur.quantity;
        checkAmounts(
          q,
          i.unitCostMinor ?? cur.unitCostMinor,
          i.unitPriceMinor ?? cur.unitPriceMinor,
          i.title ?? cur.title,
        );
        const [row] = await c.db
          .update(budgetItem)
          .set({
            ...common,
            ...(i.quantity !== undefined ? { quantity: i.quantity } : {}),
            updatedBy: c.actor.userId,
          })
          .where(eq(budgetItem.id, cur.id))
          .returning();
        return {
          result: { id: cur.id, item: toItem(row!) },
          audit: `Rozpočet: upravena položka „${row!.title}“ (${where(v)})`,
        };
      }

      if (!i.title) throw new UserError("Vyplňte název položky.");
      const [section] = await c.db
        .select()
        .from(budgetSection)
        .where(
          and(
            eq(budgetSection.id, i.sectionId!),
            eq(budgetSection.versionId, v.id),
            isNull(budgetSection.deletedAt),
          ),
        );
      if (!section) throw new NotFoundError("Oddíl nenalezen.");
      const siblings = await itemIdsIn(c, section.id);
      // nová položka převezme sazbu DPH poslední položky oddílu (nebo verze)
      const [prev] = await c.db
        .select()
        .from(budgetItem)
        .where(and(eq(budgetItem.versionId, v.id), isNull(budgetItem.deletedAt)))
        .orderBy(
          sql`${budgetItem.sectionId} = ${section.id} desc`,
          sql`${budgetItem.createdAt} desc`,
        )
        .limit(1);
      const q = i.quantity ?? "1";
      const vals = {
        kind: (i.kind ?? section.costCategory ?? "other") as ItemKind,
        unit: i.unit ?? "ks",
        unitCostMinor: i.unitCostMinor ?? 0,
        unitPriceMinor: i.unitPriceMinor ?? 0,
        vatRateBp:
          i.vatRateBp ??
          prev?.vatRateBp ??
          (await defaultVatRateBp(c.db, new Date().toISOString().slice(0, 10))),
      };
      checkAmounts(q, vals.unitCostMinor, vals.unitPriceMinor, i.title);
      // ve verzi s uloženými původními hodnotami je nová položka mimo původní dohodu (původně 0)
      const baselined = await isBaselined(c, v.id);
      const [row] = await c.db
        .insert(budgetItem)
        .values({
          ...common,
          ...vals,
          title: i.title,
          versionId: v.id,
          sectionId: section.id,
          quantity: q,
          position: siblings.length,
          ...(baselined
            ? {
                originalQuantity: "0.000",
                originalUnitCostMinor: vals.unitCostMinor,
                originalUnitPriceMinor: vals.unitPriceMinor,
              }
            : {}),
          createdBy: c.actor.userId,
          updatedBy: c.actor.userId,
        })
        .returning();
      if (i.index !== undefined) await renumberItems(c, insertAt(siblings, row!.id, i.index));
      return {
        result: { id: row!.id, item: toItem(row!) },
        audit: `Rozpočet: přidána položka „${i.title}“ (${where(v)})`,
      };
    });
  },
});

export const itemDelete = defineCommand({
  name: "zakazky.budget.item.delete",
  permission: "zakazky.budget",
  input: z.object({ ids: z.array(uuid).min(1).max(500) }),
  handler: async (ctx, i) => {
    const versionId = await versionOf(ctx, "item", i.ids[0]!);
    return inVersion(ctx, versionId, {}, async (c, v) => {
      const rows = await c.db
        .select()
        .from(budgetItem)
        .where(
          and(
            inArray(budgetItem.id, i.ids),
            eq(budgetItem.versionId, v.id),
            isNull(budgetItem.deletedAt),
          ),
        );
      if (rows.length !== new Set(i.ids).size) throw new NotFoundError("Položka nenalezena.");
      const problem = usageProblem(await usageOf(c, [], i.ids), "položce");
      if (problem) throw new UserError(problem);
      await c.db
        .update(budgetItem)
        .set({ deletedAt: new Date(), updatedBy: c.actor.userId })
        .where(inArray(budgetItem.id, i.ids));
      return {
        result: { deleted: rows.length },
        audit: `Rozpočet: smazáno položek ${rows.length}${rows.length === 1 ? ` („${rows[0]!.title}“)` : ""} (${where(v)})`,
      };
    });
  },
});

export const itemMove = defineCommand({
  name: "zakazky.budget.item.move",
  permission: "zakazky.budget",
  input: z.object({
    id: uuid,
    /** Cílový oddíl (bez hodnoty zůstane ve stejném). */
    sectionId: uuid.optional(),
    index: z.number().int().min(0).optional(),
  }),
  handler: async (ctx, i) => {
    const versionId = await versionOf(ctx, "item", i.id);
    return inVersion(ctx, versionId, {}, async (c, v) => {
      const [it] = await c.db
        .select()
        .from(budgetItem)
        .where(and(eq(budgetItem.id, i.id), isNull(budgetItem.deletedAt)));
      if (!it) throw new NotFoundError("Položka nenalezena.");
      const target = i.sectionId ?? it.sectionId;
      if (target !== it.sectionId) {
        const [s] = await c.db
          .select({ id: budgetSection.id })
          .from(budgetSection)
          .where(
            and(
              eq(budgetSection.id, target),
              eq(budgetSection.versionId, v.id),
              isNull(budgetSection.deletedAt),
            ),
          );
        if (!s) throw new NotFoundError("Cílový oddíl nenalezen.");
        await c.db
          .update(budgetItem)
          .set({ sectionId: target, updatedBy: c.actor.userId })
          .where(eq(budgetItem.id, it.id));
        await renumberItems(c, await itemIdsIn(c, it.sectionId));
      }
      await renumberItems(c, insertAt(await itemIdsIn(c, target), it.id, i.index));
      return {
        result: { id: it.id },
        audit: `Rozpočet: přesunuta položka „${it.title}“ (${where(v)})`,
      };
    });
  },
});

export const itemDuplicate = defineCommand({
  name: "zakazky.budget.item.duplicate",
  permission: "zakazky.budget",
  input: z.object({ id: uuid }),
  handler: async (ctx, i) => {
    const versionId = await versionOf(ctx, "item", i.id);
    return inVersion(ctx, versionId, {}, async (c, v) => {
      const [it] = await c.db
        .select()
        .from(budgetItem)
        .where(and(eq(budgetItem.id, i.id), isNull(budgetItem.deletedAt)));
      if (!it) throw new NotFoundError("Položka nenalezena.");
      const baselined = await isBaselined(c, v.id);
      const siblings = await itemIdsIn(c, it.sectionId);
      const [copy] = await c.db
        .insert(budgetItem)
        .values({
          versionId: v.id,
          sectionId: it.sectionId,
          position: siblings.length,
          code: it.code,
          title: it.title,
          kind: it.kind,
          unit: it.unit,
          quantity: it.quantity,
          unitCostMinor: it.unitCostMinor,
          unitPriceMinor: it.unitPriceMinor,
          vatRateBp: it.vatRateBp,
          startDate: it.startDate,
          endDate: it.endDate,
          spec: it.spec,
          note: it.note,
          catalogItemId: it.catalogItemId,
          ...(baselined
            ? {
                originalQuantity: "0.000",
                originalUnitCostMinor: it.unitCostMinor,
                originalUnitPriceMinor: it.unitPriceMinor,
              }
            : {}),
          createdBy: c.actor.userId,
          updatedBy: c.actor.userId,
        })
        .returning();
      const calc = await c.db
        .select()
        .from(budgetCalcLine)
        .where(eq(budgetCalcLine.itemId, it.id))
        .orderBy(asc(budgetCalcLine.position));
      if (calc.length)
        await c.db.insert(budgetCalcLine).values(
          calc.map((l) => ({
            itemId: copy!.id,
            position: l.position,
            variable: l.variable,
            description: l.description,
            formula: l.formula,
            result: l.result,
          })),
        );
      await renumberItems(c, insertAt(siblings, copy!.id, siblings.indexOf(it.id) + 1));
      return {
        result: { id: copy!.id, item: toItem(copy!, calc.length) },
        audit: `Rozpočet: zduplikována položka „${it.title}“ (${where(v)})`,
      };
    });
  },
});

export const itemBulk = defineCommand({
  name: "zakazky.budget.item.bulk",
  permission: "zakazky.budget",
  input: z.object({
    ids: z.array(uuid).min(1).max(500),
    patch: z
      .object({
        kind: z.enum(ITEM_KIND_KEYS).optional(),
        vatRateBp: vatBp.optional(),
        sectionId: uuid.optional(),
        unitPriceMinor: money.optional(),
        unitCostMinor: money.optional(),
        /** Relativní změna prodejní / nákladové ceny v procentech (např. 5 = +5 %, −10 = −10 %). */
        priceAdjustPct: z.number().min(-100).max(1000).optional(),
        costAdjustPct: z.number().min(-100).max(1000).optional(),
      })
      .refine((p) => Object.keys(p).length > 0, "Vyberte, co se má změnit."),
  }),
  handler: async (ctx, i) => {
    const versionId = await versionOf(ctx, "item", i.ids[0]!);
    return inVersion(ctx, versionId, {}, async (c, v) => {
      const rows = await c.db
        .select()
        .from(budgetItem)
        .where(
          and(
            inArray(budgetItem.id, i.ids),
            eq(budgetItem.versionId, v.id),
            isNull(budgetItem.deletedAt),
          ),
        );
      if (rows.length !== new Set(i.ids).size) throw new NotFoundError("Položka nenalezena.");
      const p = i.patch;
      if (p.sectionId) {
        const [s] = await c.db
          .select({ id: budgetSection.id })
          .from(budgetSection)
          .where(
            and(
              eq(budgetSection.id, p.sectionId),
              eq(budgetSection.versionId, v.id),
              isNull(budgetSection.deletedAt),
            ),
          );
        if (!s) throw new NotFoundError("Cílový oddíl nenalezen.");
      }
      const adjust = (n: number, pct: number) => Math.round((n * (100 + pct)) / 100);
      const touched = new Set<string>();
      for (const r of rows) {
        const unitPriceMinor =
          p.unitPriceMinor ??
          (p.priceAdjustPct !== undefined
            ? adjust(r.unitPriceMinor, p.priceAdjustPct)
            : r.unitPriceMinor);
        const unitCostMinor =
          p.unitCostMinor ??
          (p.costAdjustPct !== undefined
            ? adjust(r.unitCostMinor, p.costAdjustPct)
            : r.unitCostMinor);
        checkAmounts(r.quantity, unitCostMinor, unitPriceMinor, r.title);
        await c.db
          .update(budgetItem)
          .set({
            unitPriceMinor,
            unitCostMinor,
            ...(p.kind ? { kind: p.kind } : {}),
            ...(p.vatRateBp !== undefined ? { vatRateBp: p.vatRateBp } : {}),
            ...(p.sectionId ? { sectionId: p.sectionId } : {}),
            updatedBy: c.actor.userId,
          })
          .where(eq(budgetItem.id, r.id));
        touched.add(r.sectionId);
      }
      if (p.sectionId) {
        touched.add(p.sectionId);
        for (const sid of touched) await renumberItems(c, await itemIdsIn(c, sid));
      }
      return {
        result: { updated: rows.length },
        audit: `Rozpočet: hromadná úprava ${rows.length} položek (${where(v)})`,
      };
    });
  },
});

/* ---------- výkaz výměr ---------- */

const calcInput = z.object({
  id: uuid.optional(),
  variable: text(40)
    .regex(/^[\p{L}_][\p{L}\p{N}_]*$/u, "Proměnná smí obsahovat písmena, číslice a podtržítko.")
    .nullish()
    .or(z.literal("")),
  description: nullableText(200).optional(),
  formula: text(300),
});

/** Spočítá všechny řádky položky a nastaví množství na součet výsledků. Chyba vzorce zruší uložení. */
async function recalcItem(c: Ctx, item: ItemRow) {
  const lines = await c.db
    .select()
    .from(budgetCalcLine)
    .where(eq(budgetCalcLine.itemId, item.id))
    .orderBy(asc(budgetCalcLine.position));
  if (!lines.length) return { quantity: item.quantity, lines: [] };
  const out = evaluateCalcLines(lines.map((l) => ({ variable: l.variable, formula: l.formula })));
  const bad = out.findIndex((o) => o.error);
  if (bad >= 0) throw new UserError(`Řádek ${bad + 1} výkazu výměr: ${out[bad]!.error}`);
  const total = sumCalcThousandths(out.map((o) => o.value));
  const quantity = quantityString(total / 1000);
  if (normalizeQuantity(quantity) === null || Math.abs(total) > 99_999_999_999_999)
    throw new UserError("Množství z výkazu výměr je příliš velké.");
  checkAmounts(quantity, item.unitCostMinor, item.unitPriceMinor, item.title);
  for (let n = 0; n < lines.length; n++)
    await c.db
      .update(budgetCalcLine)
      .set({ result: quantityString(out[n]!.value) })
      .where(eq(budgetCalcLine.id, lines[n]!.id));
  await c.db
    .update(budgetItem)
    .set({ quantity, updatedBy: c.actor.userId })
    .where(eq(budgetItem.id, item.id));
  return {
    quantity,
    lines: lines.map((l, n) => ({ ...l, result: quantityString(out[n]!.value) })),
  };
}

async function loadCalc(c: Ctx, itemId: string) {
  const rows = await c.db
    .select()
    .from(budgetCalcLine)
    .where(eq(budgetCalcLine.itemId, itemId))
    .orderBy(asc(budgetCalcLine.position));
  return rows.map((l) => ({
    id: l.id,
    position: l.position,
    variable: l.variable,
    description: l.description,
    formula: l.formula,
    result: l.result,
  }));
}

export const calcList = defineCommand({
  name: "zakazky.budget.calc.list",
  permission: "zakazky.economics",
  input: z.object({ itemId: uuid }),
  handler: async (ctx, i) => {
    const jobId = await jobOfVersion(ctx, await versionOf(ctx, "item", i.itemId));
    await readGuard(ctx, jobId);
    const [it] = await ctx.db.select().from(budgetItem).where(eq(budgetItem.id, i.itemId));
    return { quantity: it!.quantity, lines: await loadCalc(ctx, i.itemId) };
  },
});

/** Nahradí všechny řádky výkazu výměr položky (dialog ukládá celou tabulku najednou). */
export const calcReplace = defineCommand({
  name: "zakazky.budget.calc.replace",
  permission: "zakazky.budget",
  input: z.object({ itemId: uuid, lines: z.array(calcInput).max(200) }),
  handler: async (ctx, i) => {
    const versionId = await versionOf(ctx, "item", i.itemId);
    return inVersion(ctx, versionId, {}, async (c, v) => {
      const [it] = await c.db
        .select()
        .from(budgetItem)
        .where(and(eq(budgetItem.id, i.itemId), isNull(budgetItem.deletedAt)));
      if (!it) throw new NotFoundError("Položka nenalezena.");
      await c.db.delete(budgetCalcLine).where(eq(budgetCalcLine.itemId, it.id));
      if (i.lines.length)
        await c.db.insert(budgetCalcLine).values(
          i.lines.map((l, n) => ({
            itemId: it.id,
            position: n,
            variable: l.variable ? l.variable : null,
            description: l.description ?? null,
            formula: l.formula,
          })),
        );
      const r = await recalcItem(c, it);
      return {
        result: { quantity: r.quantity, lines: await loadCalc(c, it.id) },
        audit: `Rozpočet: výkaz výměr položky „${it.title}“ (${i.lines.length} řádků, ${where(v)})`,
      };
    });
  },
});

export const calcSave = defineCommand({
  name: "zakazky.budget.calc.save",
  permission: "zakazky.budget",
  input: z.object({ itemId: uuid.optional(), ...calcInput.shape }),
  handler: async (ctx, i) => {
    const versionId = i.id
      ? await versionOf(ctx, "calc", i.id)
      : i.itemId
        ? await versionOf(ctx, "item", i.itemId)
        : null;
    if (!versionId) throw new UserError("Chybí položka rozpočtu.");
    return inVersion(ctx, versionId, {}, async (c, v) => {
      let itemId = i.itemId;
      if (i.id) {
        const [cur] = await c.db.select().from(budgetCalcLine).where(eq(budgetCalcLine.id, i.id));
        if (!cur) throw new NotFoundError("Řádek výkazu nenalezen.");
        itemId = cur.itemId;
        await c.db
          .update(budgetCalcLine)
          .set({
            variable: i.variable ? i.variable : null,
            description: i.description ?? null,
            formula: i.formula,
          })
          .where(eq(budgetCalcLine.id, i.id));
      } else {
        const [n] = await c.db
          .select({ next: sql<number>`coalesce(max(${budgetCalcLine.position}), -1)::int + 1` })
          .from(budgetCalcLine)
          .where(eq(budgetCalcLine.itemId, itemId!));
        await c.db.insert(budgetCalcLine).values({
          itemId: itemId!,
          position: n?.next ?? 0,
          variable: i.variable ? i.variable : null,
          description: i.description ?? null,
          formula: i.formula,
        });
      }
      const [it] = await c.db
        .select()
        .from(budgetItem)
        .where(and(eq(budgetItem.id, itemId!), eq(budgetItem.versionId, v.id)));
      if (!it) throw new NotFoundError("Položka nenalezena.");
      const r = await recalcItem(c, it);
      return {
        result: { quantity: r.quantity, lines: await loadCalc(c, it.id) },
        audit: `Rozpočet: výkaz výměr položky „${it.title}“ (${where(v)})`,
      };
    });
  },
});

export const calcDelete = defineCommand({
  name: "zakazky.budget.calc.delete",
  permission: "zakazky.budget",
  input: z.object({ id: uuid }),
  handler: async (ctx, i) => {
    const versionId = await versionOf(ctx, "calc", i.id);
    return inVersion(ctx, versionId, {}, async (c, v) => {
      const [cur] = await c.db.select().from(budgetCalcLine).where(eq(budgetCalcLine.id, i.id));
      if (!cur) throw new NotFoundError("Řádek výkazu nenalezen.");
      await c.db.delete(budgetCalcLine).where(eq(budgetCalcLine.id, i.id));
      const [it] = await c.db.select().from(budgetItem).where(eq(budgetItem.id, cur.itemId));
      const r = await recalcItem(c, it!);
      return {
        result: { quantity: r.quantity, lines: await loadCalc(c, it!.id) },
        audit: `Rozpočet: odebrán řádek výkazu výměr položky „${it!.title}“ (${where(v)})`,
      };
    });
  },
});

export const commands = [
  budgetTree,
  versionList,
  versionCreate,
  versionSetStatus,
  versionLock,
  copyOffer,
  objectSave,
  objectDelete,
  sectionSave,
  sectionDelete,
  sectionMove,
  itemSave,
  itemDelete,
  itemMove,
  itemDuplicate,
  itemBulk,
  calcList,
  calcReplace,
  calcSave,
  calcDelete,
];
