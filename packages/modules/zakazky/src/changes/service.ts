import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { recordAudit } from "@rebar/core/audit";
import { schema } from "@rebar/core/db";
import { assertEntityAccess } from "@rebar/core/entities";
import { NotFoundError, PermissionError, scopeOf, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { formatMinor } from "@rebar/core/shared";
import { todayIso } from "@rebar/core/time";
import { assertUnlocked, registerHandler, type ApprovalDecision } from "../approvals/api";
import { budgetItem, budgetSection, budgetVersion, jobChange, jobChangeLine } from "../schema";
import { JOB_CHANGE_APPROVED, JOB_CHANGE_REJECTED } from "../notifications";
import { notifyJobTeam } from "../team";
import { applyChangeLines, recomputeJobSummary, revertChangeLines } from "./adapters";
import { changeLabel, lineImpact, rebaseLine, sumImpacts, type ChangeLineKind } from "./calc";

export type ChangeRow = typeof jobChange.$inferSelect;
export type ChangeLineRow = typeof jobChangeLine.$inferSelect;

/** Čtení i zápis změn jsou ekonomika zakázky (částky): přístup k zakázce a `zakazky.economics` (nebo `zakazky.budget`). */
export async function accessJob(ctx: Ctx, jobId: string, mode: "read" | "write") {
  await assertEntityAccess(ctx, "job", jobId, mode);
  if (!scopeOf(ctx, "zakazky.economics") && !scopeOf(ctx, "zakazky.budget"))
    throw new PermissionError();
}

export async function loadChange(ctx: Ctx, id: string, opts: { lock?: boolean } = {}) {
  const q = ctx.db
    .select()
    .from(jobChange)
    .where(and(eq(jobChange.id, id), isNull(jobChange.deletedAt)));
  const [row] = await (opts.lock ? q.for("update") : q);
  if (!row) throw new NotFoundError("Změna nenalezena.");
  return row;
}

export const labelOf = (c: Pick<ChangeRow, "number" | "amountMinor">) =>
  changeLabel(c.number, c.amountMinor);

/** Změnu jde upravovat jen v konceptu nebo po zamítnutí a jen nezamčenou. */
export function assertEditable(c: ChangeRow) {
  assertUnlocked(c, labelOf(c));
  if (c.status === "sent")
    throw new UserError(`${labelOf(c)}: změna čeká na schválení. Vraťte ji do konceptu.`);
  if (c.status === "approved")
    throw new UserError(`${labelOf(c)}: schválenou změnu nejde měnit, vraťte ji do konceptu.`);
}

/** Aktuální realizační verze rozpočtu zakázky (nejvyšší číslo), nebo `null`, když ještě není. */
export async function realizationVersion(db: Ctx["db"], jobId: string) {
  const [v] = await db
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
  return v ?? null;
}

export type BudgetItemInfo = {
  id: string;
  sectionId: string;
  sectionTitle: string;
  code: string | null;
  title: string;
  kind: string;
  unit: string;
  quantity: string;
  unitCostMinor: number;
  unitPriceMinor: number;
  vatRateBp: number;
};

/** Položky realizační verze (pro výběr v editoru změny a přebázování řádků). */
export async function realizationItems(
  db: Ctx["db"],
  versionId: string,
): Promise<BudgetItemInfo[]> {
  const rows = await db
    .select({
      id: budgetItem.id,
      sectionId: budgetItem.sectionId,
      sectionTitle: budgetSection.title,
      sectionPos: budgetSection.position,
      code: budgetItem.code,
      title: budgetItem.title,
      kind: budgetItem.kind,
      unit: budgetItem.unit,
      quantity: budgetItem.quantity,
      unitCostMinor: budgetItem.unitCostMinor,
      unitPriceMinor: budgetItem.unitPriceMinor,
      vatRateBp: budgetItem.vatRateBp,
    })
    .from(budgetItem)
    .innerJoin(budgetSection, eq(budgetItem.sectionId, budgetSection.id))
    .where(and(eq(budgetItem.versionId, versionId), isNull(budgetItem.deletedAt)))
    .orderBy(asc(budgetSection.position), asc(budgetItem.position));
  return rows.map(({ sectionPos: _p, ...r }) => r);
}

export async function realizationSections(db: Ctx["db"], versionId: string) {
  return db
    .select({ id: budgetSection.id, title: budgetSection.title, code: budgetSection.code })
    .from(budgetSection)
    .where(and(eq(budgetSection.versionId, versionId), isNull(budgetSection.deletedAt)))
    .orderBy(asc(budgetSection.position));
}

export async function changeLines(db: Ctx["db"], changeId: string) {
  return db
    .select()
    .from(jobChangeLine)
    .where(eq(jobChangeLine.changeId, changeId))
    .orderBy(asc(jobChangeLine.position));
}

/** Přepočítá částku změny (součet dopadů řádků) a dopad na náklad. */
export async function refreshTotals(ctx: Ctx, changeId: string) {
  const lines = await changeLines(ctx.db, changeId);
  const t = sumImpacts(lines);
  await ctx.db
    .update(jobChange)
    .set({ amountMinor: t.priceMinor, costImpactMinor: t.costMinor, updatedBy: ctx.actor.userId })
    .where(eq(jobChange.id, changeId));
  return t;
}

/**
 * Srovná řádky `qty`/`remove` s aktuálními položkami rozpočtu (jiná schválená změna mohla množství posunout):
 * zachová zamýšlený rozdíl, přepočte dopady a součet změny.
 */
export async function rebaseChange(ctx: Ctx, change: ChangeRow) {
  const lines = await changeLines(ctx.db, change.id);
  const version = await realizationVersion(ctx.db, change.jobId);
  const items = version ? await realizationItems(ctx.db, version.id) : [];
  for (const l of lines) {
    if (l.kind === "add") continue;
    const item = items.find((i) => i.id === l.itemId);
    if (!item)
      throw new UserError(
        `Položka „${l.title}“ už v rozpočtu realizace není. Upravte nebo odeberte řádek změny.`,
      );
    const next = rebaseLine(
      {
        kind: l.kind as ChangeLineKind,
        quantityBefore: l.quantityBefore,
        quantityAfter: l.quantityAfter,
        unitCostMinor: item.unitCostMinor,
        unitPriceMinor: item.unitPriceMinor,
      },
      item.quantity,
    );
    const impact = lineImpact(next);
    await ctx.db
      .update(jobChangeLine)
      .set({
        quantityBefore: next.quantityBefore,
        quantityAfter: next.quantityAfter,
        unitCostMinor: next.unitCostMinor,
        unitPriceMinor: next.unitPriceMinor,
        ...impact,
      })
      .where(eq(jobChangeLine.id, l.id));
  }
  return refreshTotals(ctx, change.id);
}

async function userName(ctx: Ctx, id: string | null): Promise<string | null> {
  if (!id) return null;
  const [u] = await ctx.db
    .select({ name: schema.user.name })
    .from(schema.user)
    .where(eq(schema.user.id, id));
  return u?.name ?? null;
}

/** Rozhodnutí o změně: schválení ji propíše do rozpočtu a zamkne, zamítnutí ji nechá upravit. */
export async function onDecision(ctx: Ctx, d: ApprovalDecision) {
  const change = await loadChange(ctx, d.docId, { lock: true });
  if (change.status === "approved" || change.status === "rejected") return;
  const by = d.automatic ? "automaticky" : await userName(ctx, d.decidedBy);
  if (!d.approved) {
    await ctx.db
      .update(jobChange)
      .set({
        status: "rejected",
        decidedAt: todayIso(),
        decidedBy: by,
        updatedBy: ctx.actor.userId,
      })
      .where(eq(jobChange.id, change.id));
    await notifyJobTeam(
      ctx.db,
      change.jobId,
      ctx.actor.userId,
      JOB_CHANGE_REJECTED,
      { label: labelOf(change), changeTitle: change.title, comment: d.comment },
      { url: `/zakazky/${change.jobId}?tab=zmeny&change=${change.id}` },
    );
    return;
  }
  const totals = await rebaseChange(ctx, change);
  const applied = await applyChangeLines(ctx, change.id);
  await ctx.db
    .update(jobChange)
    .set({
      status: "approved",
      decidedAt: todayIso(),
      decidedBy: by,
      lockedAt: new Date(),
      appliedAt: applied ? new Date() : null,
      updatedBy: ctx.actor.userId,
    })
    .where(eq(jobChange.id, change.id));
  await recomputeJobSummary(ctx, change.jobId);
  const label = changeLabel(change.number, totals.priceMinor);
  await recordAudit(ctx, {
    action: "update",
    entityType: "job",
    entityId: change.jobId,
    summary: `${label} ${change.title}: schváleno a zamčeno${applied ? ", propsáno do rozpočtu" : ""} (${totals.priceMinor > 0 ? "+" : ""}${formatMinor(totals.priceMinor)})`,
  });
  // kdo fakturuje (`fakturace.write`), ví, že má co doúčtovat: je příjemcem podle pravidel události
  await notifyJobTeam(
    ctx.db,
    change.jobId,
    ctx.actor.userId,
    JOB_CHANGE_APPROVED,
    {
      kind: totals.priceMinor < 0 ? "méněpráce" : "vícepráce",
      label,
      changeTitle: change.title,
      amount: `${totals.priceMinor > 0 ? "+" : ""}${formatMinor(totals.priceMinor)}`,
    },
    { url: `/zakazky/${change.jobId}?tab=zmeny&change=${change.id}` },
  );
}

/** Vrácení do konceptu: odemkne změnu, případně vrátí propsané řádky v rozpočtu. */
export async function onReopen(ctx: Ctx, d: { docId: string; jobId: string | null }) {
  const change = await loadChange(ctx, d.docId, { lock: true });
  if (change.appliedAt) {
    const reverted = await revertChangeLines(ctx, change.id);
    if (!reverted)
      throw new UserError(
        "Schválenou změnu, která je propsaná v rozpočtu, zatím nejde vrátit do konceptu.",
      );
  }
  await ctx.db
    .update(jobChange)
    .set({
      status: "draft",
      lockedAt: null,
      appliedAt: null,
      decidedAt: null,
      decidedBy: null,
      updatedBy: ctx.actor.userId,
    })
    .where(eq(jobChange.id, change.id));
  await recomputeJobSummary(ctx, change.jobId);
}

export async function describe(ctx: Ctx, ids: string[]) {
  if (!ids.length) return {};
  const rows = await ctx.db
    .select({
      id: jobChange.id,
      number: jobChange.number,
      amount: jobChange.amountMinor,
      title: jobChange.title,
    })
    .from(jobChange)
    .where(inArray(jobChange.id, ids));
  return Object.fromEntries(
    rows.map((r) => [r.id, { label: `${changeLabel(r.number, r.amount)} ${r.title}` }]),
  );
}

/** Registrace handleru schvalování (při načtení modulu). */
export function registerChangeHandler() {
  registerHandler("change", { onDecision, onReopen, describe });
}
