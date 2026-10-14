/*
  Saldo mezi partnery (FIN-14–18). Kdo fakturoval, dostal peníze; co z platby patří druhému, to mu dluží.
  Saldo dvojice = dluhy jedním směrem − dluhy druhým směrem − zapsaná vyrovnání (storno vyrovnání se nepočítá).

  Rozhodnutí:
  - Základ `paid` (výchozí): počítají se jen Zaplacené platby; `issued`: Vystavené i Zaplacené. Plánované a Zrušené
    platby se nepočítají nikdy.
  - Soukromé platby (`isPrivate`, soukromá zakázka, `kind = recurring`) jsou mimo saldo i mimo měsíční rozpis (FIN-18).
    Volající má navíc povinnost poslat sem jen to, co smí vidět — soukromí vynucuje jádro, ne tahle funkce.
  - Měsíc platby v rozpisu: základ `paid` → měsíc data zaplacení, `issued` → měsíc data vystavení; chybí-li, použije se
    druhé datum a pak `periodMonth`; bez jakéhokoli data je platba v řádku s `month = null` (řadí se na konec).
  - Součet podílů platby musí sedět na částku (jinak `allocation_sum_mismatch`) — saldo by jinak bylo nepravdivé.
  - Rozdíl za osobu v měsíci = fakturoval − patří mu (kladné = drží víc, než mu patří, tedy dluží ostatním).
*/
import { monthOf } from "./dates";
import {
  FinanceLogicError,
  type Allocation,
  type PaymentKind,
  type PaymentStatus,
  assertFinance,
} from "./types";
import { assertPositiveMinor } from "./money";

/** Základ výpočtu salda (`finance.balance_basis`). */
export type BalanceBasis = "paid" | "issued";

/** Platba pro výpočet salda. */
export interface BalancePayment {
  id: string;
  status: PaymentStatus;
  kind?: PaymentKind;
  amountMinor: number;
  issuerId: string;
  periodMonth?: string | null;
  issuedOn?: string | null;
  paidOn?: string | null;
  /** Soukromá zakázka/platba → mimo saldo. */
  isPrivate?: boolean;
  allocations: readonly Allocation[];
}

/** Zapsané vyrovnání (FIN-17). */
export interface BalanceSettlement {
  id: string;
  fromUserId: string;
  toUserId: string;
  amountMinor: number;
  settledOn?: string | null;
  /** Neprázdné = stornované (měkce smazané) → nepočítá se. */
  canceledAt?: string | null;
}

/** Dluh jedné osoby druhé. */
export interface PairDebt {
  debtorId: string;
  creditorId: string;
  amountMinor: number;
}

/** Jeden měsíc rozpisu (FIN-16). */
export interface BalanceMonth {
  /** `YYYY-MM`, nebo `null` u plateb bez jakéhokoli data. */
  month: string | null;
  /** Kolik kdo v měsíci fakturoval (přijal od klienta). */
  invoiced: Record<string, number>;
  /** Komu kolik patří (součet alokací). */
  entitled: Record<string, number>;
  /** Rozdíl za osobu: fakturoval − patří mu. Součet přes všechny osoby je 0. */
  difference: Record<string, number>;
  /** Dluhy, které z plateb měsíce vznikly (před vyrovnáními). */
  debts: PairDebt[];
  /** Id plateb měsíce (rozklik měsíce). */
  paymentIds: string[];
}

/** Výsledek `balance`. */
export interface BalanceResult {
  basis: BalanceBasis;
  /** Hlavní číslo: kdo komu kolik dluží po zápočtu vyrovnání, nebo `null` = „Vyrovnáno“. */
  headline: PairDebt | null;
  /** Všechny nenulové čisté dluhy dvojic po vyrovnáních (u dvou partnerů nejvýš jeden). */
  pairs: PairDebt[];
  /** Čisté dluhy dvojic před vyrovnáními. */
  grossPairs: PairDebt[];
  /** Kolik vyrovnání se započetlo (aktivní, nestornovaná). */
  settlementsApplied: number;
  /** Rozpis po měsících vzestupně (`null` měsíc nakonec). */
  months: BalanceMonth[];
  /** Id plateb, které vstoupily do výpočtu. */
  paymentIds: string[];
}

const pairKey = (a: string, b: string) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);

/** Vstoupí platba do salda na daném základu? */
export function countsTowardBalance(
  payment: Pick<BalancePayment, "status" | "kind" | "isPrivate">,
  basis: BalanceBasis,
): boolean {
  if (payment.isPrivate || payment.kind === "recurring") return false;
  if (payment.status === "paid") return true;
  return basis === "issued" && payment.status === "issued";
}

function monthFor(p: BalancePayment, basis: BalanceBasis): string | null {
  const first = basis === "paid" ? p.paidOn : p.issuedOn;
  const second = basis === "paid" ? p.issuedOn : p.paidOn;
  const date = first || second;
  if (date) return monthOf(date);
  return p.periodMonth || null;
}

/** Převede čisté částky dvojic (kladné = první dluží druhému) na seznam nenulových dluhů. */
function netPairs(net: Map<string, { a: string; b: string; amount: number }>): PairDebt[] {
  const out: PairDebt[] = [];
  for (const { a, b, amount } of net.values()) {
    if (amount > 0) out.push({ debtorId: a, creditorId: b, amountMinor: amount });
    else if (amount < 0) out.push({ debtorId: b, creditorId: a, amountMinor: -amount });
  }
  return out.sort(
    (x, y) =>
      y.amountMinor - x.amountMinor ||
      x.debtorId.localeCompare(y.debtorId) ||
      x.creditorId.localeCompare(y.creditorId),
  );
}

/** Přičte dluh `debtor → creditor` do mapy čistých částek dvojic (orientace: `a` je menší id). */
function addDebt(
  net: Map<string, { a: string; b: string; amount: number }>,
  debtor: string,
  creditor: string,
  amount: number,
): void {
  if (debtor === creditor || amount === 0) return;
  const key = pairKey(debtor, creditor);
  const a = debtor < creditor ? debtor : creditor;
  const b = debtor < creditor ? creditor : debtor;
  const entry = net.get(key) ?? { a, b, amount: 0 };
  entry.amount += debtor === a ? amount : -amount;
  net.set(key, entry);
}

/**
 * Spočítá saldo mezi partnery a měsíční rozpis z plateb a vyrovnání (viz hlavička souboru). `settlements` smí obsahovat
 * i stornovaná (`canceledAt`) — ta se přeskočí. Deterministické, bez DB.
 */
export function balance(
  payments: readonly BalancePayment[],
  settlements: readonly BalanceSettlement[] = [],
  options: { basis?: BalanceBasis } = {},
): BalanceResult {
  const basis = options.basis ?? "paid";
  const gross = new Map<string, { a: string; b: string; amount: number }>();
  const monthMap = new Map<string | null, BalanceMonth>();
  const monthNet = new Map<string | null, Map<string, { a: string; b: string; amount: number }>>();
  const counted: string[] = [];

  for (const p of payments) {
    if (!countsTowardBalance(p, basis)) continue;
    assertPositiveMinor(p.amountMinor, "Částka platby");
    const sum = p.allocations.reduce((s, a) => s + a.amountMinor, 0);
    assertFinance(
      sum === p.amountMinor,
      "allocation_sum_mismatch",
      "Součet podílů platby se nerovná její částce.",
    );
    counted.push(p.id);
    const month = monthFor(p, basis);
    let row = monthMap.get(month);
    if (!row) {
      row = { month, invoiced: {}, entitled: {}, difference: {}, debts: [], paymentIds: [] };
      monthMap.set(month, row);
      monthNet.set(month, new Map());
    }
    row.paymentIds.push(p.id);
    row.invoiced[p.issuerId] = (row.invoiced[p.issuerId] ?? 0) + p.amountMinor;
    row.entitled[p.issuerId] = row.entitled[p.issuerId] ?? 0;
    for (const alloc of p.allocations) {
      row.entitled[alloc.userId] = (row.entitled[alloc.userId] ?? 0) + alloc.amountMinor;
      row.invoiced[alloc.userId] = row.invoiced[alloc.userId] ?? 0;
      // fakturující dluží každému, komu část patří (a není to on sám)
      addDebt(gross, p.issuerId, alloc.userId, alloc.amountMinor);
      addDebt(monthNet.get(month)!, p.issuerId, alloc.userId, alloc.amountMinor);
    }
  }

  const months = [...monthMap.values()].sort((x, y) =>
    x.month === y.month
      ? 0
      : x.month === null
        ? 1
        : y.month === null
          ? -1
          : x.month < y.month
            ? -1
            : 1,
  );
  for (const row of months) {
    for (const id of new Set([...Object.keys(row.invoiced), ...Object.keys(row.entitled)])) {
      row.difference[id] = (row.invoiced[id] ?? 0) - (row.entitled[id] ?? 0);
    }
    row.debts = netPairs(monthNet.get(row.month)!);
  }

  const net = new Map<string, { a: string; b: string; amount: number }>();
  for (const [k, v] of gross) net.set(k, { ...v });
  let applied = 0;
  for (const s of settlements) {
    if (s.canceledAt) continue;
    if (s.fromUserId === s.toUserId) {
      throw new FinanceLogicError("invalid_settlement", "Vyrovnání musí mít dvě různé osoby.");
    }
    assertPositiveMinor(s.amountMinor, "Částka vyrovnání");
    // from platí to → snižuje dluh from→to (tj. přičte opačný dluh to→from)
    addDebt(net, s.toUserId, s.fromUserId, s.amountMinor);
    applied++;
  }

  const pairs = netPairs(net);
  return {
    basis,
    headline: pairs[0] ?? null,
    pairs,
    grossPairs: netPairs(gross),
    settlementsApplied: applied,
    months,
    paymentIds: counted,
  };
}
