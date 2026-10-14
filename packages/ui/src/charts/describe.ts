import { formatValue } from "@rebar/core/dashboards-shared";
import { seriesColor, seriesShape } from "./series";
import type { ChartTooltipRow } from "./chart-tooltip";
import type { ChartCategory, ChartSeries, ChartValueFormat } from "./types";

/** Řádky tooltipu pro kategorii `i`: hodnoty všech řad (u skládaného grafu i součet). */
export function categoryRows(
  i: number,
  series: ChartSeries[],
  format: ChartValueFormat,
  withTotal: boolean,
  colorOverride?: string,
): ChartTooltipRow[] {
  const rows: ChartTooltipRow[] = series.map((s, si) => ({
    key: s.key,
    label: s.label,
    value: formatValue(format, s.values[i] ?? null),
    color: series.length === 1 && colorOverride ? colorOverride : seriesColor(si),
    shape: seriesShape(si),
  }));
  if (withTotal && series.length > 1) {
    const total = series.reduce((a, s) => a + (s.values[i] ?? 0), 0);
    rows.push({ key: "__total", label: "Celkem", value: formatValue(format, total), total: true });
  }
  return rows;
}

/** Věta pro čtečku obrazovky: „Leden: Tržby 1 200 Kč; Náklady 900 Kč“. */
export function describeCategory(category: ChartCategory, rows: ChartTooltipRow[]): string {
  return `${category.label}: ${rows.map((r) => `${r.label} ${r.value}`).join("; ")}`;
}
