import { formatMinor } from "@rebar/core/shared";
import {
  allocateByRate,
  documentTotals,
  effectiveRateBp,
  lineNetMinor,
  netByRole,
  retentionGroups,
  retentionPct,
  type LineRole,
  type VatMode,
} from "../totals";

/**
 * Čistá logika skládání řádků faktur (bez databáze, s unit testy): zádržné, zálohy, konečné vyúčtování, uvolnění
 * zádržného, soupis. Databázová část (`sources.ts`, `api.ts`) jen načte vstupy a výsledek uloží.
 */

export type DraftLine = {
  description: string;
  quantity: string;
  unit: string;
  unitPriceMinor: number;
  vatRateBp: number;
  role: LineRole;
  budgetItemId?: string | null;
  refInvoiceId?: string | null;
};

/** Opačné znaménko bez záporné nuly. */
const neg = (n: number) => (n === 0 ? 0 : -n);

const one = (
  description: string,
  netMinor: number,
  vatRateBp: number,
  role: LineRole,
  extra: Partial<DraftLine> = {},
): DraftLine => ({
  description,
  quantity: "1",
  unit: "ks",
  unitPriceMinor: netMinor,
  vatRateBp,
  role,
  ...extra,
});

/** Při přenesené daňové povinnosti mají všechny řádky sazbu 0. */
export function applyVatMode<T extends { vatRateBp: number }>(
  lines: readonly T[],
  mode: VatMode,
): T[] {
  return lines.map((l) => ({ ...l, vatRateBp: effectiveRateBp(l.vatRateBp, mode) }));
}

/** Řádky „Zádržné x % z …“ (záporné) pro plnění v řádcích; po jedné na sazbu DPH. */
export function retentionRows(
  lines: readonly DraftLine[],
  retentionBp: number,
  mode: VatMode,
  currency = "CZK",
): DraftLine[] {
  const groups = retentionGroups(lines, retentionBp, mode);
  return groups.map((g) =>
    one(
      `Zádržné ${retentionPct(retentionBp)} % z ${formatMinor(g.basisMinor, currency)}${
        groups.length > 1 && mode === "standard" ? ` (sazba ${retentionPct(g.vatRateBp)} %)` : ""
      }`,
      -g.retainMinor,
      g.vatRateBp,
      "retention",
    ),
  );
}

/**
 * Doplní do řádků zádržné: dosavadní řádky zádržného odstraní a spočítá nové ze zbylých. Dobropis, záloha a uvolnění
 * zádržného zádržné nemají (volající je nevolá).
 */
export function withRetention(
  lines: readonly DraftLine[],
  retentionBp: number,
  mode: VatMode,
  currency = "CZK",
): DraftLine[] {
  const rest = lines.filter((l) => l.role !== "retention");
  return [...rest, ...retentionRows(rest, retentionBp, mode, currency)];
}

/** Zádržné stržené řádky dokladu (kladné číslo v haléřích). */
export function retainedOf(lines: readonly DraftLine[]): number {
  return neg(netByRole(lines).retention);
}

/* ---------- konečné vyúčtování ---------- */

export type BudgetItemRow = {
  id: string;
  title: string;
  code: string | null;
  unit: string;
  quantity: string;
  unitPriceMinor: number;
  vatRateBp: number;
};

export type ExtraChange = { number: string; title: string; amountMinor: number };

export type PreviousDoc = {
  invoiceId: string;
  number: string;
  /** Plnění tohoto dokladu bez vazby na položku rozpočtu, po sazbách DPH. */
  unlinked: { vatRateBp: number; netMinor: number }[];
};

export type AdvanceDoc = {
  invoiceId: string;
  number: string;
  /** Základ zálohy po sazbách DPH. */
  groups: { vatRateBp: number; netMinor: number }[];
};

export type FinalInput = {
  items: readonly BudgetItemRow[];
  /** Už fakturované plnění po položkách rozpočtu (součet základů a množství z vystavených dokladů). */
  billedByItem: ReadonlyMap<string, { netMinor: number; quantity: number }>;
  previous: readonly PreviousDoc[];
  advances: readonly AdvanceDoc[];
  /** Schválené vícepráce/méněpráce, které nejsou v rozpočtu (starší změny bez řádků). */
  extraChanges: readonly ExtraChange[];
  retentionBp: number;
  vatMode: VatMode;
  /** Sazba pro řádky bez rozpočtu (neplátce 0). */
  defaultRateBp: number;
  payer: boolean;
  currency?: string;
  /** Rozpočet (nebo cena zakázky) bez položek: jediný řádek. */
  fallback?: { description: string; netMinor: number };
};

/** Sazba položky: neplátce nemá DPH, PDP také ne. */
const rateOf = (rate: number, payer: boolean, mode: VatMode) =>
  payer ? effectiveRateBp(rate, mode) : 0;

/**
 * Řádky konečné faktury (rekapitulace): zbývající plnění po položkách rozpočtu, odpočet dříve fakturovaných prací
 * bez vazby na položky, odpočet zaplacených záloh a zádržné ze zbývajícího plnění.
 */
export function buildFinalLines(i: FinalInput): DraftLine[] {
  const lines: DraftLine[] = [];
  for (const it of i.items) {
    const contractNet = lineNetMinor(it.quantity, it.unitPriceMinor);
    if (contractNet === 0 && Number(it.quantity) === 0) continue;
    const billed = i.billedByItem.get(it.id);
    const rate = rateOf(it.vatRateBp, i.payer, i.vatMode);
    const label = it.code ? `${it.code} ${it.title}` : it.title;
    if (!billed) {
      lines.push({
        description: label,
        quantity: it.quantity,
        unit: it.unit,
        unitPriceMinor: it.unitPriceMinor,
        vatRateBp: rate,
        role: "work",
        budgetItemId: it.id,
      });
      continue;
    }
    const remaining = contractNet - billed.netMinor;
    if (remaining === 0) continue;
    lines.push(one(`${label} – zbývající část`, remaining, rate, "work", { budgetItemId: it.id }));
  }
  if (!i.items.length && i.fallback && i.fallback.netMinor !== 0)
    lines.push(one(i.fallback.description, i.fallback.netMinor, i.defaultRateBp, "work"));
  for (const ch of i.extraChanges)
    lines.push(
      one(
        ch.number ? `${ch.number} ${ch.title}` : ch.title,
        ch.amountMinor,
        i.defaultRateBp,
        "work",
      ),
    );
  for (const p of i.previous)
    for (const g of p.unlinked)
      if (g.netMinor !== 0)
        lines.push(
          one(
            `Odpočet dříve fakturovaných prací (${p.number})`,
            -g.netMinor,
            rateOf(g.vatRateBp, i.payer, i.vatMode),
            "previous",
            { refInvoiceId: p.invoiceId },
          ),
        );
  const currency = i.currency ?? "CZK";
  // zádržné se počítá z plnění před odpočtem záloh
  const retention = retentionRows(lines, i.retentionBp, i.vatMode, currency);
  for (const a of i.advances)
    for (const g of a.groups)
      if (g.netMinor !== 0)
        lines.push(
          one(
            `Odpočet zálohy ${a.number}`,
            -g.netMinor,
            rateOf(g.vatRateBp, i.payer, i.vatMode),
            "advance",
            { refInvoiceId: a.invoiceId },
          ),
        );
  return [...lines, ...retention];
}

/** Rozpis konečného vyúčtování z hotových řádků: smluvní plnění, odpočty, zádržné, k fakturaci (vše bez DPH). */
export function settlementOf(lines: readonly DraftLine[], vatMode: VatMode = "standard") {
  const r = netByRole(lines);
  const t = documentTotals(lines, { vatMode });
  return {
    workMinor: r.work,
    previousMinor: neg(r.previous),
    advancesMinor: neg(r.advance),
    retentionMinor: neg(r.retention),
    remainingWorkMinor: r.work + r.previous,
    netMinor: t.netMinor,
    vatMinor: t.vatMinor,
    grossMinor: t.grossMinor,
  };
}

/* ---------- záloha a dílčí faktura procentem / částkou ---------- */

/**
 * Záloha nebo dílčí faktura z částky: základ se rozdělí na sazby DPH podle rozpočtu (poměr základů), aby součet DPH
 * sedl i u zakázky s více sazbami.
 */
export function amountLines(args: {
  description: string;
  netMinor: number;
  weights: readonly { vatRateBp: number; weight: number }[];
  defaultRateBp: number;
  payer: boolean;
  vatMode: VatMode;
}): DraftLine[] {
  const rate = (r: number) => rateOf(r, args.payer, args.vatMode);
  const parts = allocateByRate(
    args.netMinor,
    args.weights.map((w) => ({ ...w, vatRateBp: rate(w.vatRateBp) })),
    rate(args.defaultRateBp),
  );
  // stejné sazby (PDP, neplátce) sloučit do jednoho řádku
  const merged = new Map<number, number>();
  for (const p of parts) merged.set(p.vatRateBp, (merged.get(p.vatRateBp) ?? 0) + p.netMinor);
  const groups = [...merged.entries()].sort(([a], [b]) => b - a);
  return groups.map(([vatRateBp, netMinor]) =>
    one(
      groups.length > 1 && args.vatMode === "standard"
        ? `${args.description} (sazba ${retentionPct(vatRateBp)} %)`
        : args.description,
      netMinor,
      vatRateBp,
      "work",
    ),
  );
}

/* ---------- soupis prací ---------- */

export type StatementLine = {
  budgetItemId: string;
  title: string;
  unit: string;
  vatRateBp: number;
  quantityPeriod: string;
  unitPriceMinor: number;
};

export function statementInvoiceLines(
  lines: readonly StatementLine[],
  payer: boolean,
  mode: VatMode,
): DraftLine[] {
  return lines
    .filter((l) => Number(l.quantityPeriod) !== 0)
    .map((l) => ({
      description: l.title,
      quantity: l.quantityPeriod,
      unit: l.unit,
      unitPriceMinor: l.unitPriceMinor,
      vatRateBp: rateOf(l.vatRateBp, payer, mode),
      role: "work" as const,
      budgetItemId: l.budgetItemId,
    }));
}

/**
 * Krácení soupisu (schváleno méně, než zhotovitel nárokoval): záporný řádek rozdělený na sazby DPH podle řádků soupisu,
 * aby faktura odpovídala schválené částce.
 */
export function reductionLines(args: {
  reductionMinor: number;
  number: number;
  lines: readonly DraftLine[];
  payer: boolean;
  defaultRateBp: number;
  vatMode: VatMode;
}): DraftLine[] {
  const weights = new Map<number, number>();
  for (const l of args.lines)
    weights.set(
      l.vatRateBp,
      (weights.get(l.vatRateBp) ?? 0) + Math.abs(lineNetMinor(l.quantity, l.unitPriceMinor)),
    );
  return amountLines({
    description: `Krácení soupisu č. ${args.number} při schválení`,
    netMinor: -args.reductionMinor,
    weights: [...weights.entries()].map(([vatRateBp, weight]) => ({ vatRateBp, weight })),
    defaultRateBp: args.defaultRateBp,
    payer: args.payer,
    vatMode: args.vatMode,
  });
}

/* ---------- uvolnění zádržného ---------- */

/**
 * Řádky dokladu o uvolnění zádržného z držených částek po sazbách. Bez částky se uvolní vše, jinak se částka rozdělí
 * poměrem držených základů. Vrací prázdné pole, není-li co uvolnit; přesah částky řeší volající.
 */
export function releaseLines(args: {
  held: readonly { vatRateBp: number; netMinor: number }[];
  amountMinor?: number;
  jobNumber: string;
  vatMode: VatMode;
}): DraftLine[] {
  const held = args.held.filter((h) => h.netMinor > 0);
  const total = held.reduce((a, h) => a + h.netMinor, 0);
  if (!total) return [];
  const amount = args.amountMinor === undefined ? total : Math.min(args.amountMinor, total);
  const parts =
    amount === total
      ? held
      : allocateByRate(
          amount,
          held.map((h) => ({ vatRateBp: h.vatRateBp, weight: h.netMinor })),
          held[0]!.vatRateBp,
        ).map((p) => ({
          ...p,
          netMinor: Math.min(
            p.netMinor,
            held.find((h) => h.vatRateBp === p.vatRateBp)?.netMinor ?? p.netMinor,
          ),
        }));
  const several = parts.length > 1 && args.vatMode === "standard";
  return parts
    .filter((p) => p.netMinor > 0)
    .map((p) =>
      one(
        `Uvolnění zádržného – zakázka ${args.jobNumber}${several ? ` (sazba ${retentionPct(p.vatRateBp)} %)` : ""}`,
        p.netMinor,
        p.vatRateBp,
        "release",
      ),
    );
}
