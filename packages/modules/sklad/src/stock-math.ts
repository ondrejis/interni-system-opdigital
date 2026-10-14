/**
 * Čistá logika skladu bez databáze: převody množství, vážený průměr, slučování řádků.
 * Množství se počítá v tisícinách (celá čísla), takže se na něm nikdy nekumuluje chyba desetinných čísel;
 * jednotkové ceny jsou v haléřích se 4 desetinnými místy a každá částka dokladu se zaokrouhlí na haléře.
 */

export class StockError extends Error {}

export const DOC_TYPES = ["receipt", "issue", "transfer", "return", "adjustment"] as const;
export type StockDocType = (typeof DOC_TYPES)[number];

/** Oprávnění potřebné k zaúčtování dokladu daného typu. */
export const DOC_PERMISSION: Record<StockDocType, string> = {
  receipt: "sklad.write",
  issue: "sklad.issue",
  transfer: "sklad.write",
  return: "sklad.issue",
  adjustment: "sklad.inventory",
};

export const DOC_SERIES: Record<StockDocType, string> = {
  receipt: "sklad.prijemka",
  issue: "sklad.vydejka",
  transfer: "sklad.prevodka",
  return: "sklad.vratka",
  adjustment: "sklad.inventurni-rozdil",
};

export const DOC_TYPE_INFO: Record<
  StockDocType,
  { label: string; short: string; color: string; hint: string }
> = {
  receipt: {
    label: "Příjemka",
    short: "Příjem",
    color: "green",
    hint: "Materiál od dodavatele na sklad",
  },
  issue: {
    label: "Výdejka na zakázku",
    short: "Výdej",
    color: "orange",
    hint: "Materiál ze skladu nebo z auta na stavbu",
  },
  transfer: {
    label: "Převodka",
    short: "Převod",
    color: "blue",
    hint: "Mezi umístěními, např. ze skladu do dodávky",
  },
  return: {
    label: "Vratka ze zakázky",
    short: "Vratka",
    color: "purple",
    hint: "Nespotřebovaný materiál zpět na sklad",
  },
  adjustment: {
    label: "Inventurní rozdíl",
    short: "Inventura",
    color: "gray",
    hint: "Oprava stavu podle skutečnosti",
  },
};

export const WAREHOUSE_KINDS = [
  { value: "warehouse", label: "Sklad" },
  { value: "workshop", label: "Dílna" },
  { value: "vehicle", label: "Vozidlo" },
  { value: "site", label: "Stavba" },
] as const;

export const ORDER_STATUSES = [
  { value: "draft", label: "Koncept", color: "gray" },
  { value: "sent", label: "Objednáno", color: "blue" },
  { value: "partial", label: "Částečně přijato", color: "yellow" },
  { value: "received", label: "Přijato", color: "green" },
  { value: "cancelled", label: "Zrušeno", color: "red" },
] as const;

export const UNITS = ["ks", "m", "m²", "m³", "kg", "t", "l", "bal", "pal", "sada", "role", "pytel"];

/** `"12.5"` → `12500`. Víc než tři desetinná místa se zaokrouhlí; nečíselný vstup je chyba. */
export function toMilli(value: string | number): number {
  const n = typeof value === "number" ? value : Number(String(value).trim().replace(",", "."));
  if (!Number.isFinite(n)) throw new StockError("Množství není číslo.");
  return Math.round(n * 1000);
}

/** `12500` → `"12.500"` (tvar pro sloupec `numeric(14,3)`). */
export function fromMilli(milli: number): string {
  const sign = milli < 0 ? "-" : "";
  const abs = Math.abs(Math.round(milli));
  return `${sign}${Math.floor(abs / 1000)}.${String(abs % 1000).padStart(3, "0")}`;
}

/** `"12.500"` → `"12,5"` (zobrazení bez zbytečných nul). */
export function formatQty(value: string | number): string {
  return Number(value).toLocaleString("cs-CZ", { maximumFractionDigits: 3 });
}

/** Zaokrouhlí na `d` desetinných míst. */
export const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

/**
 * Vážený průměr ceny po příjmu: (zásoba × průměr + příjem × cena) / (zásoba + příjem).
 * Záporná nebo nulová zásoba se do průměru nezapočítá (nový průměr je cena příjmu).
 */
export function weightedAverage(
  stockMilli: number,
  avgCost: number,
  receivedMilli: number,
  price: number,
): number {
  if (stockMilli <= 0) return round(price);
  return round((stockMilli * avgCost + receivedMilli * price) / (stockMilli + receivedMilli));
}

/** Hodnota řádku v haléřích. */
export function lineTotalMinor(qtyMilli: number, unitCost: number): number {
  return Math.round((qtyMilli * unitCost) / 1000);
}

export type RawLine = { itemId: string; qty: string | number; unitPriceMinor?: number | null };
export type MergedLine = { itemId: string; qtyMilli: number; unitPriceMinor: number | null };

/**
 * Sloučí řádky se stejnou položkou (pořadí podle prvního výskytu). Nulové řádky vynechá.
 * Mimo inventurní rozdíl musí být množství kladné.
 */
export function mergeLines(type: StockDocType, lines: readonly RawLine[]): MergedLine[] {
  const merged = new Map<string, MergedLine>();
  for (const l of lines) {
    const qtyMilli = toMilli(l.qty);
    if (qtyMilli === 0) continue;
    if (type !== "adjustment" && qtyMilli < 0) throw new StockError("Množství musí být kladné.");
    const cur = merged.get(l.itemId);
    merged.set(l.itemId, {
      itemId: l.itemId,
      qtyMilli: (cur?.qtyMilli ?? 0) + qtyMilli,
      unitPriceMinor: l.unitPriceMinor ?? cur?.unitPriceMinor ?? null,
    });
  }
  const out = [...merged.values()].filter((l) => l.qtyMilli !== 0);
  if (!out.length) throw new StockError("Zadejte množství alespoň u jedné položky.");
  return out;
}

/** Kontrola tvaru dokladu před zaúčtováním (bez databáze). */
export function assertDocShape(d: {
  type: StockDocType;
  warehouseId: string;
  targetWarehouseId?: string | null;
  jobId?: string | null;
  supplierId?: string | null;
}): void {
  if (d.type === "transfer" && (!d.targetWarehouseId || d.targetWarehouseId === d.warehouseId))
    throw new StockError("Vyberte cílové umístění (jiné než zdrojové).");
  if ((d.type === "issue" || d.type === "return") && !d.jobId)
    throw new StockError("Výdejka i vratka musí mít zakázku.");
  if (d.type === "receipt" && !d.supplierId) throw new StockError("Vyberte dodavatele.");
}

/** Zda doklad dané položky ubírá ze zdrojového umístění. */
export function isOutgoing(type: StockDocType, qtyMilli: number): boolean {
  return type === "issue" || type === "transfer" || (type === "adjustment" && qtyMilli < 0);
}
