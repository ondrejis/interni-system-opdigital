"use client";

import { useMemo } from "react";
import { cn } from "../lib/cn";
import { useIsMobile } from "../hooks/use-media";
import { ChartHit } from "./chart-hit";
import { ChartLegend } from "./chart-legend";
import { ChartDataTable, ChartEmpty } from "./chart-parts";
import { ChartTooltip } from "./chart-tooltip";
import { categoryRows, describeCategory } from "./describe";
import { markerPath } from "./geometry";
import { layoutLine } from "./line-layout";
import { seriesColor, seriesShape } from "./series";
import type { ChartCategory, ChartSeries, ChartValueFormat } from "./types";
import { useChartCursor } from "./use-chart-cursor";
import { COARSE_PHONE_QUERY, useElementWidth } from "./use-element-width";

export type LineChartProps = {
  /** Kategorie jsou chronologické (den, týden, měsíc); osa X přeskakuje popisky podle místa. */
  categories: ChartCategory[];
  series: ChartSeries[];
  /** Plošný graf: pod čárou jemná výplň. */
  area?: boolean;
  format: ChartValueFormat;
  height?: number;
  ariaLabel: string;
  className?: string;
};

/** Hustota, od které se značky kreslí jen u aktivního a posledního bodu. */
const MARKERS_MAX_POINTS = 24;

/**
 * Čárový nebo plošný graf časové řady. Čára se přeruší u `null`. Najetí i fokus na kategorii ukáže svislici
 * a v tooltipu hodnoty všech řad; mezi kategoriemi se chodí šipkami.
 */
export function LineChart({
  categories,
  series,
  area = false,
  format,
  height,
  ariaLabel,
  className,
}: LineChartProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const coarse = useIsMobile(COARSE_PHONE_QUERY);
  const fontSize = coarse ? 13 : 11.5;
  const cursor = useChartCursor(categories.length, ref);

  const layout = useMemo(
    () => layoutLine({ categories, series, area, format, width, height, fontSize }),
    [categories, series, area, format, width, height, fontSize],
  );

  if (layout.empty)
    return <ChartEmpty height={layout.height} ariaLabel={ariaLabel} className={className} />;

  const active = cursor.active;
  const activeCat = active !== null ? categories[active] : undefined;
  const activeX = active !== null ? layout.xs[active] : undefined;
  const dense = categories.length > MARKERS_MAX_POINTS;
  const areaOpacity = series.length > 1 ? 0.08 : 0.12;

  // Svislice a tooltip jsou u nejvyššího bodu kategorie.
  let tipY = layout.plot.y + layout.plot.h;
  if (active !== null) {
    for (const l of layout.lines) {
      const p = l.points.find((q) => q.category === active);
      if (p) tipY = Math.min(tipY, p.y);
    }
  }

  const marker = (si: number, x: number, y: number, r: number, key: string) => (
    <path
      key={key}
      d={markerPath(seriesShape(si), x, y, r)}
      data-mark="point"
      style={{ fill: seriesColor(si), stroke: "var(--bg)", strokeWidth: 4, paintOrder: "stroke" }}
    />
  );

  return (
    <div ref={ref} className={cn("relative w-full min-w-0", className)}>
      <svg
        role="img"
        aria-label={ariaLabel}
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        className="block max-w-full select-none tabular-nums"
        fontSize={fontSize}
      >
        <g aria-hidden>
          {layout.ticks.map((t) => (
            <g key={t.value}>
              <line
                x1={layout.plot.x}
                x2={layout.plot.x + layout.plot.w}
                y1={t.pos}
                y2={t.pos}
                className={t.value === 0 ? "stroke-line-strong" : "stroke-line"}
                strokeWidth={1}
                shapeRendering="crispEdges"
              />
              <text
                x={layout.plot.x - 6}
                y={t.pos + fontSize * 0.35}
                textAnchor="end"
                className="fill-faint"
              >
                {t.label}
              </text>
            </g>
          ))}
          {layout.labels.map((l) => (
            <text
              key={l.index}
              x={l.x}
              y={layout.plot.y + layout.plot.h + fontSize + 6}
              textAnchor={l.anchor}
              className="fill-muted"
            >
              {l.text}
            </text>
          ))}

          {activeX !== undefined && (
            <line
              x1={activeX}
              x2={activeX}
              y1={layout.plot.y}
              y2={layout.plot.y + layout.plot.h}
              className="stroke-line-strong"
              strokeWidth={1}
              shapeRendering="crispEdges"
            />
          )}

          {area &&
            layout.lines.map(
              (l) =>
                l.area && (
                  <path
                    key={`a${l.series}`}
                    d={l.area}
                    data-mark="area"
                    style={{ fill: seriesColor(l.series), fillOpacity: areaOpacity }}
                  />
                ),
            )}
          {layout.lines.map(
            (l) =>
              l.d && (
                <path
                  key={`l${l.series}`}
                  d={l.d}
                  data-mark="line"
                  fill="none"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  style={{ stroke: seriesColor(l.series) }}
                />
              ),
          )}
          {layout.lines.map((l) => {
            const last = l.points[l.points.length - 1];
            const shown = dense ? [...l.isolated, ...(last ? [last] : [])] : l.points;
            return shown.map((p) => marker(l.series, p.x, p.y, 4, `m${l.series}-${p.category}`));
          })}
          {active !== null &&
            layout.lines.map((l) => {
              const p = l.points.find((q) => q.category === active);
              return p ? marker(l.series, p.x, p.y, 5, `h${l.series}`) : null;
            })}
        </g>

        {categories.map((c, i) => {
          const x = layout.xs[i] ?? 0;
          const w = layout.hitWidth;
          const rows = categoryRows(i, series, format, false);
          return (
            <ChartHit
              key={c.key}
              label={describeCategory(c, rows)}
              href={c.href}
              {...cursor.hitProps(i)}
            >
              <rect
                x={Math.max(0, x - w / 2)}
                y={layout.plot.y}
                width={w}
                height={layout.plot.h}
                fill="transparent"
              />
            </ChartHit>
          );
        })}
      </svg>

      {activeCat && activeX !== undefined && (
        <ChartTooltip
          x={activeX}
          y={tipY}
          width={layout.width}
          title={activeCat.label}
          rows={categoryRows(active!, series, format, false)}
        />
      )}

      {series.length > 1 && (
        <ChartLegend
          className="mt-2"
          items={series.map((s, i) => ({
            key: s.key,
            label: s.label,
            color: seriesColor(i),
            shape: seriesShape(i),
          }))}
        />
      )}

      <ChartDataTable caption={ariaLabel} categories={categories} series={series} format={format} />
    </div>
  );
}
