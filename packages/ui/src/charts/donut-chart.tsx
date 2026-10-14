"use client";

import { formatValue } from "@rebar/core/dashboards-shared";
import { useMemo, useState } from "react";
import { cn } from "../lib/cn";
import { ChartHit } from "./chart-hit";
import { ChartLegend } from "./chart-legend";
import { ChartEmpty } from "./chart-parts";
import { ChartTooltip } from "./chart-tooltip";
import { formatShare } from "./format";
import { arcPath, n, polar } from "./geometry";
import { prepareSlices, type PreparedSlice } from "./series";
import type { ChartValueFormat, DonutSliceInput } from "./types";
import { useChartCursor } from "./use-chart-cursor";
import { useElementWidth } from "./use-element-width";

export type DonutChartProps = {
  slices: DonutSliceInput[];
  format: ChartValueFormat;
  /** Prstenec (výchozí) nebo plný koláč. */
  donut?: boolean;
  /** Text uprostřed prstence. Bez něj je to „Celkem“ a součet; prázdný řetězec střed nechá prázdný. */
  centerLabel?: string;
  centerValue?: string;
  ariaLabel: string;
  className?: string;
};

/** Šířka kontejneru, od které je legenda vedle grafu (jinak pod ním). */
const SIDE_LEGEND_MIN = 420;

type Arc = { slice: PreparedSlice; d: string; mid: number };

/** Úhly výřezů; mezi výřezy je 2px mezera v barvě pozadí (zkrácení oblouku, ne obrys). */
export function sliceArcs(
  slices: PreparedSlice[],
  cx: number,
  cy: number,
  ro: number,
  ri: number,
): Arc[] {
  const gap = slices.length > 1 ? 2 / Math.max(1, (ro + ri) / 2) : 0;
  let angle = 0;
  return slices.map((slice) => {
    const a0 = angle;
    const a1 = angle + slice.share * Math.PI * 2;
    angle = a1;
    const span = a1 - a0;
    const g = span > gap * 3 ? gap / 2 : 0;
    return { slice, d: arcPath(cx, cy, ro, ri, a0 + g, a1 - g), mid: (a0 + a1) / 2 };
  });
}

/**
 * Koláč / prstenec. Zobrazí nejvýše 8 největších výřezů, zbytek je „Ostatní“. Legenda ukazuje hodnotu a podíl,
 * takže graf lze číst i bez rozlišování barev. Koláč se hodí na podíl celku u pár položek; na porovnání blízkých
 * hodnot je lepší sloupcový graf.
 */
export function DonutChart({
  slices: input,
  format,
  donut = true,
  centerLabel,
  centerValue,
  ariaLabel,
  className,
}: DonutChartProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const { slices, total } = useMemo(() => prepareSlices(input), [input]);
  const cursor = useChartCursor(slices.length, ref);
  const [legendHover, setLegendHover] = useState<string | null>(null);

  if (!slices.length)
    return <ChartEmpty height={160} ariaLabel={ariaLabel} className={className} />;

  const side = width >= SIDE_LEGEND_MIN;
  const size = Math.round(
    Math.max(120, Math.min(side ? 200 : 220, side ? width * 0.42 : width - 8)),
  );
  const c = size / 2;
  const ro = c - 2;
  const ri = donut ? ro * 0.66 : 0;
  const arcs = sliceArcs(slices, c, c, ro, ri);

  const activeIdx =
    legendHover !== null ? slices.findIndex((s) => s.key === legendHover) : (cursor.active ?? -1);
  const activeSlice = activeIdx >= 0 ? slices[activeIdx] : undefined;

  // Střed prstence: při najetí údaje výřezu, jinak zadaný text nebo součet.
  const showCenter = donut && centerValue !== "" && centerLabel !== "";
  const idleValue = centerValue ?? formatValue(format, total);
  const idleLabel = centerLabel ?? "Celkem";
  const midValue = activeSlice ? formatValue(format, activeSlice.value) : idleValue;
  const midLabel = activeSlice ? activeSlice.label : idleLabel;
  const innerD = ri * 2 * 0.86;
  const valueSize = Math.max(11, Math.min(20, innerD / Math.max(4, midValue.length * 0.6)));

  const tip = activeSlice ? arcs[activeIdx] : undefined;
  const [tipX, tipY] = tip ? polar(c, c, donut ? (ro + ri) / 2 : ro * 0.7, tip.mid) : [0, 0];

  return (
    <div
      ref={ref}
      className={cn(
        "relative flex w-full min-w-0 gap-4",
        side ? "flex-row items-center" : "flex-col items-center",
        className,
      )}
    >
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          role="img"
          aria-label={ariaLabel}
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="block select-none"
        >
          {arcs.map(({ slice, d }, i) => {
            const dim = activeIdx >= 0 && activeIdx !== i;
            return (
              <ChartHit
                key={slice.key}
                label={`${slice.label}: ${formatValue(format, slice.value)} (${formatShare(slice.share)})`}
                href={slice.href}
                {...cursor.hitProps(i)}
              >
                <path
                  d={d}
                  data-mark="slice"
                  style={{ fill: slice.color, opacity: dim ? 0.45 : 1 }}
                />
              </ChartHit>
            );
          })}
          {showCenter && (
            <g aria-hidden className="tabular-nums">
              <text
                x={n(c)}
                y={n(c + valueSize * 0.1)}
                textAnchor="middle"
                fontSize={valueSize}
                fontWeight={600}
                className="fill-fg"
              >
                {midValue}
              </text>
              <text
                x={n(c)}
                y={n(c + valueSize * 0.1 + 14)}
                textAnchor="middle"
                fontSize={11.5}
                className="fill-faint"
              >
                {midLabel.length > 22 ? `${midLabel.slice(0, 21)}…` : midLabel}
              </text>
            </g>
          )}
        </svg>
        {activeSlice && !showCenter && (
          <ChartTooltip
            x={tipX}
            y={tipY}
            width={size}
            title={activeSlice.label}
            rows={[
              {
                key: activeSlice.key,
                label: formatShare(activeSlice.share),
                value: formatValue(format, activeSlice.value),
                color: activeSlice.color,
                shape: activeSlice.shape,
              },
            ]}
          />
        )}
      </div>

      <ChartLegend
        layout="list"
        label="Výřezy"
        className={cn(side ? "flex-1" : "w-full")}
        activeKey={activeSlice?.key ?? null}
        onHover={setLegendHover}
        items={slices.map((s) => ({
          key: s.key,
          label: s.label,
          color: s.color,
          shape: s.shape,
          value: formatValue(format, s.value),
          share: formatShare(s.share),
          href: s.href,
        }))}
      />

      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th scope="col">Položka</th>
            <th scope="col">Hodnota</th>
            <th scope="col">Podíl</th>
          </tr>
        </thead>
        <tbody>
          {slices.map((s) => (
            <tr key={s.key}>
              <th scope="row">{s.label}</th>
              <td>{formatValue(format, s.value)}</td>
              <td>{formatShare(s.share)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
