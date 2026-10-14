/** Částka s měnou v textu (výstup `formatMinor`: „12 500 Kč“, „+206 000 Kč“, „1 234,50 Kč“). */
const MONEY_AMOUNT = /[:,]?\s*[+\-−]?\d[\d\s\u00a0\u202f]*(?:[.,]\d+)?\s*(?:Kč|CZK|EUR|USD|€)/gi;

/**
 * Oprávnění, kterému patří peníze v textech upozornění: kdo nemá žádné z nich (mistr, montér), částky neuvidí.
 * Odpovídá pravidlu zakázek (`zakazky.economics`) a faktur (`fakturace.read`).
 */
export const MONEY_PERMISSIONS: readonly string[] = ["zakazky.economics", "fakturace.read"];

/** Text bez částek: „VP-1 Odsávání: +52 000 Kč“ → „VP-1 Odsávání“, „K fakturaci 393 960 Kč“ → „K fakturaci“. */
export function stripMoney(text: string): string {
  return text
    .replace(MONEY_AMOUNT, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export const hasMoney = (text: string | null | undefined): boolean =>
  !!text && new RegExp(MONEY_AMOUNT.source, "i").test(text);
