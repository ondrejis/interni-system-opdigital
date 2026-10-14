import { formatShareText } from "./format";
import { SERIES_SHAPES, type SeriesShape } from "./geometry";
import type { DonutSliceInput } from "./types";

/** Počet barev řad v tokenech `--chart-1 … --chart-8`. */
export const CHART_COLOR_COUNT = 8;
/** Neutrální barva pro „Ostatní“ a řady nad 8. */
export const OTHER_COLOR = "var(--chart-other)";

/** Barva řady podle pořadí (token); od 9. řady neutrální šedá, žádné generované odstíny. */
export function seriesColor(index: number): string {
  return index >= 0 && index < CHART_COLOR_COUNT ? `var(--chart-${index + 1})` : OTHER_COLOR;
}

/** Tvar značky řady podle pořadí; 9. a další řada (nebo „Ostatní“) má plochou čárku. */
export function seriesShape(index: number): SeriesShape {
  return SERIES_SHAPES[index] ?? "dash";
}

/** Hodnoty bez NaN a Infinity: neplatné číslo je `null` (mezera). */
export function cleanValues(values: readonly (number | null | undefined)[], length: number) {
  return Array.from({ length }, (_, i) => {
    const v = values[i];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  });
}

export const OTHER_KEY = "__other";

export type PreparedSlice = {
  key: string;
  label: string;
  value: number;
  /** Podíl 0–1 z celku. */
  share: number;
  color: string;
  shape: SeriesShape;
  href?: string;
  isOther: boolean;
};

/**
 * Výřezy koláče: jen kladné hodnoty, největších `maxSlices` zůstane, zbytek se sečte do „Ostatní“.
 * Barva patří výřezu podle pořadí ve vstupu (ne podle velikosti), „Ostatní“ je neutrální.
 */
export function prepareSlices(
  input: DonutSliceInput[],
  maxSlices = CHART_COLOR_COUNT,
  otherLabel = "Ostatní",
): { slices: PreparedSlice[]; total: number } {
  const valid = input
    .map((s, index) => ({ ...s, index }))
    .filter((s) => Number.isFinite(s.value) && s.value > 0);
  const total = valid.reduce((a, s) => a + s.value, 0);
  if (total <= 0) return { slices: [], total: 0 };

  const keep = new Set(
    [...valid]
      .sort((a, b) => b.value - a.value || a.index - b.index)
      .slice(0, maxSlices)
      .map((s) => s.index),
  );
  const kept = valid.filter((s) => keep.has(s.index));
  const rest = valid.filter((s) => !keep.has(s.index));

  let slot = 0;
  const slices: PreparedSlice[] = kept.map((s) => {
    const i = slot++;
    return {
      key: s.key,
      label: s.label,
      value: s.value,
      share: s.value / total,
      color: s.color ?? seriesColor(i),
      shape: seriesShape(i),
      href: s.href,
      isOther: false,
    };
  });
  if (rest.length) {
    const value = rest.reduce((a, s) => a + s.value, 0);
    slices.push({
      key: OTHER_KEY,
      label: otherLabel,
      value,
      share: value / total,
      color: OTHER_COLOR,
      shape: "dash",
      isOther: true,
    });
  }
  return { slices, total };
}

export type GaugeTone = "neutral" | "good" | "warning" | "bad";

export type GaugeState = {
  /** Poměr hodnota / cíl (1 = splněno), `null` když cíl není kladný. */
  ratio: number | null;
  /** Procento zaokrouhlené na celé číslo. */
  pct: number | null;
  tone: GaugeTone;
  over: boolean;
  /** Šířky v % délky pruhu: výplň do cíle, přesah nad cíl a poloha značky cíle. */
  fillPct: number;
  overPct: number;
  markerPct: number;
  /** Textový stav, aby význam nestál jen na barvě. */
  status: string;
};

/**
 * Stav měřidla. Výchozí režim je „cíl“ (víc je lépe): pod 100 % modře, splněno zeleně.
 * U `lowerIsBetter` (rozpočet, limit) je blízko limitu varování a překročení chyba.
 */
export function gaugeState(value: number, target: number, lowerIsBetter = false): GaugeState {
  const v = Number.isFinite(value) ? Math.max(0, value) : 0;
  const t = Number.isFinite(target) ? target : 0;
  if (!(t > 0)) {
    return {
      ratio: null,
      pct: null,
      tone: "neutral",
      over: false,
      fillPct: 0,
      overPct: 0,
      markerPct: 100,
      status: "Cíl není nastaven",
    };
  }
  const ratio = v / t;
  const pct = Math.round(ratio * 100);
  const scaleMax = Math.max(v, t);
  const over = v > t;
  let tone: GaugeTone;
  let status: string;
  if (lowerIsBetter) {
    tone = over ? "bad" : ratio >= 0.8 ? "warning" : "neutral";
    status = over
      ? `Překročeno o ${formatShareText(Math.round((ratio - 1) * 100))}`
      : ratio >= 0.8
        ? "Blízko limitu"
        : "";
  } else {
    tone = ratio >= 1 ? "good" : "neutral";
    status = over
      ? `Překročeno o ${formatShareText(Math.round((ratio - 1) * 100))}`
      : ratio >= 1
        ? "Splněno"
        : "";
  }
  return {
    ratio,
    pct,
    tone,
    over,
    fillPct: (Math.min(v, t) / scaleMax) * 100,
    overPct: over ? ((v - t) / scaleMax) * 100 : 0,
    markerPct: (t / scaleMax) * 100,
    status,
  };
}
