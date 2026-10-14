import { formatValue } from "@rebar/core/dashboards-shared";
import { barPath, n, type RoundEnd } from "./geometry";
import {
  axisTickLabel,
  labelVisible,
  linearScale,
  niceScale,
  planCategoryLabels,
  stackSegments,
  truncateLabel,
  valueExtent,
  type NiceScale,
} from "./scale";
import { cleanValues } from "./series";
import type { ChartCategory, ChartSeries, ChartValueFormat } from "./types";

// Rozložení sloupcového grafu jako čistá funkce: vstup → souřadnice. Komponenta jen kreslí.

export const BAR_RADIUS = 4;
export const BAR_GAP = 2;
const MAX_BAR_SOLO = 32;
const MAX_BAR_GROUPED = 24;

export type BarLayoutInput = {
  categories: ChartCategory[];
  series: ChartSeries[];
  stacked: boolean;
  horizontal: boolean;
  format: ChartValueFormat;
  width: number;
  /** Celková výška včetně pásu popisků; bez ní se odvodí z počtu kategorií. */
  height?: number;
  fontSize: number;
};

export type LaidBar = {
  key: string;
  category: number;
  series: number;
  d: string;
  /** Obdélník sloupce bez zaoblení (pro testy a kotvení). */
  rect: { x: number; y: number; w: number; h: number };
};

export type LaidBand = {
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Kotva tooltipu (střed horního konce sloupce, resp. konec vodorovného sloupce). */
  anchorX: number;
  anchorY: number;
};

export type LaidTick = { value: number; pos: number; label: string };
export type LaidLabel = {
  index: number;
  text: string;
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
  rotate: boolean;
};
export type LaidValueLabel = {
  index: number;
  text: string;
  x: number;
  y: number;
  anchor: "start" | "end";
};

export type BarLayout = {
  empty: boolean;
  width: number;
  height: number;
  plot: { x: number; y: number; w: number; h: number };
  scale: NiceScale;
  ticks: LaidTick[];
  /** Poloha nuly na ose hodnot (y u svislého, x u vodorovného grafu). */
  zero: number;
  bands: LaidBand[];
  bars: LaidBar[];
  labels: LaidLabel[];
  valueLabels: LaidValueLabel[];
};

const EMPTY_SCALE: NiceScale = { min: 0, max: 1, step: 1, ticks: [0, 1] };

function emptyLayout(width: number, height: number): BarLayout {
  return {
    empty: true,
    width,
    height,
    plot: { x: 0, y: 0, w: width, h: height },
    scale: EMPTY_SCALE,
    ticks: [],
    zero: 0,
    bands: [],
    bars: [],
    labels: [],
    valueLabels: [],
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function layoutBars(input: BarLayoutInput): BarLayout {
  const { categories, stacked, horizontal, format, fontSize } = input;
  const width = Math.max(120, Math.floor(input.width));
  const count = categories.length;
  const series = input.series.map((s) => ({ ...s, values: cleanValues(s.values, count) }));
  const ext = count && series.length ? valueExtent(series, count, stacked) : null;
  const cw = fontSize * 0.58;
  const lineH = fontSize + 3;
  const unit = format === "minutes" ? "minutes" : "decimal";

  const solo = series.length === 1 && !stacked;
  const defaultHeight = horizontal
    ? count * (stacked || series.length === 1 ? 28 : series.length * 14 + 12) + fontSize + 16
    : 240;
  const height = Math.max(120, Math.round(input.height ?? defaultHeight));
  if (!ext) return emptyLayout(width, height);

  const maxBar = stacked || solo ? MAX_BAR_SOLO : MAX_BAR_GROUPED;
  const nS = series.length;

  /** Šířka sloupce a odsazení ve skupině v pásu o tloušťce `band`. */
  const sizeBars = (band: number) => {
    const per = stacked ? 1 : nS;
    const gap = per > 1 ? (band > 40 ? BAR_GAP : 1) : 0;
    const bar = clamp((band * 0.72 - gap * (per - 1)) / per, 1, maxBar);
    const group = per * bar + (per - 1) * gap;
    return { bar, gap, group, per };
  };

  const bars: LaidBar[] = [];
  const bands: LaidBand[] = [];
  const labels: LaidLabel[] = [];
  const valueLabels: LaidValueLabel[] = [];

  const pushBar = (
    category: number,
    si: number,
    x: number,
    y: number,
    w: number,
    h: number,
    end: RoundEnd,
  ) => {
    bars.push({
      key: `${category}-${si}`,
      category,
      series: si,
      d: barPath(x, y, w, h, BAR_RADIUS, end),
      rect: { x: n(x), y: n(y), w: n(w), h: n(h) },
    });
  };

  /** Pixelový interval segmentu: strana základny se u nenulového začátku odsune o mezeru. */
  const segmentSpan = (p0: number, p1: number, first: boolean) => {
    const dir = Math.sign(p1 - p0) || 1;
    const len = Math.abs(p1 - p0);
    const a = !first && len > BAR_GAP + 1 ? p0 + dir * BAR_GAP : p0;
    return { lo: Math.min(a, p1), hi: Math.max(a, p1), up: dir < 0 };
  };

  if (!horizontal) {
    const top = 8;
    const right = 8;
    const plotH0 = height - top - (fontSize + 14);
    const tickCount = clamp(Math.floor(plotH0 / (fontSize * 3.4)) + 1, 2, 6);
    const scale = niceScale(ext.min, ext.max, { count: tickCount, includeZero: true, unit });
    const tickLabels = scale.ticks.map((t) => axisTickLabel(format, t, scale.step));
    const left = Math.ceil(tickLabels.reduce((m, l) => Math.max(m, l.length), 0) * cw) + 12;
    const plotW = Math.max(40, width - left - right);
    const bandW = plotW / count;
    const plan = planCategoryLabels({
      labels: categories.map((c) => c.label),
      bandWidth: bandW,
      charWidth: cw,
      lineHeight: lineH,
    });
    const bottom = plan.height + 6;
    const plotH = Math.max(40, height - top - bottom);
    const yOf = linearScale(scale.min, scale.max, top + plotH, top);
    const zero = yOf(0);
    const { bar, gap, group } = sizeBars(bandW);

    categories.forEach((c, i) => {
      const bx = left + i * bandW;
      const cx = bx + bandW / 2;
      let tipTop = Infinity;
      let anyValue = false;
      if (stacked) {
        const segs = stackSegments(series.map((s) => s.values[i] ?? null));
        segs.forEach((seg, si) => {
          if (!seg) return;
          const { lo, hi, up } = segmentSpan(yOf(seg.start), yOf(seg.end), seg.first);
          const end: RoundEnd = seg.last ? (up ? "top" : "bottom") : "none";
          pushBar(i, si, cx - bar / 2, lo, bar, Math.max(1, hi - lo), end);
          tipTop = Math.min(tipTop, lo);
          anyValue = true;
        });
      } else {
        series.forEach((s, si) => {
          const v = s.values[i];
          if (v === null || v === undefined) return;
          anyValue = true;
          const yv = yOf(v);
          tipTop = Math.min(tipTop, yv, zero);
          if (v === 0) return;
          const lo = Math.min(yv, zero);
          pushBar(
            i,
            si,
            cx - group / 2 + si * (bar + gap),
            lo,
            bar,
            Math.max(1, Math.abs(zero - yv)),
            v > 0 ? "top" : "bottom",
          );
        });
      }
      bands.push({
        index: i,
        x: n(bx),
        y: n(top),
        w: n(bandW),
        h: n(plotH),
        anchorX: n(cx),
        anchorY: n(anyValue && Number.isFinite(tipTop) ? tipTop : zero),
      });
      if (labelVisible(i, count, plan.step)) {
        const text = truncateLabel(c.label, plan.maxChars);
        labels.push(
          plan.rotate
            ? { index: i, text, x: n(cx + 4), y: n(top + plotH + 10), anchor: "end", rotate: true }
            : {
                index: i,
                text,
                x: n(cx),
                y: n(top + plotH + fontSize + 4),
                anchor: "middle",
                rotate: false,
              },
        );
      }
    });

    return {
      empty: false,
      width,
      height,
      plot: { x: left, y: top, w: plotW, h: plotH },
      scale,
      ticks: scale.ticks.map((value, k) => ({
        value,
        pos: n(yOf(value)),
        label: tickLabels[k] ?? "",
      })),
      zero: n(zero),
      bands,
      bars,
      labels,
      valueLabels,
    };
  }

  // Vodorovný graf: kategorie pod sebou, hodnoty doprava.
  const longest = categories.reduce((m, c) => Math.max(m, c.label.length), 0);
  const labelChars = clamp(Math.floor((width * 0.36) / cw), 6, 24);
  const maxChars = Math.min(longest, labelChars);
  const left = Math.ceil(maxChars * cw) + 14;
  const top = 4;
  const bottom = fontSize + 12;
  const showValues = solo && count <= 14;
  const maxValueChars = showValues
    ? series[0]!.values.reduce<number>(
        (m, v) => (v === null ? m : Math.max(m, formatValue(format, v).length)),
        0,
      )
    : 0;
  const right = showValues ? Math.min(Math.ceil(maxValueChars * cw) + 10, width * 0.4) : 12;
  const plotW = Math.max(40, width - left - right);
  const plotH = Math.max(40, height - top - bottom);
  const rowH = plotH / count;

  let scale = niceScale(ext.min, ext.max, { count: 5, includeZero: true, unit });
  let tickLabels = scale.ticks.map((t) => axisTickLabel(format, t, scale.step));
  const labelW = tickLabels.reduce((m, l) => Math.max(m, l.length), 0) * cw + 18;
  const fitCount = clamp(Math.floor(plotW / labelW) + 1, 2, 6);
  if (fitCount < scale.ticks.length) {
    scale = niceScale(ext.min, ext.max, { count: fitCount, includeZero: true, unit });
    tickLabels = scale.ticks.map((t) => axisTickLabel(format, t, scale.step));
  }
  const xOf = linearScale(scale.min, scale.max, left, left + plotW);
  const zero = xOf(0);
  const { bar, gap, group } = sizeBars(rowH);

  categories.forEach((c, i) => {
    const by = top + i * rowH;
    const cy = by + rowH / 2;
    let tipX = zero;
    let anyValue = false;
    if (stacked) {
      const segs = stackSegments(series.map((s) => s.values[i] ?? null));
      segs.forEach((seg, si) => {
        if (!seg) return;
        const a = xOf(seg.start);
        const b = xOf(seg.end);
        const { lo, hi, up } = segmentSpan(a, b, seg.first);
        // `up` = konec je napravo od základny? Tady platí opačně než u svislého grafu (menší pixel = vlevo).
        const rightward = !up;
        pushBar(
          i,
          si,
          lo,
          cy - bar / 2,
          Math.max(1, hi - lo),
          bar,
          seg.last ? (rightward ? "right" : "left") : "none",
        );
        tipX = Math.abs(b - zero) > Math.abs(tipX - zero) ? b : tipX;
        anyValue = true;
      });
    } else {
      series.forEach((s, si) => {
        const v = s.values[i];
        if (v === null || v === undefined) return;
        anyValue = true;
        const xv = xOf(v);
        if (Math.abs(xv - zero) > Math.abs(tipX - zero)) tipX = xv;
        if (v === 0) return;
        pushBar(
          i,
          si,
          Math.min(xv, zero),
          cy - group / 2 + si * (bar + gap),
          Math.max(1, Math.abs(xv - zero)),
          bar,
          v > 0 ? "right" : "left",
        );
        if (showValues) {
          const text = formatValue(format, v);
          const tw = text.length * cw;
          if (v > 0 && xv + 6 + tw <= width)
            valueLabels.push({
              index: i,
              text,
              x: n(xv + 6),
              y: n(cy + fontSize * 0.35),
              anchor: "start",
            });
          else if (v < 0 && xv - 6 - tw >= left)
            valueLabels.push({
              index: i,
              text,
              x: n(xv - 6),
              y: n(cy + fontSize * 0.35),
              anchor: "end",
            });
        }
      });
    }
    bands.push({
      index: i,
      x: 0,
      y: n(by),
      w: n(width),
      h: n(rowH),
      anchorX: n(anyValue ? tipX : zero),
      anchorY: n(cy),
    });
    labels.push({
      index: i,
      text: truncateLabel(c.label, maxChars),
      x: n(left - 8),
      y: n(cy + fontSize * 0.35),
      anchor: "end",
      rotate: false,
    });
  });

  return {
    empty: false,
    width,
    height,
    plot: { x: left, y: top, w: plotW, h: plotH },
    scale,
    ticks: scale.ticks.map((value, k) => ({
      value,
      pos: n(xOf(value)),
      label: tickLabels[k] ?? "",
    })),
    zero: n(zero),
    bands,
    bars,
    labels,
    valueLabels,
  };
}
