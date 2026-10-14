import { addMonthsIso, diffDaysIso } from "@rebar/core/time";

/**
 * Čistá logika vozového parku bez databáze: číselníky, termíny, servisní intervaly, spotřeba a kontrola zápisů.
 * Stavy tachometru jsou čísla (jedno desetinné místo); datum je vždy `YYYY-MM-DD` a „dnes“ se předává zvenku.
 */

export class FleetError extends Error {}

export const ASSET_KINDS = [
  { value: "car", label: "Osobní auto", meter: "km" },
  { value: "van", label: "Dodávka", meter: "km" },
  { value: "truck", label: "Nákladní auto", meter: "km" },
  { value: "excavator", label: "Bagr", meter: "mth" },
  { value: "loader", label: "Nakladač", meter: "mth" },
  { value: "roller", label: "Válec", meter: "mth" },
  { value: "trailer", label: "Přívěs", meter: "km" },
  { value: "small", label: "Malá mechanizace", meter: "mth" },
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number]["value"];
export const ASSET_KIND_VALUES = ASSET_KINDS.map((k) => k.value) as [AssetKind, ...AssetKind[]];
export const kindLabel = (v: string) => ASSET_KINDS.find((k) => k.value === v)?.label ?? v;

/** Má SPZ → hlídá se STK a povinné ručení (u přívěsu bez dálniční známky). */
export const hasRegistration = (kind: string) => ["car", "van", "truck", "trailer"].includes(kind);

export const FUELS = [
  { value: "diesel", label: "Nafta" },
  { value: "petrol", label: "Benzín" },
  { value: "lpg", label: "LPG" },
  { value: "electric", label: "Elektro" },
  { value: "none", label: "Bez paliva" },
] as const;
export const FUEL_VALUES = FUELS.map((f) => f.value) as [string, ...string[]];

export const ASSET_STATUSES = [
  { value: "active", label: "V provozu", color: "green" },
  { value: "service", label: "V servisu", color: "orange" },
  { value: "retired", label: "Vyřazeno", color: "gray" },
] as const;

export const SERVICE_KINDS = [
  { value: "service", label: "Pravidelný servis" },
  { value: "repair", label: "Oprava" },
  { value: "tires", label: "Pneumatiky" },
  { value: "inspection", label: "STK / emise" },
  { value: "other", label: "Ostatní" },
] as const;
export const SERVICE_KIND_VALUES = SERVICE_KINDS.map((k) => k.value) as [string, ...string[]];

export const meterUnit = (meter: string) => (meter === "mth" ? "mth" : "km");

export function formatMeter(value: number | string | null | undefined, meter: string): string {
  if (value === null || value === undefined) return "—";
  return `${Number(value).toLocaleString("cs-CZ", { maximumFractionDigits: meter === "mth" ? 1 : 0 })} ${meterUnit(meter)}`;
}

const plural = (n: number, one: string, few: string, many: string) =>
  n === 1 ? one : n >= 2 && n <= 4 ? few : many;

export type Tone = "none" | "overdue" | "soon" | "ok";

/** Stav termínu (STK, pojištění…): po termínu / do 30 dní / v pořádku. */
export function deadlineState(
  date: string | null | undefined,
  today: string,
): { tone: Tone; days: number | null; text: string } {
  if (!date) return { tone: "none", days: null, text: "nezadáno" };
  const days = diffDaysIso(today, date);
  if (days < 0)
    return {
      tone: "overdue",
      days,
      text: `prošlo před ${-days} ${-days === 1 ? "dnem" : "dny"}`,
    };
  if (days <= 30)
    return {
      tone: "soon",
      days,
      text: days === 0 ? "dnes" : `za ${days} ${plural(days, "den", "dny", "dní")}`,
    };
  return { tone: "ok", days, text: `za ${days} dní` };
}

export const DEADLINES = [
  { key: "stkDate", label: "STK a emise", skipTrailer: false },
  { key: "insuranceDate", label: "Povinné ručení", skipTrailer: false },
  { key: "vignetteDate", label: "Dálniční známka", skipTrailer: true },
] as const;
export type DeadlineKey = (typeof DEADLINES)[number]["key"];

/** Termíny, které se u daného druhu hlídají. */
export const deadlinesFor = (kind: string) =>
  hasRegistration(kind) ? DEADLINES.filter((d) => !(kind === "trailer" && d.skipTrailer)) : [];

/**
 * Spotřeba mezi plnými nádržemi: litry od předchozí plné (bez ní) až po tuto plnou děleno ujetou vzdáleností.
 * Vrací spotřebu u každého tankování, které je plné a má předchozí plné (l/100 km, u strojů l/mth), a průměr.
 * Průměr je vážený ujetou vzdáleností (všechny litry děleno všemi kilometry), ne aritmetický průměr jednotlivých
 * spotřeb: krátký úsek s vysokou spotřebou by jinak zkreslil celek stejně jako dlouhý.
 */
export function consumption<
  T extends { id: string; liters: number; meterValue: number | null; fullTank: boolean },
>(fuel: readonly T[], meter: string): { perFuel: Map<string, number>; avg: number | null } {
  const sorted = fuel
    .filter((f) => f.meterValue !== null)
    .sort((a, b) => a.meterValue! - b.meterValue!);
  const perFuel = new Map<string, number>();
  let lastFull: T | null = null;
  let liters = 0;
  let totalLiters = 0;
  let totalDist = 0;
  for (const f of sorted) {
    liters += f.liters;
    if (!f.fullTank) continue;
    if (lastFull) {
      const dist = f.meterValue! - lastFull.meterValue!;
      if (dist > 0) {
        perFuel.set(f.id, meter === "mth" ? liters / dist : (liters / dist) * 100);
        totalLiters += liters;
        totalDist += dist;
      }
    }
    lastFull = f;
    liters = 0;
  }
  const avg =
    totalDist > 0
      ? meter === "mth"
        ? totalLiters / totalDist
        : (totalLiters / totalDist) * 100
      : null;
  return { perFuel, avg };
}

export const consumptionUnit = (meter: string) => (meter === "mth" ? "l/mth" : "l/100 km");

export type IntervalInput = {
  everyMeter: number | null;
  everyMonths: number | null;
  lastDate: string | null;
  lastMeter: number | null;
};
export type IntervalDue = {
  meterLeft: number | null;
  daysLeft: number | null;
  dueDate: string | null;
  tone: "overdue" | "soon" | "ok";
};

/** Kdy je servisní interval na řadě: podle stavu tachometru nebo data, co nastane dřív. */
export function intervalDue(iv: IntervalInput, meterValue: number, today: string): IntervalDue {
  const meterLeft =
    iv.everyMeter && iv.lastMeter !== null ? iv.lastMeter + iv.everyMeter - meterValue : null;
  let daysLeft: number | null = null;
  let dueDate: string | null = null;
  if (iv.everyMonths && iv.lastDate) {
    dueDate = addMonthsIso(iv.lastDate, iv.everyMonths);
    daysLeft = diffDaysIso(today, dueDate);
  }
  const overdue = (meterLeft !== null && meterLeft < 0) || (daysLeft !== null && daysLeft < 0);
  const soon =
    !overdue &&
    ((meterLeft !== null && meterLeft <= (iv.everyMeter ?? 0) * 0.1) ||
      (daysLeft !== null && daysLeft <= 30));
  return { meterLeft, daysLeft, dueDate, tone: overdue ? "overdue" : soon ? "soon" : "ok" };
}

/** „zbývá 320 km“, „překročeno o 40 mth“, „za 12 dní“: to, co je u intervalu naléhavější. */
export function intervalText(due: IntervalDue, meter: string): string {
  const byMeter =
    due.meterLeft !== null
      ? due.meterLeft < 0
        ? `překročeno o ${formatMeter(-due.meterLeft, meter)}`
        : `zbývá ${formatMeter(due.meterLeft, meter)}`
      : null;
  const byDate =
    due.daysLeft !== null
      ? due.daysLeft < 0
        ? `po termínu ${-due.daysLeft} ${-due.daysLeft === 1 ? "den" : plural(-due.daysLeft, "den", "dny", "dní")}`
        : `za ${due.daysLeft} ${plural(due.daysLeft, "den", "dny", "dní")}`
      : null;
  if (byMeter && byDate)
    return (due.meterLeft ?? 0) < 0 || (due.daysLeft ?? 0) >= 0 ? byMeter : byDate;
  return byMeter ?? byDate ?? "";
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export type LogInput = {
  meter: string;
  date: string;
  today: string;
  currentMeter: number;
  meterStart: number | null;
  meterEnd: number | null;
  amount: number | null;
  private: boolean;
  purpose: string | null;
  jobId: string | null;
};

/** Zkontroluje zápis do knihy jízd / provozu a vrátí ujeté km nebo odpracované motohodiny. */
export function checkLog(i: LogInput): number {
  const unit = i.meter === "mth" ? "motohodin" : "km";
  let amount = i.amount;
  if (i.meterStart !== null && i.meterEnd !== null) {
    if (i.meterEnd <= i.meterStart)
      throw new FleetError("Konečný stav musí být vyšší než počáteční.");
    amount = round1(i.meterEnd - i.meterStart);
  }
  if (!amount || amount <= 0) throw new FleetError(`Zadejte stav tachometru nebo počet ${unit}.`);
  if (i.meter === "km" && amount > 1500)
    throw new FleetError("Více než 1 500 km za den? Zkontrolujte stav tachometru.");
  if (i.meter === "mth" && amount > 24)
    throw new FleetError("Stroj nemůže běžet víc než 24 motohodin denně.");
  // zápis za dnešek, který navazuje na poslední, nesmí jít pod známý stav
  if (i.meterStart !== null && i.date >= i.today && i.meterStart < i.currentMeter - 0.01)
    throw new FleetError(
      `Počáteční stav ${formatMeter(i.meterStart, i.meter)} je nižší než poslední známý ${formatMeter(i.currentMeter, i.meter)}.`,
    );
  if (!i.private && !i.purpose && !i.jobId)
    throw new FleetError("U služební jízdy vyplňte účel nebo zakázku.");
  return amount;
}

/** Kontrola tankování: stroj tankuje, litry sedí na nádrž a je zadaný stav tachometru. */
export function checkFuel(i: {
  fuel: string;
  meter: string;
  tankLiters: number | null;
  liters: number;
  meterValue: number | null;
  /** Datum tankování, „dnes“ a poslední známý stav stroje; bez nich se pořadí stavů nekontroluje. */
  date?: string;
  today?: string;
  currentMeter?: number;
}): void {
  if (i.fuel === "none" || i.fuel === "electric") throw new FleetError("Tento stroj netankuje.");
  if (i.tankLiters && i.liters > i.tankLiters * 1.1)
    throw new FleetError(`Nádrž má ${i.tankLiters} l, zkontrolujte množství.`);
  if (i.meterValue === null)
    throw new FleetError(
      `Zadejte stav ${i.meter === "mth" ? "motohodin" : "tachometru"}, bez něj nejde spočítat spotřeba.`,
    );
  // jako v knize jízd: tankování za dnešek nesmí jít pod známý stav (opravu stavu zapíše správce na kartě stroje)
  if (
    i.date !== undefined &&
    i.today !== undefined &&
    i.currentMeter !== undefined &&
    i.date >= i.today &&
    i.meterValue < i.currentMeter - 0.01
  )
    throw new FleetError(
      `Stav ${formatMeter(i.meterValue, i.meter)} je nižší než poslední známý ${formatMeter(i.currentMeter, i.meter)}. Zkontrolujte ho; opravu stavu ${i.meter === "mth" ? "motohodin" : "tachometru"} zapisuje správce na kartě stroje.`,
    );
}

/** Cena paliva bez DPH z částky na účtence (v haléřích). */
export const netOfVat = (grossMinor: number, vatRate: number) =>
  Math.round(grossMinor / (1 + vatRate / 100));

/** Nejhorší tón ze seznamu (pro odznak na kartě). */
export function worstTone(tones: readonly Tone[]): Tone {
  for (const t of ["overdue", "soon", "ok"] as const) if (tones.includes(t)) return t;
  return "none";
}
