import { n } from "./geometry";
import {
  axisTickLabel,
  labelVisible,
  linearScale,
  niceScale,
  planCategoryLabels,
  truncateLabel,
  valueExtent,
  type NiceScale,
} from "./scale";
import { cleanValues } from "./series";
import type { ChartCategory, ChartSeries, ChartValueFormat } from "./types";

export type LineLayoutInput = {
  categories: ChartCategory[];
  series: ChartSeries[];
  area: boolean;
  format: ChartValueFormat;
  width: number;
  height?: number;
  fontSize: number;
};

export type LinePoint = { x: number; y: number; category: number };
export type LaidLine = {
  series: number;
  /** Čára po souvislých úsecích; `null` hodnota úsek přeruší. */
  d: string;
  /** Plocha pod čárou (jen u `area`). */
  area: string;
  points: LinePoint[];
  /** Body bez sousedů (úsek o jednom bodě): čára by je nevykreslila, proto dostanou značku vždy. */
  isolated: LinePoint[];
};
export type LineLabel = {
  index: number;
  text: string;
  x: number;
  anchor: "start" | "middle" | "end";
};

export type LineLayout = {
  empty: boolean;
  width: number;
  height: number;
  plot: { x: number; y: number; w: number; h: number };
  scale: NiceScale;
  ticks: { value: number; pos: number; label: string }[];
  xs: number[];
  lines: LaidLine[];
  labels: LineLabel[];
  /** Šířka zásahového pásu bodu (rozteč), pro hover a focus. */
  hitWidth: number;
  /** Poloha nuly na ose Y, když je v ose. */
  zero: number | null;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function layoutLine(input: LineLayoutInput): LineLayout {
  const { categories, area, format, fontSize } = input;
  const width = Math.max(120, Math.floor(input.width));
  const height = Math.max(120, Math.round(input.height ?? 240));
  const count = categories.length;
  const series = input.series.map((s) => ({ ...s, values: cleanValues(s.values, count) }));
  const ext = count && series.length ? valueExtent(series, count, false) : null;
  const empty: LineLayout = {
    empty: true,
    width,
    height,
    plot: { x: 0, y: 0, w: width, h: height },
    scale: { min: 0, max: 1, step: 1, ticks: [0, 1] },
    ticks: [],
    xs: [],
    lines: [],
    labels: [],
    hitWidth: 0,
    zero: null,
  };
  if (!ext) return empty;

  const cw = fontSize * 0.58;
  const unit = format === "minutes" ? "minutes" : "decimal";
  // Nula v ose: plochy vždy, čáry když se data od nuly příliš neodlepí (jinak by se průběh zploštil).
  const includeZero = area || (ext.min >= 0 && ext.min <= ext.max * 0.5) || ext.min < 0;
  const top = 10;
  // Poslední popisek osy X sahá půlkou šířky za poslední bod; tak se nemusí posouvat.
  const longest = categories.reduce((m, c) => Math.max(m, c.label.length), 0);
  const right = Math.max(12, Math.ceil((Math.min(longest, 14) * fontSize * 0.58) / 2) + 2);
  const plotH0 = height - top - (fontSize + 14);
  const tickCount = clamp(Math.floor(plotH0 / (fontSize * 3.4)) + 1, 2, 6);
  const scale = niceScale(ext.min, ext.max, { count: tickCount, includeZero, unit });
  const tickLabels = scale.ticks.map((t) => axisTickLabel(format, t, scale.step));
  const left = Math.ceil(tickLabels.reduce((m, l) => Math.max(m, l.length), 0) * cw) + 12;
  const padX = 8;
  const plotW = Math.max(40, width - left - right);
  const spacing = count > 1 ? (plotW - 2 * padX) / (count - 1) : plotW;
  const plan = planCategoryLabels({
    labels: categories.map((c) => c.label),
    bandWidth: spacing,
    charWidth: cw,
    lineHeight: fontSize + 3,
    allowRotate: false,
    maxChars: 14,
  });
  const bottom = fontSize + 14;
  const plotH = Math.max(40, height - top - bottom);
  const yOf = linearScale(scale.min, scale.max, top + plotH, top);
  const xOf = (i: number) => (count > 1 ? left + padX + i * spacing : left + plotW / 2);
  const baseline = yOf(Math.max(scale.min, Math.min(0, scale.max)));

  const lines: LaidLine[] = series.map((s, si) => {
    const points: LinePoint[] = [];
    const runs: LinePoint[][] = [];
    let run: LinePoint[] = [];
    s.values.forEach((v, i) => {
      if (v === null || v === undefined) {
        if (run.length) runs.push(run);
        run = [];
        return;
      }
      const p = { x: n(xOf(i)), y: n(yOf(v)), category: i };
      points.push(p);
      run.push(p);
    });
    if (run.length) runs.push(run);
    const d = runs
      .filter((r) => r.length > 1)
      .map((r) => `M${r.map((p) => `${p.x},${p.y}`).join("L")}`)
      .join("");
    const areaD = area
      ? runs
          .filter((r) => r.length > 1)
          .map((r) => {
            const first = r[0]!;
            const last = r[r.length - 1]!;
            return `M${first.x},${n(baseline)}L${r.map((p) => `${p.x},${p.y}`).join("L")}L${last.x},${n(baseline)}Z`;
          })
          .join("")
      : "";
    const isolated = runs.filter((r) => r.length === 1).map((r) => r[0]!);
    return { series: si, d, area: areaD, points, isolated };
  });

  const labels: LineLabel[] = [];
  categories.forEach((c, i) => {
    if (!labelVisible(i, count, plan.step)) return;
    const text = truncateLabel(c.label, plan.maxChars);
    const x = xOf(i);
    const half = (text.length * cw) / 2;
    const anchor = x - half < 0 ? "start" : x + half > width ? "end" : "middle";
    labels.push({ index: i, text, x: n(x), anchor });
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
    xs: Array.from({ length: count }, (_, i) => n(xOf(i))),
    lines,
    labels,
    hitWidth: n(count > 1 ? spacing : plotW),
    zero: scale.min <= 0 && scale.max >= 0 ? n(yOf(0)) : null,
  };
}
