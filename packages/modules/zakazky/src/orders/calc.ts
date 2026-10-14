/**
 * Čistá logika objednávek zakázky (bez databáze a Reactu): součty řádků, stavy a povolené přechody.
 * Částky v haléřích, množství jako desetinný řetězec (ADR 003). Objednávka není náklad, ale závazek.
 */
import { lineAmount } from "../budget/math";

export type OrderStatus = "draft" | "pending" | "approved" | "received" | "cancelled";

export const ORDER_STATUSES: readonly { key: OrderStatus; label: string; color: string }[] = [
  { key: "draft", label: "Koncept", color: "gray" },
  { key: "pending", label: "Ke schválení", color: "yellow" },
  { key: "approved", label: "Schváleno", color: "blue" },
  { key: "received", label: "Přijato", color: "green" },
  { key: "cancelled", label: "Zrušeno", color: "red" },
];
export const orderStatus = (k: string) =>
  ORDER_STATUSES.find((s) => s.key === k) ?? ORDER_STATUSES[0]!;

export type OrderLineIn = { quantity: string; unitPriceMinor: number; vatRateBp: number };

/** Součty objednávky: základ (bez DPH, tím se řídí závazek a schvalování), DPH po řádcích a celkem. */
export function orderTotals(lines: readonly OrderLineIn[]) {
  let net = 0;
  let vat = 0;
  for (const l of lines) {
    const n = lineAmount(l.quantity, l.unitPriceMinor);
    net += n;
    vat += Math.round((n * l.vatRateBp) / 10_000);
  }
  return { netMinor: net, vatMinor: vat, grossMinor: net + vat };
}

/** Objednávku lze upravit jen v konceptu (po odeslání ke schválení a po schválení je zamčená). */
export const canEditOrder = (status: string) => status === "draft";

/** Povolené přechody stavu; přechod do `pending`/`approved` provádí schvalování, ne uživatel přímo. */
const FLOW: Record<OrderStatus, readonly OrderStatus[]> = {
  draft: ["pending", "approved", "cancelled"],
  pending: ["approved", "draft"],
  approved: ["received", "cancelled", "draft"],
  received: [],
  cancelled: [],
};
export const canTransition = (from: string, to: OrderStatus) =>
  (FLOW[from as OrderStatus] ?? []).includes(to);

/** Porovnání faktury s objednávkou: faktura nad objednanou částku je varování, pod ní informace. */
export function compareWithOrder(orderNetMinor: number, invoicedNetMinor: number) {
  const diff = invoicedNetMinor - orderNetMinor;
  return {
    diffMinor: diff,
    state: diff > 0 ? ("over" as const) : diff < 0 ? ("under" as const) : ("match" as const),
  };
}
