import { MONEY } from "./security-fixture";

/** Podpisové částky z fixtury a z nich odvozené součty; hledají se v odpovědích jako číslo i jako text s mezerami. */
const SIGNATURES = [
  MONEY.contract,
  MONEY.cost,
  MONEY.sellUnit,
  MONEY.costUnit,
  MONEY.rate,
  MONEY.invoice,
  MONEY.sellUnit * 10,
  MONEY.costUnit * 10,
  MONEY.sellUnit * 5,
  MONEY.cost * 2,
  MONEY.costUnit * 100,
].map(String);
/** Klíče, které jsou svou povahou peníze, sazby a marže (nenulová hodnota = únik). */
const MONEY_KEY = /(minor$|price|cost$|costs$|rate$|margin|marze|sazba|cena$|^hourly|drawdown)/i;

export function findMoney(value: unknown, path = "$"): string[] {
  const out: string[] = [];
  const walk = (v: unknown, p: string, key: string) => {
    if (v === null || v === undefined) return;
    if (typeof v === "number" || typeof v === "bigint") {
      const n = Number(v);
      if (n !== 0 && MONEY_KEY.test(key)) out.push(`${p} = ${n}`);
      else if (SIGNATURES.includes(String(Math.abs(n)))) out.push(`${p} = ${n} (podpisová částka)`);
      return;
    }
    if (typeof v === "string") {
      const digits = v.replace(/[\s\u00a0\u202f.,]/g, "");
      for (const s of SIGNATURES)
        if (digits.includes(s)) out.push(`${p} = "${v.slice(0, 40)}" (podpisová částka)`);
      return;
    }
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${p}[${i}]`, key));
    if (typeof v === "object" && !(v instanceof Date))
      for (const [k, x] of Object.entries(v)) walk(x, `${p}.${k}`, k);
  };
  walk(value, path, "");
  return out;
}

/** Cokoli z cizí zakázky B (id nebo název) v odpovědi pro lidi z týmu A je únik. */
export function findForeign(value: unknown, markers: string[]): string[] {
  const text = JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? Number(v) : v)) ?? "";
  return markers.filter((m) => text.includes(m));
}
