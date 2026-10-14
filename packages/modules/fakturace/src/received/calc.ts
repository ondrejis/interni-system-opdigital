/**
 * Čistá logika přijatých faktur (bez databáze a Reactu): stavy, DPH a kontrola součtů řádků proti hlavičce,
 * duplicita, splatnost. Částky v haléřích; do nákladů zakázky vstupuje vždy základ bez DPH.
 */

export type ReceivedState = "draft" | "pending" | "approved" | "rejected" | "paid";

export const RECEIVED_STATES: readonly { key: ReceivedState; label: string; color: string }[] = [
  { key: "draft", label: "Koncept", color: "gray" },
  { key: "pending", label: "Ke schválení", color: "yellow" },
  { key: "approved", label: "Schváleno", color: "blue" },
  { key: "rejected", label: "Zamítnuto", color: "red" },
  { key: "paid", label: "Uhrazeno", color: "green" },
];
export const receivedState = (k: string) =>
  RECEIVED_STATES.find((s) => s.key === k) ?? RECEIVED_STATES[0]!;

/** Upravit jde jen koncept a zamítnutá faktura; schválená a uhrazená je zamčená. */
export const canEditReceived = (state: string) => state === "draft" || state === "rejected";

/** Stavy, ve kterých faktura tvoří skutečné náklady zakázky. */
export const COST_STATES: readonly string[] = ["approved", "paid"];

export const VAT_MODES = [
  { key: "standard", label: "Běžné DPH" },
  { key: "reverse_charge", label: "Přenesená daňová povinnost (DPH přiznává příjemce)" },
] as const;

/** Klíč pro hledání duplicit: číslo dokladu bez mezer a velikosti písmen. */
export const dedupKey = (number: string) => number.replace(/\s+/g, "").toLowerCase();

/** Sazba DPH v setinách procenta → DPH řádku (půl nahoru). */
export function vatOf(netMinor: number, vatRateBp: number, vatMode: string): number {
  if (vatMode === "reverse_charge") return 0;
  const raw = (netMinor * vatRateBp) / 10_000;
  return Math.sign(raw) * Math.round(Math.abs(raw));
}

export type LineIn = { netMinor: number; vatRateBp: number };
export type LineTotals = { netMinor: number; vatMinor: number; grossMinor: number };

export function lineTotals(l: LineIn, vatMode: string): LineTotals {
  const vatMinor = vatOf(l.netMinor, l.vatRateBp, vatMode);
  return { netMinor: l.netMinor, vatMinor, grossMinor: l.netMinor + vatMinor };
}

export function sumLines(lines: readonly LineIn[], vatMode: string): LineTotals {
  let net = 0;
  let vat = 0;
  for (const l of lines) {
    const t = lineTotals(l, vatMode);
    net += t.netMinor;
    vat += t.vatMinor;
  }
  return { netMinor: net, vatMinor: vat, grossMinor: net + vat };
}

/** DPH hlavičky je rozdíl celkem − základ; u přenesené daňové povinnosti nula (doklad je bez DPH). */
export function headerVat(netMinor: number, grossMinor: number, vatMode: string): number {
  return vatMode === "reverse_charge" ? 0 : grossMinor - netMinor;
}

/**
 * Kontrola faktury před odesláním ke schválení: řádky musí sedět na hlavičku (základ), částka nesmí být nulová,
 * celkem nemůže být menší než základ u kladné faktury. Vrací českou větu s důvodem, nebo `null`.
 */
export function checkReceived(
  h: { netMinor: number; grossMinor: number; vatMode: string },
  lines: readonly LineIn[],
  fmt: (n: number) => string = (n) => String(n / 100),
): string | null {
  if (!lines.length) return "Faktura nemá žádné řádky. Rozepište ji aspoň na jeden oddíl rozpočtu.";
  if (h.netMinor === 0) return "Základ faktury nesmí být nula.";
  const s = sumLines(lines, h.vatMode);
  if (s.netMinor !== h.netMinor)
    return `Součet řádků (${fmt(s.netMinor)}) se musí rovnat základu faktury (${fmt(h.netMinor)}), rozdíl ${fmt(h.netMinor - s.netMinor)}.`;
  if (h.vatMode === "standard" && Math.sign(h.grossMinor) !== Math.sign(h.netMinor))
    return "Celková částka musí mít stejné znaménko jako základ.";
  if (h.vatMode === "standard" && Math.abs(h.grossMinor) < Math.abs(h.netMinor))
    return "Celková částka nemůže být nižší než základ.";
  return null;
}

/** Po splatnosti = schválená nebo čekající a neuhrazená faktura s uplynulou splatností. */
export function isOverdue(state: string, dueDate: string | null, today: string): boolean {
  return (state === "approved" || state === "pending") && !!dueDate && dueDate < today;
}
