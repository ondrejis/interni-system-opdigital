import { formatValue } from "@rebar/core/dashboards-shared";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import type { ChartCategory, ChartSeries, ChartValueFormat } from "./types";

export const CHART_EMPTY_TEXT = "Žádná data za zvolené období";

/** Prázdný stav grafu: drží výšku grafu, aby se stránka neposouvala. */
export function ChartEmpty({
  height,
  ariaLabel,
  className,
}: {
  height: number;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="img"
      aria-label={`${ariaLabel}: ${CHART_EMPTY_TEXT.toLowerCase()}`}
      style={{ minHeight: height }}
      className={cn(
        "flex items-center justify-center rounded-md border border-dashed border-line px-3 text-center text-sm text-faint",
        className,
      )}
    >
      {CHART_EMPTY_TEXT}
    </div>
  );
}

/** Skrytá tabulka s hodnotami: totéž, co graf ukazuje, ve tvaru, který čtečky obrazovky umí procházet. */
export function ChartDataTable({
  caption,
  categories,
  series,
  format,
  categoryHeader = "Kategorie",
  extra,
}: {
  caption: string;
  categories: ChartCategory[];
  series: ChartSeries[];
  format: ChartValueFormat;
  categoryHeader?: string;
  extra?: ReactNode;
}) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">{categoryHeader}</th>
          {series.map((s) => (
            <th key={s.key} scope="col">
              {s.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {categories.map((c, i) => (
          <tr key={c.key}>
            <th scope="row">{c.label}</th>
            {series.map((s) => (
              <td key={s.key}>{formatValue(format, s.values[i] ?? null)}</td>
            ))}
          </tr>
        ))}
      </tbody>
      {extra}
    </table>
  );
}
