import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import { recordAudit } from "@rebar/core/audit";
import { assertEntityAccess } from "@rebar/core/entities";
import { NotFoundError, scopeOf, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { formatMinor } from "@rebar/core/shared";
import { assertUnlocked, registerHandler, type ApprovalDecision } from "../approvals/api";
import { budgetItem, budgetSection, workStatement, workStatementLine } from "../schema";
import { JOB_STATEMENT_APPROVED, JOB_STATEMENT_REJECTED } from "../notifications";
import { notifyJobTeam } from "../team";
import { realizationVersion } from "../changes/service";
import {
  claimedOf,
  computeLine,
  fromThousandths,
  statementLabel,
  toThousandths,
  type StatementLineCalc,
} from "./calc";

export type StatementRow = typeof workStatement.$inferSelect;

/** Soupis: čtení i zápis vyžadují přístup k zakázce; peníze vidí jen `zakazky.economics`. */
export async function accessJob(ctx: Ctx, jobId: string, mode: "read" | "write") {
  await assertEntityAccess(ctx, "job", jobId, mode);
}
export const canSeeMoney = (ctx: Ctx) => !!scopeOf(ctx, "zakazky.economics");

export async function loadStatement(ctx: Ctx, id: string, opts: { lock?: boolean } = {}) {
  const q = ctx.db
    .select()
    .from(workStatement)
    .where(and(eq(workStatement.id, id), isNull(workStatement.deletedAt)));
  const [row] = await (opts.lock ? q.for("update") : q);
  if (!row) throw new NotFoundError("Soupis prací nenalezen.");
  return row;
}

export function assertEditable(s: StatementRow) {
  assertUnlocked(s, statementLabel(s.number));
  if (s.status === "submitted")
    throw new UserError(`${statementLabel(s.number)} čeká na schválení. Vraťte ho do konceptu.`);
  if (s.status === "approved")
    throw new UserError(
      `${statementLabel(s.number)} je schválený a zamčený, vraťte ho do konceptu.`,
    );
}

export type BudgetLine = {
  id: string;
  sectionId: string;
  objectId: string;
  sectionTitle: string;
  code: string | null;
  title: string;
  unit: string;
  quantity: string;
  unitPriceMinor: number;
  vatRateBp: number;
};

/** Položky realizační verze zakázky (rozpočtované množství včetně schválených změn). */
export async function budgetLines(ctx: Ctx, versionId: string): Promise<BudgetLine[]> {
  const rows = await ctx.db
    .select({
      id: budgetItem.id,
      sectionId: budgetItem.sectionId,
      objectId: budgetSection.objectId,
      sectionTitle: budgetSection.title,
      sectionPos: budgetSection.position,
      code: budgetItem.code,
      title: budgetItem.title,
      unit: budgetItem.unit,
      quantity: budgetItem.quantity,
      unitPriceMinor: budgetItem.unitPriceMinor,
      vatRateBp: budgetItem.vatRateBp,
    })
    .from(budgetItem)
    .innerJoin(budgetSection, eq(budgetItem.sectionId, budgetSection.id))
    .where(and(eq(budgetItem.versionId, versionId), isNull(budgetItem.deletedAt)))
    .orderBy(asc(budgetSection.position), asc(budgetItem.position));
  return rows.map(({ sectionPos: _p, ...r }) => r);
}

/** Provedené množství po položkách v ostatních soupisech zakázky, které čerpají rozpočet (ne zamítnuté). */
async function othersByItem(ctx: Ctx, s: StatementRow) {
  const rows = await ctx.db
    .select({
      itemId: workStatementLine.itemId,
      quantity: workStatementLine.quantityPeriod,
      number: workStatement.number,
    })
    .from(workStatementLine)
    .innerJoin(workStatement, eq(workStatement.id, workStatementLine.statementId))
    .where(
      and(
        eq(workStatement.jobId, s.jobId),
        ne(workStatement.id, s.id),
        ne(workStatement.status, "rejected"),
        isNull(workStatement.deletedAt),
      ),
    );
  const previous = new Map<string, number>();
  const others = new Map<string, number>();
  for (const r of rows) {
    const q = toThousandths(r.quantity);
    others.set(r.itemId, (others.get(r.itemId) ?? 0) + q);
    if (r.number < s.number) previous.set(r.itemId, (previous.get(r.itemId) ?? 0) + q);
  }
  return { previous, others };
}

export type ComputedLine = {
  id: string;
  itemId: string;
  position: number;
  code: string | null;
  title: string;
  sectionTitle: string;
  unit: string;
  budgetQuantity: string;
  previousQuantity: string;
  quantityPeriod: string;
  unitPriceMinor: number;
  vatRateBp: number;
} & StatementLineCalc;

/**
 * Řádky soupisu s dopočtem (kumulativně, procenta, částky). Zamčený soupis ukazuje uložené hodnoty z doby schválení,
 * rozpracovaný se počítá živě podle aktuálního rozpočtu a ostatních soupisů.
 */
export async function computedLines(ctx: Ctx, s: StatementRow): Promise<ComputedLine[]> {
  const lines = await ctx.db
    .select()
    .from(workStatementLine)
    .where(eq(workStatementLine.statementId, s.id))
    .orderBy(asc(workStatementLine.position));
  if (!lines.length) return [];
  const version = await realizationVersion(ctx.db, s.jobId);
  const budget = version ? await budgetLines(ctx, version.id) : [];
  const { previous, others } = await othersByItem(ctx, s);
  return lines.map((l) => {
    const b = budget.find((x) => x.id === l.itemId);
    const budgetQuantity = b?.quantity ?? "0";
    const unitPriceMinor = b?.unitPriceMinor ?? 0;
    const common = {
      id: l.id,
      itemId: l.itemId,
      position: l.position,
      code: b?.code ?? null,
      title: b?.title ?? "Položka už v rozpočtu není",
      sectionTitle: b?.sectionTitle ?? "",
      unit: b?.unit ?? "",
      budgetQuantity,
      quantityPeriod: l.quantityPeriod,
      unitPriceMinor,
      vatRateBp: b?.vatRateBp ?? 2100,
    };
    if (s.lockedAt) {
      const total = toThousandths(l.quantityTotal);
      const budgetT = toThousandths(budgetQuantity);
      return {
        ...common,
        previousQuantity: fromThousandths(total - toThousandths(l.quantityPeriod)),
        quantityTotal: l.quantityTotal,
        percent: budgetT > 0 ? Math.round((total / budgetT) * 1000) / 10 : 0,
        remainingQuantity: "0",
        amountPeriodMinor: l.amountPeriodMinor,
        amountTotalMinor: l.amountTotalMinor,
        over: false,
      };
    }
    const prev = fromThousandths(previous.get(l.itemId) ?? 0);
    const calc = computeLine({
      budgetQuantity,
      previousQuantity: prev,
      othersQuantity: fromThousandths(others.get(l.itemId) ?? 0),
      periodQuantity: l.quantityPeriod,
      unitPriceMinor,
    });
    return { ...common, previousQuantity: prev, ...calc };
  });
}

/** Uloží dopočtené hodnoty řádků a nárokovanou částku soupisu; vrací nárokovanou částku. */
export async function persistComputed(ctx: Ctx, s: StatementRow): Promise<number> {
  const lines = await computedLines(ctx, s);
  for (const l of lines)
    await ctx.db
      .update(workStatementLine)
      .set({
        quantityTotal: l.quantityTotal,
        amountPeriodMinor: l.amountPeriodMinor,
        amountTotalMinor: l.amountTotalMinor,
      })
      .where(eq(workStatementLine.id, l.id));
  const claimed = claimedOf(lines);
  await ctx.db
    .update(workStatement)
    .set({ claimedMinor: claimed, updatedBy: ctx.actor.userId })
    .where(eq(workStatement.id, s.id));
  return claimed;
}

/** Ověří, že žádný řádek nepřekračuje rozpočet; jinak česká věta. */
export function assertWithinBudget(lines: readonly ComputedLine[]) {
  for (const l of lines)
    if (l.over)
      throw new UserError(
        `Položka „${l.title}“: provedené množství přesahuje rozpočet (zbývá ${Number(l.remainingQuantity).toLocaleString("cs-CZ", { maximumFractionDigits: 3 })} ${l.unit}). Nejdřív zadejte změnu rozpočtu.`,
      );
}

export async function onDecision(ctx: Ctx, d: ApprovalDecision) {
  const s = await loadStatement(ctx, d.docId, { lock: true });
  if (s.status === "approved" || s.status === "rejected") return;
  if (!d.approved) {
    await ctx.db
      .update(workStatement)
      .set({
        status: "rejected",
        approvedMinor: 0,
        decidedAt: new Date(),
        decidedBy: d.decidedBy,
        updatedBy: ctx.actor.userId,
      })
      .where(eq(workStatement.id, s.id));
    await notifyJobTeam(ctx.db, s.jobId, ctx.actor.userId, JOB_STATEMENT_REJECTED, {
      statement: statementLabel(s.number).toLowerCase(),
      comment: d.comment,
    });
    return;
  }
  await persistComputed(ctx, s);
  const [fresh] = await ctx.db.select().from(workStatement).where(eq(workStatement.id, s.id));
  const approved =
    fresh!.approvedMinor > 0
      ? Math.min(fresh!.approvedMinor, fresh!.claimedMinor)
      : fresh!.claimedMinor;
  await ctx.db
    .update(workStatement)
    .set({
      status: "approved",
      approvedMinor: approved,
      decidedAt: new Date(),
      decidedBy: d.decidedBy,
      lockedAt: new Date(),
      updatedBy: ctx.actor.userId,
    })
    .where(eq(workStatement.id, s.id));
  await recordAudit(ctx, {
    action: "update",
    entityType: "job",
    entityId: s.jobId,
    summary: `${statementLabel(s.number)}: schváleno a zamčeno (${formatMinor(approved)} z nárokovaných ${formatMinor(fresh!.claimedMinor)})`,
  });
  // kdo fakturuje (`fakturace.write`), je příjemcem podle pravidel události
  await notifyJobTeam(ctx.db, s.jobId, ctx.actor.userId, JOB_STATEMENT_APPROVED, {
    statement: statementLabel(s.number).toLowerCase(),
    amount: formatMinor(approved),
  });
}

export async function onReopen(ctx: Ctx, d: { docId: string; jobId: string | null }) {
  const s = await loadStatement(ctx, d.docId, { lock: true });
  if (s.invoiceId)
    throw new UserError(
      `${statementLabel(s.number)}: ze soupisu už je vystavená faktura, vrátit ho nejde. Fakturu nejdřív stornujte dobropisem.`,
    );
  await ctx.db
    .update(workStatement)
    .set({
      status: "draft",
      approvedMinor: 0,
      lockedAt: null,
      decidedAt: null,
      decidedBy: null,
      updatedBy: ctx.actor.userId,
    })
    .where(eq(workStatement.id, s.id));
}

export async function describe(ctx: Ctx, ids: string[]) {
  if (!ids.length) return {};
  const rows = await ctx.db
    .select({
      id: workStatement.id,
      number: workStatement.number,
      from: workStatement.periodFrom,
      to: workStatement.periodTo,
    })
    .from(workStatement)
    .where(inArray(workStatement.id, ids));
  return Object.fromEntries(
    rows.map((r) => [r.id, { label: `${statementLabel(r.number)} (${r.from} – ${r.to})` }]),
  );
}

export function registerStatementHandler() {
  registerHandler("statement", { onDecision, onReopen, describe });
}
