/*
  Splatnost a součty plateb (FIN-11, FIN-12, R-40).

  Rozhodnutí R-40: červeně (po splatnosti) je jen platba ve stavu Vystavená, jejíž splatnost je před dneškem
  (v den splatnosti ještě ne). Plánovaná platba s prošlým plánovaným datem vystavení je jen upozornění
  (`planned_late`) a do čísla u položky Finance se nepočítá. Dnešek se předává zvenku (`today`).
*/
import { assertDate, addDays } from "./dates";
import type { Allocation, PaymentKind, PaymentStatus } from "./types";

/** Minimum polí platby pro posouzení splatnosti. */
export interface PaymentDue {
  status: PaymentStatus;
  /** Splatnost `YYYY-MM-DD`. */
  dueOn?: string | null;
  /** Plánované datum vystavení (u Plánované platby, např. z `issueDay` retaineru). */
  issuedOn?: string | null;
}

/** Stav splatnosti: `overdue` = červeně, `planned_late` = jen upozornění, `ok`, `none` = bez splatnosti/nerelevantní. */
export type DueState = "overdue" | "planned_late" | "ok" | "none";

/** Je platba po splatnosti (Vystavená, splatnost před `today`)? */
export function isOverdue(payment: PaymentDue, today: string): boolean {
  assertDate(today, "Dnešek");
  return payment.status === "issued" && !!payment.dueOn && payment.dueOn < today;
}

/** Stav splatnosti platby (viz hlavička souboru, R-40). */
export function paymentDueState(payment: PaymentDue, today: string): DueState {
  assertDate(today, "Dnešek");
  if (payment.status === "paid" || payment.status === "canceled") return "none";
  if (payment.status === "issued") {
    if (!payment.dueOn) return "none";
    return payment.dueOn < today ? "overdue" : "ok";
  }
  // planned
  const planned = payment.dueOn ?? payment.issuedOn;
  if (!planned) return "none";
  return planned < today ? "planned_late" : "ok";
}

/** Počet plateb po splatnosti — číslo u položky Finance v menu (FIN-11). */
export function countOverdue(payments: readonly PaymentDue[], today: string): number {
  return payments.filter((p) => isOverdue(p, today)).length;
}

/** Splatnost jako datum vystavení + počet dní (výchozí nabídka při přechodu na Vystavená). */
export function dueOnFrom(issuedOn: string, netDays: number): string {
  return addDays(issuedOn, netDays);
}

/** Platba pro součty v seznamu. */
export interface PaymentForTotals extends PaymentDue {
  kind?: PaymentKind;
  amountMinor: number;
  issuerId: string;
  allocations?: readonly Allocation[];
}

/** Součty seznamu plateb (patička tabulky, FIN-12). Zrušené platby se do částek nepočítají. */
export interface PaymentTotals {
  /** Počet nezrušených plateb. */
  count: number;
  /** Součet částek nezrušených plateb. */
  totalMinor: number;
  byStatus: Record<PaymentStatus, { count: number; amountMinor: number }>;
  overdue: { count: number; amountMinor: number };
  plannedLate: { count: number; amountMinor: number };
  /** Součet podílů podle osoby (nezrušené platby). */
  allocatedByUser: Record<string, number>;
  /** Součet částek podle fakturujícího (nezrušené platby). */
  invoicedByIssuer: Record<string, number>;
}

/** Spočítá součty nad seznamem plateb (po filtrování v UI/serveru). */
export function summarizePayments(
  payments: readonly PaymentForTotals[],
  today: string,
): PaymentTotals {
  const zero = () => ({ count: 0, amountMinor: 0 });
  const totals: PaymentTotals = {
    count: 0,
    totalMinor: 0,
    byStatus: { planned: zero(), issued: zero(), paid: zero(), canceled: zero() },
    overdue: zero(),
    plannedLate: zero(),
    allocatedByUser: {},
    invoicedByIssuer: {},
  };
  for (const p of payments) {
    const bucket = totals.byStatus[p.status];
    bucket.count++;
    bucket.amountMinor += p.amountMinor;
    if (p.status === "canceled") continue;
    totals.count++;
    totals.totalMinor += p.amountMinor;
    totals.invoicedByIssuer[p.issuerId] =
      (totals.invoicedByIssuer[p.issuerId] ?? 0) + p.amountMinor;
    for (const a of p.allocations ?? []) {
      totals.allocatedByUser[a.userId] = (totals.allocatedByUser[a.userId] ?? 0) + a.amountMinor;
    }
    const state = paymentDueState(p, today);
    if (state === "overdue") {
      totals.overdue.count++;
      totals.overdue.amountMinor += p.amountMinor;
    } else if (state === "planned_late") {
      totals.plannedLate.count++;
      totals.plannedLate.amountMinor += p.amountMinor;
    }
  }
  return totals;
}
