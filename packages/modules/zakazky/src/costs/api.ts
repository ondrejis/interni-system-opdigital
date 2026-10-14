/**
 * Veřejné rozhraní oblasti „costs“ pro ostatní oblasti a moduly (serverový kód, funkce s `ctx`).
 * Ostatní se na oblast odkazují jen přes `costsApi` z `@rebar/zakazky/server`, ne přes cesty do složky.
 *
 * Funkce samy oprávnění nekontrolují (to dělá volající příkaz); běží v transakci volajícího.
 *  - `recomputeJobSummary(ctx, jobId)`: přepočte `job.sum_*`; volají ho všichni, kdo mění peníze zakázky, jako poslední krok.
 *  - `listJobCosts`: jeden seznam všech nákladů (ruční, přijaté faktury, docházka, sklad, stroje, deník) s párováním.
 *  - `createManualCost` / `deleteManualCostsBySource`: náklady vzniklé v jiné oblasti (deník).
 *  - `planVsActual`: strom objekt → oddíl s plánem, skutečností, závazky a čerpáním.
 */
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { recordAudit } from "@rebar/core/audit";
import { getJobFinanceProviders, type CostLine, type ModuleDeps } from "@rebar/core/module-server";
import { inTx, SYSTEM_ACTOR, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { formatMinor } from "@rebar/core/shared";
import { todayIso } from "@rebar/core/time";
import { company } from "@rebar/kontakty/schema";
import { versionTotals } from "../budget/math";
import {
  budgetItem,
  budgetObject,
  budgetSection,
  budgetVersion,
  costAllocation,
  job,
  jobChange,
  jobCost,
  jobOrder,
} from "../schema";
import {
  allocationState,
  normalizeParts,
  suggestSection,
  validateParts,
  type Allocation,
  type CostOut,
} from "./model";
import { runJobChangeHooks } from "../lifecycle/change-hooks";
import { listPriceMinor } from "../lifecycle/phases";
import { buildPlan, openCommitmentMinor, type PlanResult } from "./plan";
import { computeHealth, computeSummary, type JobSummary } from "./summary";

export type { CostOut } from "./model";
export type { PlanResult } from "./plan";
export type { JobSummary } from "./summary";

const lockJob = (ctx: Ctx, jobId: string) =>
  ctx.db.execute(sql`select pg_advisory_xact_lock(hashtext(${`jobcost:${jobId}`}))`);

/* ---------- rozpočet: aktuální verze a oddíly ---------- */

export type BudgetSnapshot = {
  versionId: string | null;
  objects: {
    id: string;
    code: string | null;
    title: string;
    isDefault: boolean;
    position: number;
  }[];
  sections: {
    id: string;
    objectId: string;
    parentId: string | null;
    code: string | null;
    title: string;
    position: number;
    costCategory: string | null;
  }[];
  items: { id: string; sectionId: string; code: string | null; title: string; position: number }[];
  own: Record<
    string,
    { sellMinor: number; costMinor: number; originalSellMinor: number; originalCostMinor: number }
  >;
  sellMinor: number;
  costMinor: number;
  originalSellMinor: number;
  originalCostMinor: number;
};

/**
 * Aktuální rozpočet zakázky: poslední realizační verze, jinak poslední nabídka (stejné pravidlo jako
 * `budgetApi.getBudgetTotals`). Čte tabulky rozpočtu přímo (jsou ve stejném modulu).
 */
export async function loadBudget(ctx: Ctx, jobId: string): Promise<BudgetSnapshot> {
  const versions = await ctx.db
    .select({ id: budgetVersion.id, kind: budgetVersion.kind, number: budgetVersion.number })
    .from(budgetVersion)
    .where(and(eq(budgetVersion.jobId, jobId), isNull(budgetVersion.deletedAt)));
  const cur =
    versions.filter((v) => v.kind === "realization").sort((a, b) => b.number - a.number)[0] ??
    versions.filter((v) => v.kind === "offer").sort((a, b) => b.number - a.number)[0];
  if (!cur)
    return {
      versionId: null,
      objects: [],
      sections: [],
      items: [],
      own: {},
      sellMinor: 0,
      costMinor: 0,
      originalSellMinor: 0,
      originalCostMinor: 0,
    };
  const [objects, sections, items] = await Promise.all([
    ctx.db
      .select()
      .from(budgetObject)
      .where(and(eq(budgetObject.versionId, cur.id), isNull(budgetObject.deletedAt)))
      .orderBy(asc(budgetObject.position)),
    ctx.db
      .select()
      .from(budgetSection)
      .where(and(eq(budgetSection.versionId, cur.id), isNull(budgetSection.deletedAt)))
      .orderBy(asc(budgetSection.position)),
    ctx.db
      .select()
      .from(budgetItem)
      .where(and(eq(budgetItem.versionId, cur.id), isNull(budgetItem.deletedAt)))
      .orderBy(asc(budgetItem.position)),
  ]);
  const totals = versionTotals(
    sections,
    items.map((i) => ({
      sectionId: i.sectionId,
      quantity: i.quantity,
      unitCostMinor: i.unitCostMinor,
      unitPriceMinor: i.unitPriceMinor,
      originalQuantity: i.originalQuantity,
      originalUnitCostMinor: i.originalUnitCostMinor,
      originalUnitPriceMinor: i.originalUnitPriceMinor,
    })),
  );
  return {
    versionId: cur.id,
    objects: objects.map((o) => ({
      id: o.id,
      code: o.code,
      title: o.title,
      isDefault: o.isDefault,
      position: o.position,
    })),
    sections: sections.map((s) => ({
      id: s.id,
      objectId: s.objectId,
      parentId: s.parentId,
      code: s.code,
      title: s.title,
      position: s.position,
      costCategory: s.costCategory,
    })),
    items: items.map((i) => ({
      id: i.id,
      sectionId: i.sectionId,
      code: i.code,
      title: i.title,
      position: i.position,
    })),
    own: totals.bySection,
    sellMinor: totals.sellMinor,
    costMinor: totals.costMinor,
    originalSellMinor: totals.originalSellMinor,
    originalCostMinor: totals.originalCostMinor,
  };
}

/* ---------- všechny náklady zakázky ---------- */

type RawLine = {
  source: string;
  ref: string;
  /** Zdroj, ze kterého se řádek zobrazuje (ruční náklad z deníku má `diary`). */
  displaySource: string;
  id: string | null;
  date: string | null;
  category: string;
  label: string;
  supplier: string | null;
  amountMinor: number;
  href: string | null;
  orderId: string | null;
  ownSectionId: string | null;
  ownItemId: string | null;
  editable: boolean;
};

async function providerLines(
  ctx: Ctx,
  jobId: string,
  deps: ModuleDeps | undefined,
): Promise<RawLine[]> {
  const providers = deps?.costProviders ?? getJobFinanceProviders().costProviders;
  // Ekonomiku zakázky hlídá zakázka (zakazky.economics, ověřuje volající), poskytovatelé proto čtou jako systém.
  // Jinak by souhrn závisel na tom, kdo ho zrovna přepočítává (např. uživatel bez práva na docházku).
  const sys: Ctx = { ...ctx, actor: SYSTEM_ACTOR };
  const settled = await Promise.allSettled(
    providers.map((p) => p.costs(sys, jobId, deps as ModuleDeps)),
  );
  const out: RawLine[] = [];
  for (const r of settled) {
    if (r.status !== "fulfilled") continue;
    for (const l of r.value as CostLine[]) {
      out.push({
        source: l.source,
        // řádek bez stabilního id (starší poskytovatel) jde párovat jen přes kategorii a popisek
        ref: l.ref ?? `${l.category}:${l.label}`,
        displaySource: l.source,
        id: null,
        date: l.date ?? null,
        category: l.category,
        label: l.label,
        supplier: l.supplier ?? null,
        amountMinor: l.amountMinor,
        href: l.href ?? null,
        orderId: l.orderId ?? null,
        ownSectionId: l.sectionId ?? null,
        ownItemId: l.itemId ?? null,
        editable: false,
      });
    }
  }
  return out;
}

async function manualLines(ctx: Ctx, jobId: string): Promise<RawLine[]> {
  const rows = await ctx.db
    .select({ c: jobCost, supplier: company.name })
    .from(jobCost)
    .leftJoin(company, eq(company.id, jobCost.supplierId))
    .where(and(eq(jobCost.jobId, jobId), isNull(jobCost.deletedAt)));
  return rows.map(({ c, supplier }) => ({
    source: "manual",
    ref: c.id,
    displaySource: c.source ?? "manual",
    id: c.id,
    date: c.date,
    category: c.category,
    label: c.title,
    supplier: c.supplierName ?? supplier ?? null,
    amountMinor: c.amountMinor,
    href: null,
    orderId: c.orderId,
    ownSectionId: c.sectionId,
    ownItemId: c.itemId,
    editable: c.source === null,
  }));
}

const keyOf = (source: string, ref: string) => `${source}:${ref}`;

export type CostFilters = {
  source?: string | undefined;
  category?: string | undefined;
  sectionId?: string | undefined;
  status?: "paired" | "unpaired" | undefined;
  q?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
};

/** Všechny náklady zakázky se stavem párování vůči aktuálnímu rozpočtu (bez filtrů). */
export async function loadCosts(
  ctx: Ctx,
  jobId: string,
  deps?: ModuleDeps,
  budget?: BudgetSnapshot,
): Promise<{ rows: CostOut[]; budget: BudgetSnapshot }> {
  const bud = budget ?? (await loadBudget(ctx, jobId));
  const [provided, manual, allocs] = await Promise.all([
    providerLines(ctx, jobId, deps),
    manualLines(ctx, jobId),
    ctx.db
      .select()
      .from(costAllocation)
      .where(and(eq(costAllocation.jobId, jobId), isNull(costAllocation.deletedAt))),
  ]);
  const valid = new Set(bud.sections.map((s) => s.id));
  const byKey = new Map<string, Allocation[]>();
  for (const a of allocs) {
    if (!valid.has(a.sectionId)) continue; // oddíl jiné (starší) verze rozpočtu = nespárováno
    const k = keyOf(a.source, a.sourceRef);
    (byKey.get(k) ?? byKey.set(k, []).get(k)!).push({
      sectionId: a.sectionId,
      itemId: a.itemId,
      amountMinor: a.amountMinor,
    });
  }
  const rows = [...provided, ...manual].map((l): CostOut => {
    let allocations = byKey.get(keyOf(l.source, l.ref));
    if (!allocations && l.ownSectionId && valid.has(l.ownSectionId))
      allocations = [{ sectionId: l.ownSectionId, itemId: l.ownItemId, amountMinor: null }];
    allocations ??= [];
    const st = allocationState(l.amountMinor, allocations);
    return {
      key: keyOf(l.source, l.ref),
      allocSource: l.source,
      source: l.displaySource,
      ref: l.ref,
      id: l.id,
      date: l.date,
      category: l.category,
      label: l.label,
      supplier: l.supplier,
      amountMinor: l.amountMinor,
      href: l.href,
      orderId: l.orderId,
      allocations,
      status: st.status,
      remainingMinor: st.remainingMinor,
      editable: l.editable,
    };
  });
  return { rows, budget: bud };
}

export function filterCosts(rows: readonly CostOut[], f: CostFilters): CostOut[] {
  const q = f.q?.trim().toLowerCase();
  return rows
    .filter((r) => {
      if (f.source && r.source !== f.source) return false;
      if (f.category && r.category !== f.category) return false;
      if (f.sectionId && !r.allocations.some((a) => a.sectionId === f.sectionId)) return false;
      if (f.status === "paired" && r.status !== "paired") return false;
      if (f.status === "unpaired" && r.status === "paired") return false;
      if (f.from && (!r.date || r.date < f.from)) return false;
      if (f.to && (!r.date || r.date > f.to)) return false;
      if (q && !`${r.label} ${r.supplier ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    })
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || a.label.localeCompare(b.label));
}

/** Oddíly (s cestou ve stromu) a položky aktuálního rozpočtu pro výběr při párování nákladu nebo řádku faktury. */
export function budgetTargets(budget: BudgetSnapshot) {
  const label = new Map(budget.objects.map((o) => [o.id, o]));
  const secById = new Map(budget.sections.map((s) => [s.id, s]));
  const pathOf = (id: string): string => {
    const names: string[] = [];
    const seen = new Set<string>();
    for (
      let s = secById.get(id);
      s && !seen.has(s.id);
      s = s.parentId ? secById.get(s.parentId) : undefined
    ) {
      seen.add(s.id);
      names.unshift(`${s.code ? `${s.code} ` : ""}${s.title}`);
    }
    return names.join(" › ");
  };
  const multiObjects = budget.objects.some((o) => !o.isDefault);
  return {
    hasBudget: !!budget.versionId,
    sections: budget.sections.map((s) => {
      const o = label.get(s.objectId);
      return {
        id: s.id,
        label: `${multiObjects && o ? `${o.code ? `${o.code} ` : ""}${o.title} › ` : ""}${pathOf(s.id)}`,
        costCategory: s.costCategory,
      };
    }),
    items: budget.items.map((i) => ({
      id: i.id,
      sectionId: i.sectionId,
      label: `${i.code ? `${i.code} ` : ""}${i.title}`,
    })),
  };
}

/** Sjednocený pohled na náklady zakázky (plus oddíly a položky pro výběr při párování). */
export async function listJobCosts(
  ctx: Ctx,
  jobId: string,
  filters: CostFilters = {},
  deps?: ModuleDeps,
) {
  const { rows, budget } = await loadCosts(ctx, jobId, deps);
  const targets = budgetTargets(budget);
  const all = rows;
  const visible = filterCosts(rows, filters);
  const sum = (list: readonly CostOut[]) => list.reduce((a, r) => a + r.amountMinor, 0);
  return {
    rows: visible,
    sections: targets.sections,
    items: targets.items,
    totalMinor: sum(visible),
    allMinor: sum(all),
    unpairedCount: all.filter((r) => r.status !== "paired").length,
    unpairedMinor: all.reduce((a, r) => a + (r.status === "paired" ? 0 : r.remainingMinor), 0),
    hasBudget: targets.hasBudget,
  };
}

/* ---------- souhrn zakázky ---------- */

async function invoicing(ctx: Ctx, jobId: string) {
  const out = { invoicedMinor: 0, paidMinor: 0 };
  for (const p of getJobFinanceProviders().invoicing) {
    try {
      const r = await p(ctx, jobId);
      out.invoicedMinor += r.invoicedMinor;
      out.paidMinor += r.paidMinor;
    } catch {
      // fakturace nemá zablokovat souhrn zakázky
    }
  }
  return out;
}

/** Spočítá souhrn zakázky (bez zápisu). */
export async function computeJobSummary(
  ctx: Ctx,
  jobId: string,
  deps?: ModuleDeps,
): Promise<JobSummary & { sectionsMissing: boolean; budgetSellMinor: number; phase: string }> {
  const [j] = await ctx.db
    .select({
      valueMinor: job.valueMinor,
      phase: job.phase,
      endDate: job.endDate,
    })
    .from(job)
    .where(and(eq(job.id, jobId), isNull(job.deletedAt)));
  if (!j) throw new UserError("Zakázka nenalezena.");
  const [changes] = await ctx.db
    .select({ s: sql<number>`coalesce(sum(${jobChange.amountMinor}), 0)::float` })
    .from(jobChange)
    .where(
      and(
        eq(jobChange.jobId, jobId),
        eq(jobChange.status, "approved"),
        isNull(jobChange.deletedAt),
      ),
    );
  const { rows, budget } = await loadCosts(ctx, jobId, deps);
  const inv = await invoicing(ctx, jobId);
  const base = computeSummary({
    valueMinor: j.valueMinor,
    approvedChangesMinor: Math.round(changes?.s ?? 0),
    plannedCostMinor: budget.costMinor,
    costMinor: rows.reduce((a, r) => a + r.amountMinor, 0),
    invoicedMinor: inv.invoicedMinor,
    paidMinor: inv.paidMinor,
    unpairedCount: rows.filter((r) => r.status !== "paired").length,
  });
  const health = computeHealth({
    phase: j.phase,
    costMinor: base.costMinor,
    marginMinor: base.marginMinor,
    marginPct: base.marginPct,
    plannedMarginPct: base.plannedMarginPct,
    drawdownPct: base.drawdownPct,
    endDate: j.endDate,
    today: todayIso(),
  });
  return {
    ...base,
    health,
    sectionsMissing: !budget.versionId,
    budgetSellMinor: budget.sellMinor,
    phase: j.phase,
  };
}

const num1 = (n: number | null) => (n === null ? null : n.toFixed(1));

/**
 * Přepočte `job.sum_*` ze živých dat. Levné a idempotentní; volá se jako poslední krok každé změny peněz zakázky
 * (rozpočet, změny, náklady, faktury). Poskytovatele nákladů bere z registru zapnutých modulů (nebo z `deps`).
 */
export async function recomputeJobSummary(
  ctx: Ctx,
  jobId: string,
  deps?: ModuleDeps,
): Promise<JobSummary> {
  const full = await computeJobSummary(ctx, jobId, deps);
  const { phase, ...s } = full;
  // sloupec seznamu: v poptávce a nabídce cena nabídky (shodně s hlavičkou), jinak smluvní cena
  const listContract = listPriceMinor(phase, s.contractMinor, s.budgetSellMinor);
  const [cur] = await ctx.db
    .select({
      c: job.sumContractMinor,
      p: job.sumPlannedCostMinor,
      k: job.sumCostMinor,
      i: job.sumInvoicedMinor,
      d: job.sumPaidMinor,
      m: job.sumMarginPct,
      r: job.sumDrawdownPct,
      h: job.sumHealth,
      u: job.sumUnpairedCount,
      at: job.sumAt,
    })
    .from(job)
    .where(eq(job.id, jobId));
  const same =
    !!cur?.at &&
    cur.c === listContract &&
    cur.p === s.plannedCostMinor &&
    cur.k === s.costMinor &&
    cur.i === s.invoicedMinor &&
    cur.d === s.paidMinor &&
    cur.m === num1(s.marginPct) &&
    cur.r === num1(s.drawdownPct) &&
    cur.h === s.health &&
    cur.u === s.unpairedCount;
  if (!same)
    await ctx.db
      .update(job)
      .set({
        sumContractMinor: listContract,
        sumPlannedCostMinor: s.plannedCostMinor,
        sumCostMinor: s.costMinor,
        sumInvoicedMinor: s.invoicedMinor,
        sumPaidMinor: s.paidMinor,
        sumMarginPct: num1(s.marginPct),
        sumDrawdownPct: num1(s.drawdownPct),
        sumHealth: s.health,
        sumUnpairedCount: s.unpairedCount,
        sumAt: new Date(),
        // odvozená čísla nejsou úprava záznamu: bez tohoto by otevření detailu posunulo `updated_at` a první
        // úprava, kterou uživatel hned udělá, by skončila hláškou „Záznam mezitím někdo změnil“
        updatedAt: sql`${job.updatedAt}`,
      })
      .where(eq(job.id, jobId));
  // změna ceny zakázky mění její váženou hodnotu v CRM (hooky `afterChange`, např. přepočet `crm_weighted_minor`)
  if (cur && cur.c !== listContract)
    await runJobChangeHooks(
      ctx,
      { id: jobId, sumContractMinor: cur.c },
      { id: jobId, sumContractMinor: listContract },
    );
  const { sectionsMissing: _m, ...out } = s;
  return out;
}

/* ---------- plán vs skutečnost ---------- */

export async function planVsActual(
  ctx: Ctx,
  jobId: string,
  deps?: ModuleDeps,
): Promise<PlanResult & { versionId: string | null; unpairedCount: number }> {
  const { rows, budget } = await loadCosts(ctx, jobId, deps);
  const actualBySection: Record<string, number> = {};
  let unpaired = 0;
  let unpairedCount = 0;
  for (const r of rows) {
    const full = r.allocations.some((a) => a.amountMinor === null);
    for (const a of r.allocations) {
      const amount = full ? r.amountMinor : (a.amountMinor ?? 0);
      actualBySection[a.sectionId] = (actualBySection[a.sectionId] ?? 0) + amount;
    }
    if (r.status !== "paired") {
      unpaired += r.remainingMinor;
      unpairedCount++;
    }
  }
  // závazky: schválené (a přijaté) objednávky minus náklady, které se k nim už vážou
  const orders = await ctx.db
    .select({
      id: jobOrder.id,
      sectionId: jobOrder.sectionId,
      total: jobOrder.totalMinor,
    })
    .from(jobOrder)
    .where(
      and(
        eq(jobOrder.jobId, jobId),
        inArray(jobOrder.status, ["approved", "received"]),
        isNull(jobOrder.deletedAt),
      ),
    );
  const linked = new Map<string, number>();
  for (const r of rows)
    if (r.orderId) linked.set(r.orderId, (linked.get(r.orderId) ?? 0) + r.amountMinor);
  const valid = new Set(budget.sections.map((s) => s.id));
  const orderedBySection: Record<string, number> = {};
  let unassigned = 0;
  for (const o of orders) {
    const open = openCommitmentMinor(o.total, linked.get(o.id) ?? 0);
    if (o.sectionId && valid.has(o.sectionId))
      orderedBySection[o.sectionId] = (orderedBySection[o.sectionId] ?? 0) + open;
    else unassigned += open;
  }
  const plan = buildPlan({
    objects: budget.objects,
    sections: budget.sections,
    own: budget.own,
    actualBySection,
    orderedBySection,
    unpairedActualMinor: unpaired,
    unassignedOrderedMinor: unassigned,
  });
  return { ...plan, versionId: budget.versionId, unpairedCount };
}

/* ---------- ruční náklady ---------- */

async function assertSectionOfJob(
  ctx: Ctx,
  jobId: string,
  sectionId: string | null | undefined,
  itemId?: string | null,
): Promise<void> {
  if (!sectionId) {
    if (itemId) throw new UserError("Položku lze vybrat jen s oddílem.");
    return;
  }
  const bud = await loadBudget(ctx, jobId);
  if (!bud.sections.some((s) => s.id === sectionId))
    throw new UserError("Oddíl není v aktuálním rozpočtu této zakázky.");
  if (itemId && !bud.items.some((i) => i.id === itemId && i.sectionId === sectionId))
    throw new UserError("Položka nepatří do vybraného oddílu.");
}

export type ManualCostInput = {
  jobId: string;
  date: string;
  category: string;
  title: string;
  supplierId?: string | null;
  supplierName?: string | null;
  amountMinor: number;
  sectionId?: string | null;
  itemId?: string | null;
  orderId?: string | null;
  source?: string | null;
  sourceRef?: string | null;
};

/**
 * Založí ruční náklad zakázky (i z jiné oblasti: deník zapíše materiál s cenou). `source`/`sourceRef` si pamatují
 * původ, aby šel náklad při změně zdroje smazat. Neověřuje oprávnění, volá `recomputeJobSummary`.
 */
export async function createManualCost(ctx: Ctx, i: ManualCostInput): Promise<{ id: string }> {
  return inTx(ctx, async (c) => {
    await lockJob(c, i.jobId);
    await assertSectionOfJob(c, i.jobId, i.sectionId, i.itemId);
    const [r] = await c.db
      .insert(jobCost)
      .values({
        jobId: i.jobId,
        date: i.date,
        category: i.category,
        title: i.title,
        supplierId: i.supplierId ?? null,
        supplierName: i.supplierName || null,
        amountMinor: i.amountMinor,
        sectionId: i.sectionId ?? null,
        itemId: i.itemId ?? null,
        orderId: i.orderId ?? null,
        source: i.source ?? null,
        sourceRef: i.sourceRef ?? null,
        createdBy: c.actor.userId,
        updatedBy: c.actor.userId,
      })
      .returning({ id: jobCost.id });
    await recordAudit(c, {
      action: "create",
      entityType: "job",
      entityId: i.jobId,
      summary: `Náklad: ${i.title} ${formatMinor(i.amountMinor)}`,
    });
    await recomputeJobSummary(c, i.jobId);
    return { id: r!.id };
  });
}

export async function updateManualCost(
  ctx: Ctx,
  id: string,
  i: Omit<ManualCostInput, "jobId" | "source" | "sourceRef">,
): Promise<{ id: string; jobId: string }> {
  return inTx(ctx, async (c) => {
    const [cur] = await c.db
      .select()
      .from(jobCost)
      .where(and(eq(jobCost.id, id), isNull(jobCost.deletedAt)));
    if (!cur) throw new UserError("Náklad nenalezen.");
    if (cur.source)
      throw new UserError(
        "Tento náklad vznikl v jiné části systému (např. v deníku). Upravte ho tam, kde vznikl.",
      );
    await lockJob(c, cur.jobId);
    await assertSectionOfJob(c, cur.jobId, i.sectionId, i.itemId);
    const moved = (i.sectionId ?? null) !== cur.sectionId;
    await c.db
      .update(jobCost)
      .set({
        date: i.date,
        category: i.category,
        title: i.title,
        supplierId: i.supplierId ?? null,
        supplierName: i.supplierName || null,
        amountMinor: i.amountMinor,
        sectionId: i.sectionId ?? null,
        itemId: i.itemId ?? null,
        orderId: i.orderId ?? null,
        updatedBy: c.actor.userId,
      })
      .where(eq(jobCost.id, id));
    // rozpad na víc oddílů se zahodí, když se náklad přesune jinam
    if (moved || i.amountMinor !== cur.amountMinor)
      await c.db
        .delete(costAllocation)
        .where(and(eq(costAllocation.source, "manual"), eq(costAllocation.sourceRef, id)));
    await recordAudit(c, {
      action: "update",
      entityType: "job",
      entityId: cur.jobId,
      summary: `Náklad upraven: ${i.title} ${formatMinor(i.amountMinor)}`,
    });
    await recomputeJobSummary(c, cur.jobId);
    return { id, jobId: cur.jobId };
  });
}

export async function deleteManualCost(ctx: Ctx, id: string): Promise<{ jobId: string }> {
  return inTx(ctx, async (c) => {
    const [cur] = await c.db
      .select()
      .from(jobCost)
      .where(and(eq(jobCost.id, id), isNull(jobCost.deletedAt)));
    if (!cur) throw new UserError("Náklad nenalezen.");
    if (cur.source)
      throw new UserError(
        "Tento náklad vznikl v jiné části systému (např. v deníku). Smažte ho tam, kde vznikl.",
      );
    await lockJob(c, cur.jobId);
    await c.db
      .update(jobCost)
      .set({ deletedAt: new Date(), updatedBy: c.actor.userId })
      .where(eq(jobCost.id, id));
    await c.db
      .delete(costAllocation)
      .where(and(eq(costAllocation.source, "manual"), eq(costAllocation.sourceRef, id)));
    await recordAudit(c, {
      action: "delete",
      entityType: "job",
      entityId: cur.jobId,
      summary: `Odebrán náklad: ${cur.title}`,
    });
    await recomputeJobSummary(c, cur.jobId);
    return { jobId: cur.jobId };
  });
}

/**
 * Smaže náklady daného zdroje (deník při smazání nebo úpravě řádku). `sourceRefPrefix` zúží výběr na `sourceRef`,
 * který s ním začíná. Vrací počet smazaných. Neověřuje oprávnění, volá `recomputeJobSummary`.
 */
export async function deleteManualCostsBySource(
  ctx: Ctx,
  jobId: string,
  source: string,
  sourceRefPrefix?: string,
): Promise<number> {
  return inTx(ctx, async (c) => {
    await lockJob(c, jobId);
    const rows = await c.db
      .select({ id: jobCost.id, ref: jobCost.sourceRef })
      .from(jobCost)
      .where(and(eq(jobCost.jobId, jobId), eq(jobCost.source, source), isNull(jobCost.deletedAt)));
    const ids = rows
      .filter((r) => !sourceRefPrefix || (r.ref ?? "").startsWith(sourceRefPrefix))
      .map((r) => r.id);
    if (!ids.length) return 0;
    await c.db
      .update(jobCost)
      .set({ deletedAt: new Date(), updatedBy: c.actor.userId })
      .where(inArray(jobCost.id, ids));
    await c.db
      .delete(costAllocation)
      .where(and(eq(costAllocation.source, "manual"), inArray(costAllocation.sourceRef, ids)));
    await recomputeJobSummary(c, jobId);
    return ids.length;
  });
}

/* ---------- párování ---------- */

export type AllocateInput = {
  source: string;
  ref: string;
  parts: { sectionId: string; itemId?: string | null; amountMinor?: number | null }[];
};

/**
 * Spáruje (přepáruje, zruší) náklad na oddíl a případně položku rozpočtu; rozpad na víc oddílů přes `amountMinor`.
 * Prázdné `parts` párování zruší. Zdroj a ref jsou z řádku seznamu nákladů (`CostOut.key`).
 */
export async function allocateCost(
  ctx: Ctx,
  jobId: string,
  input: AllocateInput,
  deps?: ModuleDeps,
): Promise<void> {
  await inTx(ctx, async (c) => {
    await lockJob(c, jobId);
    const { rows, budget } = await loadCosts(c, jobId, deps);
    const row = rows.find((r) => r.allocSource === input.source && r.ref === input.ref);
    if (!row) throw new UserError("Náklad už neexistuje, obnovte stránku.");
    const bad = validateParts(row.amountMinor, input.parts, (n) => formatMinor(n));
    if (bad) throw new UserError(bad);
    for (const p of input.parts) {
      const s = budget.sections.find((x) => x.id === p.sectionId);
      if (!s) throw new UserError("Oddíl není v aktuálním rozpočtu této zakázky.");
      if (p.itemId && !budget.items.some((i) => i.id === p.itemId && i.sectionId === p.sectionId))
        throw new UserError("Položka nepatří do vybraného oddílu.");
    }
    const parts = normalizeParts(input.parts);
    await c.db
      .delete(costAllocation)
      .where(
        and(
          eq(costAllocation.jobId, jobId),
          eq(costAllocation.source, input.source),
          eq(costAllocation.sourceRef, input.ref),
        ),
      );
    if (row.id) {
      // ruční náklad s jedním oddílem ho nese přímo, rozpad jde přes cost_allocation
      const single = parts.length === 1 ? parts[0]! : null;
      await c.db
        .update(jobCost)
        .set({
          sectionId: single?.sectionId ?? null,
          itemId: single?.itemId ?? null,
          updatedBy: c.actor.userId,
        })
        .where(eq(jobCost.id, row.id));
      if (single) parts.length = 0;
    }
    if (parts.length)
      await c.db.insert(costAllocation).values(
        parts.map((p) => ({
          jobId,
          source: input.source,
          sourceRef: input.ref,
          sectionId: p.sectionId,
          itemId: p.itemId,
          amountMinor: p.amountMinor,
          createdBy: c.actor.userId,
          updatedBy: c.actor.userId,
        })),
      );
    await recordAudit(c, {
      action: "update",
      entityType: "job",
      entityId: jobId,
      summary: input.parts.length
        ? `Náklad „${row.label}“ spárován s rozpočtem`
        : `Párování nákladu „${row.label}“ zrušeno`,
    });
    await recomputeJobSummary(c, jobId, deps);
  });
}

/**
 * Automatické párování: nespárovaný náklad se přiřadí oddílu, jehož kategorie nákladu odpovídá, pokud je takový
 * oddíl jednoznačný (přesně jeden). Ostatní zůstanou nespárované. Vrací počet spárovaných a zbylých.
 */
export async function autoAllocate(
  ctx: Ctx,
  jobId: string,
  deps?: ModuleDeps,
): Promise<{ allocated: number; left: number }> {
  return inTx(ctx, async (c) => {
    await lockJob(c, jobId);
    const { rows, budget } = await loadCosts(c, jobId, deps);
    const todo = rows.filter((r) => r.status === "unpaired");
    const values: (typeof costAllocation.$inferInsert)[] = [];
    const manualIds: { id: string; sectionId: string }[] = [];
    for (const r of todo) {
      const sectionId = suggestSection(r.category, budget.sections);
      if (!sectionId) continue;
      if (r.id) manualIds.push({ id: r.id, sectionId });
      else
        values.push({
          jobId,
          source: r.allocSource,
          sourceRef: r.ref,
          sectionId,
          itemId: null,
          amountMinor: null,
          createdBy: c.actor.userId,
          updatedBy: c.actor.userId,
        });
    }
    for (const m of manualIds)
      await c.db
        .update(jobCost)
        .set({ sectionId: m.sectionId, itemId: null, updatedBy: c.actor.userId })
        .where(eq(jobCost.id, m.id));
    if (values.length) await c.db.insert(costAllocation).values(values);
    const allocated = values.length + manualIds.length;
    if (allocated) {
      await recordAudit(c, {
        action: "update",
        entityType: "job",
        entityId: jobId,
        summary: `Automaticky spárováno ${allocated} nákladů s rozpočtem`,
      });
      await recomputeJobSummary(c, jobId, deps);
    }
    return { allocated, left: todo.length - allocated };
  });
}
