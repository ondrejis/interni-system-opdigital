import { formatMinor } from "@rebar/core/shared";

/** Formátování čísel v rozpočtu (klientský kód). */

export const money = (minor: number | null | undefined) =>
  minor === null || minor === undefined ? "" : formatMinor(minor);

/** Množství „12.500“ → „12,5“. */
export const qty = (q: string | null | undefined) =>
  q === null || q === undefined
    ? ""
    : Number(q).toLocaleString("cs-CZ", { maximumFractionDigits: 3 });

export const pct = (p: number | null | undefined) =>
  p === null || p === undefined
    ? "—"
    : `${p.toLocaleString("cs-CZ", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;

/** Sazba DPH v setinách procenta → „21 %“. */
export const vat = (bp: number) =>
  `${(bp / 100).toLocaleString("cs-CZ", { maximumFractionDigits: 2 })} %`;

/** Text zadaný uživatelem („21“, „12,5 %“) → setiny procenta; `null`, když to není sazba. */
export function parseVat(text: string): number | null {
  const t = text.replace(/[\s%]/g, "").replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return null;
  const bp = Math.round(Number(t) * 100);
  return bp <= 10_000 ? bp : null;
}

export const moneyInput = (minor: number) => String(minor / 100).replace(".", ",");
export const qtyInput = (q: string) => String(Number(q)).replace(".", ",");
export const vatInput = (bp: number) => String(bp / 100).replace(".", ",");

const nf0 = new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Částka bez měny (v záhlaví sloupce je „Kč“): celé koruny, haléře jen když nějaké jsou. */
export const amount = (minor: number) =>
  minor % 100 === 0 ? nf0.format(minor / 100) : nf2.format(minor / 100);

/** České skloňování podle počtu: 1 položka, 2–4 položky, 5 položek. */
export const plural = (n: number, one: string, few: string, many: string) =>
  `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;
