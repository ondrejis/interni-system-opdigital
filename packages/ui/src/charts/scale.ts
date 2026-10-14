import { formatCompact, formatValue } from "@rebar/core/dashboards-shared";
import type { ChartValueFormat } from "./types";

// Čisté funkce pro osy a škálování. Bez Reactu, aby šly testovat samostatně.

const round12 = (v: number) => Number(v.toPrecision(12));

export type NiceScale = {
  /** Spodní a horní mez osy (zaokrouhlené na krok). */
  min: number;
  max: number;
  step: number;
  /** Hodnoty „hezkých“ značek od min po max včetně. */
  ticks: number[];
};

/** Kroky osy minut, které dávají smysl v čase (15 min, půl hodiny, hodiny). */
const MINUTE_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 180, 240, 360, 480, 600];

/** Nejbližší „hezký“ krok (1, 2, 5 × 10^k) nad `raw`; u minut navíc časové kroky. */
export function niceStep(raw: number, unit: "decimal" | "minutes" = "decimal"): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  if (unit === "minutes") {
    if (raw <= 600) return MINUTE_STEPS.find((s) => s >= raw - 1e-9) ?? 600;
    return round12(niceStep(raw / 60) * 60);
  }
  const exp = Math.floor(Math.log10(raw));
  const f = raw / 10 ** exp;
  const nf = f <= 1 + 1e-9 ? 1 : f <= 2 + 1e-9 ? 2 : f <= 5 + 1e-9 ? 5 : 10;
  return round12(nf * 10 ** exp);
}

export type NiceScaleOptions = {
  /** Cílový počet značek (včetně krajních), 2–10. */
  count?: number;
  /** Osa vždy obsahuje nulu (sloupce a plochy ano). */
  includeZero?: boolean;
  unit?: "decimal" | "minutes";
};

/**
 * Osa s „hezkými“ hodnotami. Zvládá samé nuly, jedinou hodnotu, záporné hodnoty i velké částky v haléřích.
 */
export function niceScale(minV: number, maxV: number, opts: NiceScaleOptions = {}): NiceScale {
  const { includeZero = true, unit = "decimal" } = opts;
  const count = Math.min(10, Math.max(2, Math.round(opts.count ?? 5)));
  let lo = Number.isFinite(minV) ? minV : 0;
  let hi = Number.isFinite(maxV) ? maxV : 1;
  if (lo > hi) [lo, hi] = [hi, lo];
  if (includeZero) {
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
  }
  if (lo === hi) {
    if (lo === 0) hi = unit === "minutes" ? 60 : 1;
    else {
      const pad = Math.abs(lo) * 0.1 || 1;
      lo -= pad;
      hi += pad;
    }
  }
  const step = niceStep((hi - lo) / (count - 1), unit);
  const min = round12(Math.floor(lo / step + 1e-9) * step);
  const max = round12(Math.ceil(hi / step - 1e-9) * step);
  const steps = Math.min(200, Math.max(1, Math.round((max - min) / step)));
  const ticks = Array.from({ length: steps + 1 }, (_, i) => round12(min + i * step));
  return { min, max: ticks[ticks.length - 1] ?? max, step, ticks };
}

/** Lineární zobrazení domény na rozsah; při nulové doméně vrací začátek rozsahu (žádné dělení nulou). */
export function linearScale(d0: number, d1: number, r0: number, r1: number) {
  const span = d1 - d0;
  return (v: number) =>
    span === 0 || !Number.isFinite(v) ? r0 : r0 + ((v - d0) / span) * (r1 - r0);
}

/** Rozsah dat. Skládaný graf sčítá kladné a záporné hodnoty zvlášť; `null` se přeskočí. */
export function valueExtent(
  series: { values: (number | null)[] }[],
  categoryCount: number,
  stacked: boolean,
): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < categoryCount; i++) {
    let pos = 0;
    let neg = 0;
    let any = false;
    for (const s of series) {
      const v = s.values[i];
      if (v === null || v === undefined || !Number.isFinite(v)) continue;
      any = true;
      if (stacked) {
        if (v >= 0) pos += v;
        else neg += v;
      } else {
        min = Math.min(min, v);
        max = Math.max(max, v);
      }
    }
    if (stacked && any) {
      min = Math.min(min, neg);
      max = Math.max(max, pos);
    }
  }
  return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null;
}

export type StackSegment = { start: number; end: number; first: boolean; last: boolean };

/** Segmenty jednoho sloupce: kladné se kladou nahoru od nuly, záporné dolů; `null` a 0 segment nemají. */
export function stackSegments(values: (number | null)[]): (StackSegment | null)[] {
  let pos = 0;
  let neg = 0;
  const out: (StackSegment | null)[] = values.map((v) => {
    if (v === null || !Number.isFinite(v) || v === 0) return null;
    if (v > 0) {
      const seg = { start: pos, end: pos + v, first: pos === 0, last: false };
      pos += v;
      return seg;
    }
    const seg = { start: neg, end: neg + v, first: neg === 0, last: false };
    neg += v;
    return seg;
  });
  let lastPos = -1;
  let lastNeg = -1;
  out.forEach((s, i) => {
    if (!s) return;
    if (s.end > s.start) lastPos = i;
    else lastNeg = i;
  });
  if (out[lastPos]) out[lastPos]!.last = true;
  if (out[lastNeg]) out[lastNeg]!.last = true;
  return out;
}

/** Popisek značky osy. Krátký tvar („1,2 mil.“), ale u jemných kroků přesný, aby se hodnoty nezaokrouhlily na stejné číslo. */
export function axisTickLabel(format: ChartValueFormat, value: number, step: number): string {
  if (format === "minutes") {
    return step % 60 === 0 ? formatCompact(format, value) : formatValue(format, value);
  }
  if (step < 1 && format !== "money") return formatValue(format, value);
  return formatCompact(format, value);
}

/** Zkrátí popisek na `maxChars` znaků s výpustkou. */
export function truncateLabel(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  if (maxChars <= 1) return "…";
  return `${text.slice(0, maxChars - 1).trimEnd()}…`;
}

export type LabelPlan = {
  /** Zobrazuje se každý `step`-tý popisek (počítáno od konce, takže poslední kategorie je vždy vidět). */
  step: number;
  rotate: boolean;
  maxChars: number;
  /** Výška pásu popisků pod osou X. */
  height: number;
};

/**
 * Jak se vejdou popisky kategorií do pásu o šířce `bandWidth`: vodorovně → zkrácené → otočené o 45° → přeskakované.
 * `charWidth` je odhad šířky znaku, `lineHeight` výška řádku popisku.
 */
export function planCategoryLabels(opts: {
  labels: string[];
  bandWidth: number;
  charWidth: number;
  lineHeight: number;
  allowRotate?: boolean;
  /** Nejvyšší počet znaků u zkráceného popisku. */
  maxChars?: number;
}): LabelPlan {
  const { labels, bandWidth, charWidth, lineHeight, allowRotate = true } = opts;
  const cap = opts.maxChars ?? 18;
  const longest = labels.reduce((m, l) => Math.max(m, l.length), 0);
  const horizontalHeight = lineHeight + 4;
  const fits = Math.floor((bandWidth - 6) / charWidth);
  if (longest === 0 || longest <= fits) {
    return { step: 1, rotate: false, maxChars: Math.max(1, longest), height: horizontalHeight };
  }
  // Zkrácení: stačí, když zbude aspoň pár znaků (nebo celý kratší popisek).
  const minReadable = Math.min(longest, 6);
  if (fits >= minReadable) {
    return { step: 1, rotate: false, maxChars: Math.min(cap, fits), height: horizontalHeight };
  }
  const maxChars = Math.min(cap, longest);
  if (allowRotate) {
    // Otočený popisek zabírá vodorovně zhruba výšku řádku / sin 45°.
    const pitch = lineHeight * 1.45;
    const step = Math.max(1, Math.ceil(pitch / Math.max(bandWidth, 1)));
    const rotatedH = Math.ceil(maxChars * charWidth * 0.72) + 8;
    return { step, rotate: true, maxChars, height: rotatedH };
  }
  const step = Math.max(
    1,
    Math.ceil((Math.min(longest, cap) * charWidth + 10) / Math.max(bandWidth, 1)),
  );
  return { step, rotate: false, maxChars: Math.min(cap, longest), height: horizontalHeight };
}

/** Zobrazí se popisek `index` při kroku `step`? Počítá od konce, aby byl poslední vždy vidět. */
export function labelVisible(index: number, count: number, step: number): boolean {
  return (count - 1 - index) % step === 0;
}
