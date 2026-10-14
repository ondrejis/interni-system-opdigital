"use client";

import { useMemo } from "react";
import { cn } from "../lib/cn";
import { useIsMobile } from "../hooks/use-media";
import { layoutBars } from "./bar-layout";
import { ChartHit } from "./chart-hit";
import { ChartLegend } from "./chart-legend";
import { ChartDataTable, ChartEmpty } from "./chart-parts";
import { ChartTooltip } from "./chart-tooltip";
import { categoryRows, describeCategory } from "./describe";
import { seriesColor, seriesShape } from "./series";
import type { ChartCategory, ChartSeries, ChartValueFormat } from "./types";
import { useChartCursor } from "./use-chart-cursor";
import { COARSE_PHONE_QUERY, useElementWidth } from "./use-element-width";

export type BarChartProps = {
  categories: ChartCategory[];
  series: ChartSeries[];
  /** Řady se skládají na sebe (kladné nahoru, záporné dolů). */
  stacked?: boolean;
  /** Vodorovné sloupce: kategorie pod sebou. */
  horizontal?: boolean;
  format: ChartValueFormat;
  /** Celková výška včetně pásu popisků (min. 120). */
  height?: number;
  ariaLabel: string;
  /** Klik / Enter na kategorii. Kategorie s `href` je odkaz. */
  onSelect?: (categoryKey: string) => void;
  className?: string;
};

/**
 * Sloupcový graf: svislý nebo vodorovný, skládaný nebo seskupený (více řad vedle sebe).
 * Šířka se řídí kontejnerem; popisky kategorií se podle místa zkracují, otáčejí nebo přeskakují.
 */
export function BarChart({
  categories,
  series,
  stacked = false,
  horizontal = false,
  format,
  height,
  ariaLabel,
  onSelect,
  className,
}: BarChartProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const coarse = useIsMobile(COARSE_PHONE_QUERY);
  const fontSize = coarse ? 13 : 11.5;
  const cursor = useChartCursor(categories.length, ref);

  const layout = useMemo(
    () => layoutBars({ categories, series, stacked, horizontal, format, width, height, fontSize }),
    [categories, series, stacked, horizontal, format, width, height, fontSize],
  );

  if (layout.empty)
    return <ChartEmpty height={layout.height} ariaLabel={ariaLabel} className={className} />;

  const solo = series.length === 1 && !stacked;
  const active = cursor.active;
  const activeCat = active !== null ? categories[active] : undefined;
  const activeBand = active !== null ? layout.bands[active] : undefined;
  const barFill = (category: number, s: number) =>
    solo ? (categories[category]?.color ?? seriesColor(0)) : seriesColor(s);

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
          {layout.ticks.map((t) =>
            horizontal ? (
              <g key={t.value}>
                <line
                  x1={t.pos}
                  x2={t.pos}
                  y1={layout.plot.y}
                  y2={layout.plot.y + layout.plot.h}
                  className="stroke-line"
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                />
                <text
                  x={t.pos}
                  y={layout.plot.y + layout.plot.h + fontSize + 3}
                  textAnchor="middle"
                  className="fill-faint"
                >
                  {t.label}
                </text>
              </g>
            ) : (
              <g key={t.value}>
                <line
                  x1={layout.plot.x}
                  x2={layout.plot.x + layout.plot.w}
                  y1={t.pos}
                  y2={t.pos}
                  className="stroke-line"
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
            ),
          )}
        </g>

        {activeBand && (
          <rect
            x={activeBand.x}
            y={activeBand.y}
            width={activeBand.w}
            height={activeBand.h}
            style={{ fill: "var(--bg-hover)" }}
            aria-hidden
          />
        )}

        <g aria-hidden>
          {layout.bars.map((b) => (
            <path
              key={b.key}
              d={b.d}
              data-mark="bar"
              data-series={b.series}
              style={{ fill: barFill(b.category, b.series) }}
            />
          ))}
          {/* základna (nula) nad sloupci, aby oddělila kladné od záporných */}
          {horizontal ? (
            <line
              x1={layout.zero}
              x2={layout.zero}
              y1={layout.plot.y}
              y2={layout.plot.y + layout.plot.h}
              className="stroke-line-strong"
              strokeWidth={1}
              shapeRendering="crispEdges"
            />
          ) : (
            <line
              x1={layout.plot.x}
              x2={layout.plot.x + layout.plot.w}
              y1={layout.zero}
              y2={layout.zero}
              className="stroke-line-strong"
              strokeWidth={1}
              shapeRendering="crispEdges"
            />
          )}
          {layout.labels.map((l) => (
            <text
              key={l.index}
              x={l.x}
              y={l.y}
              textAnchor={l.anchor}
              transform={l.rotate ? `rotate(-45 ${l.x} ${l.y})` : undefined}
              className="fill-muted"
            >
              {l.text}
            </text>
          ))}
          {layout.valueLabels.map((l) => (
            <text key={l.index} x={l.x} y={l.y} textAnchor={l.anchor} className="fill-muted">
              {l.text}
            </text>
          ))}
        </g>

        {layout.bands.map((band) => {
          const c = categories[band.index]!;
          const rows = categoryRows(band.index, series, format, stacked, c.color);
          return (
            <ChartHit
              key={c.key}
              label={describeCategory(c, rows)}
              href={c.href}
              onSelect={onSelect ? () => onSelect(c.key) : undefined}
              {...cursor.hitProps(band.index)}
            >
              <rect x={band.x} y={band.y} width={band.w} height={band.h} fill="transparent" />
            </ChartHit>
          );
        })}
      </svg>

      {activeCat && activeBand && (
        <ChartTooltip
          x={activeBand.anchorX}
          y={activeBand.anchorY}
          width={layout.width}
          placement={horizontal ? "side" : "top"}
          title={activeCat.label}
          rows={categoryRows(active!, series, format, stacked, activeCat.color)}
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
