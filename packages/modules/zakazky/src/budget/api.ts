/**
 * Veřejné rozhraní oblasti „budget“ pro ostatní oblasti a moduly (serverový kód, funkce s `ctx`).
 * Ostatní se na oblast odkazují jen přes `budgetApi` z `@rebar/zakazky/server`, ne přes cesty do složky.
 *
 * Funkce NEKONTROLUJÍ oprávnění (jako poskytovatelé nákladů): volající odpovídá za přístup k zakázce a za to,
 * že výsledek s cenami neukáže uživateli bez `zakazky.economics`. Zapisující funkce si samy otevřou transakci
 * (uvnitř cizí transakce jde o savepoint) a na konci přepočtou souhrn zakázky.
 */
import { inTx } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { budgetTreeView, type BudgetTreeView } from "./queries";
import {
  currentVersion,
  loadStructure,
  lockVersionRow,
  lockVersionTx,
  recomputeSummary,
  totalsOf,
  ensureOffer as ensureOfferTx,
  ensureRealization as ensureRealizationTx,
} from "./service";
import {
  applyChangeLinesTx,
  copyOfferToRealizationTx,
  revertChangeLinesTx,
  type ApplyResult,
} from "./transitions";

export type SectionTotals = {
  sellMinor: number;
  costMinor: number;
  originalSellMinor: number;
  originalCostMinor: number;
};

export type BudgetTotals = SectionTotals & {
  versionId: string | null;
  /** Všechny oddíly aktuální verze (i prázdné) a jen jejich VLASTNÍ položky; součet oddílů = součet verze. */
  bySection: Record<string, SectionTotals>;
};

/**
 * Součty aktuálního rozpočtu zakázky (poslední realizační verze, jinak poslední nabídka), částky bez DPH.
 * `original*` jsou hodnoty při zamčení / kopii nabídky (bez nich se rovnají aktuálním).
 */
export async function getBudgetTotals(ctx: Ctx, jobId: string): Promise<BudgetTotals> {
  const v = await currentVersion(ctx, jobId);
  if (!v)
    return {
      versionId: null,
      sellMinor: 0,
      costMinor: 0,
      originalSellMinor: 0,
      originalCostMinor: 0,
      bySection: {},
    };
  return { versionId: v.id, ...(await totalsOf(ctx, v.id)) };
}

/** Strom aktuální (nebo zadané) verze se součty na každé úrovni. */
export function getBudgetTree(
  ctx: Ctx,
  jobId: string,
  versionId?: string | null,
): Promise<BudgetTreeView> {
  return budgetTreeView(ctx, jobId, versionId);
}

/** Plochý výpis položek aktuální verze (např. pro výběr položky ve změně nebo soupisu). */
export async function listBudgetItems(ctx: Ctx, jobId: string) {
  const v = await currentVersion(ctx, jobId);
  if (!v) return { versionId: null, sections: [], items: [] };
  const st = await loadStructure(ctx, v.id);
  return { versionId: v.id, sections: st.sections, items: st.items };
}

/** Zkopíruje poslední nabídku do realizační verze (původní hodnoty položek se uloží). */
export function copyOfferToRealization(ctx: Ctx, jobId: string) {
  return inTx(ctx, (c) => copyOfferToRealizationTx(c, jobId));
}

/** Zamkne verzi a uloží původní hodnoty položek. Zamčenou verzi nic nezmění než propsání schválené změny. */
export function lockVersion(ctx: Ctx, versionId: string) {
  return inTx(ctx, async (c) => {
    const v = await lockVersionRow(c, versionId);
    const locked = await lockVersionTx(c, v);
    await recomputeSummary(c, v.jobId);
    return { id: locked.id, status: locked.status };
  });
}

/** Propíše schválenou změnu (ZBV) do položek realizační verze; opakované volání nic neudělá. */
export function applyChangeLines(ctx: Ctx, changeId: string): Promise<ApplyResult> {
  return inTx(ctx, (c) => applyChangeLinesTx(c, changeId));
}

/** Vrátí propsanou změnu (reopen): položky ze změny se smažou a množství se vrátí na hodnotu před změnou. */
export function revertChangeLines(ctx: Ctx, changeId: string) {
  return inTx(ctx, (c) => revertChangeLinesTx(c, changeId));
}

/** Nabídková / realizační verze zakázky; když chybí, založí prázdnou (s výchozím objektem). */
export function ensureOffer(ctx: Ctx, jobId: string) {
  return inTx(ctx, (c) => ensureOfferTx(c, jobId));
}
export function ensureRealization(ctx: Ctx, jobId: string) {
  return inTx(ctx, (c) => ensureRealizationTx(c, jobId));
}

/** PDF nabídky (kontroluje přístup k zakázce a `zakazky.economics`; do dokumentu jdou jen prodejní ceny). */
export { renderOfferPdf } from "./offer-pdf";
/** Šablona PDF nabídky (texty, platnost); edituje se v Nastavení Fakturace. */
export { offerTemplateSetting } from "./offer-template";

export type { BudgetTreeView, ApplyResult };
