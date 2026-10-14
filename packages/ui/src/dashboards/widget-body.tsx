"use client";

import { formatValue, type TableColumn, type WidgetResult } from "@rebar/core/dashboards-shared";
import { formatDate } from "@rebar/core/shared";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Chip } from "../components/badges";
import { useNav } from "../nav";
import { BarChart, DonutChart, Gauge, LineChart } from "../charts";
import { cn } from "../lib/cn";

const ROW = 96;
const GAP = 12;
/** Výška obsahu grafu podle výšky widgetu v řádcích mřížky (bez záhlaví karty). */
export const chartHeight = (h: number) => Math.max(120, h * ROW + (h - 1) * GAP - 56);

const TONE = {
  danger: "text-danger",
  warning: "text-warning",
  success: "text-success",
  default: "",
} as const;
const DOT = { danger: "bg-danger", warning: "bg-warning", info: "bg-accent" } as const;

function Cell({ column, value, format }: { column: TableColumn; value: unknown; format?: string }) {
  if (value === null || value === undefined || value === "")
    return <span className="text-faint">–</span>;
  switch (column.type) {
    case "money":
      return <span className="tabular">{formatValue("money", Number(value))}</span>;
    case "percent":
      return <span className="tabular">{formatValue("percent", Number(value))}</span>;
    case "minutes":
      return <span className="tabular">{formatValue("minutes", Number(value))}</span>;
    case "hours":
      return <span className="tabular">{formatValue("hours", Number(value))}</span>;
    case "number":
      return (
        <span className="tabular">
          {formatValue(format === "money" ? "money" : "number", Number(value))}
        </span>
      );
    case "date":
      return <span className="tabular">{formatDate(String(value))}</span>;
    default:
      return <span className="truncate">{String(value)}</span>;
  }
}

const isNum = (t: TableColumn["type"]) => !["text", "date", "status"].includes(t);

/** Obsah widgetu podle druhu výsledku. Výsledek je už filtrovaný oprávněními na serveru; tady se jen zobrazuje. */
export function WidgetBody({
  result,
  title,
  h,
}: {
  result: WidgetResult;
  title: string;
  h: number;
}) {
  const { Link } = useNav();
  switch (result.kind) {
    case "kpi": {
      const d = result.delta;
      const Icon = !d || d.abs === 0 ? Minus : d.abs > 0 ? ArrowUpRight : ArrowDownRight;
      return (
        <div className="flex h-full flex-col justify-center" data-testid="widget-kpi">
          <div
            className="tabular truncate text-2xl font-semibold leading-tight"
            title={result.text ?? formatValue(result.format, result.value)}
          >
            {result.text ??
              // velké částky na celé koruny (haléře by se do úzké karty nevešly)
              formatValue(
                result.format,
                result.format === "money" &&
                  result.value !== null &&
                  Math.abs(result.value) >= 100_000
                  ? Math.round(result.value / 100) * 100
                  : result.value,
              )}
          </div>
          {result.compare && result.compare !== "none" && (
            <div
              className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted"
              data-testid="widget-delta"
            >
              {d ? (
                <>
                  <Icon className="size-4" aria-hidden />
                  <span className="tabular">
                    {d.abs >= 0 ? "+" : "−"}
                    {formatValue(result.format, Math.abs(d.abs))}
                    {d.pct !== null &&
                      ` (${d.pct >= 0 ? "+" : "−"}${Math.abs(Math.round(d.pct * 10) / 10)} %)`}
                  </span>
                  <span>
                    {result.compare === "previous_year"
                      ? "proti stejnému období loni"
                      : "proti předchozímu období"}
                  </span>
                </>
              ) : (
                <span>Srovnání není k dispozici (vyberte období).</span>
              )}
            </div>
          )}
        </div>
      );
    }
    case "gauge":
      return (
        <div className="flex h-full items-center">
          <Gauge value={result.value ?? 0} target={result.target} format={result.format} />
        </div>
      );
    case "chart": {
      const height = chartHeight(h);
      if (!result.categories.length)
        return <p className="py-6 text-center text-muted">Žádná data za zvolené období.</p>;
      if (result.chart === "pie" || result.chart === "donut")
        return (
          <DonutChart
            slices={result.categories.map((c, i) => ({
              key: c.key,
              label: c.label,
              value: Math.max(0, result.series[0]?.values[i] ?? 0),
              ...(c.href ? { href: c.href } : {}),
            }))}
            format={result.format}
            donut={result.chart === "donut"}
            ariaLabel={title}
          />
        );
      if (result.chart === "line" || result.chart === "timeseries")
        return (
          <LineChart
            categories={result.categories}
            series={result.series}
            area={result.chart === "timeseries"}
            format={result.format}
            height={height}
            ariaLabel={title}
          />
        );
      return (
        <BarChart
          categories={result.categories}
          series={result.series}
          stacked={result.chart === "stacked"}
          horizontal={result.categories.length > 6 && result.series.length === 1}
          format={result.format}
          height={height}
          ariaLabel={title}
        />
      );
    }
    case "table":
      return result.rows.length ? (
        <div className="-mx-1 overflow-auto" tabIndex={0}>
          <table className="w-full text-sm" data-testid="widget-table">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-faint">
                {result.columns.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className={cn("px-1 pb-1 font-medium", isNum(c.type) && "text-right")}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {result.rows.map((r) => (
                <tr key={r.id}>
                  {result.columns.map((c, i) => (
                    <td
                      key={c.key}
                      className={cn(
                        "max-w-[16rem] truncate px-1 py-1.5",
                        isNum(c.type) && "text-right",
                      )}
                    >
                      {i === 0 && r.href ? (
                        <Link href={r.href} className="text-accent-text hover:underline">
                          <Cell column={c} value={r.cells[c.key]} format={result.format} />
                        </Link>
                      ) : (
                        <Cell column={c} value={r.cells[c.key]} format={result.format} />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="py-6 text-center text-muted">Žádné záznamy.</p>
      );
    case "list":
      return result.items.length ? (
        <ul className="divide-y divide-line" data-testid="widget-list">
          {result.items.map((i) => {
            const inner = (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{i.title}</span>
                  {i.subtitle && (
                    <span className="block truncate text-sm text-muted">{i.subtitle}</span>
                  )}
                </span>
                {i.badge && <Chip>{i.badge}</Chip>}
                {i.date && (
                  <span
                    className={cn(
                      "shrink-0 text-sm tabular",
                      i.tone === "danger" ? "text-danger" : "text-muted",
                    )}
                  >
                    {formatDate(i.date)}
                  </span>
                )}
              </>
            );
            return (
              <li key={i.id}>
                {i.href ? (
                  <Link href={i.href} className="flex items-center gap-2 py-2 hover:bg-subtle">
                    {inner}
                  </Link>
                ) : (
                  <div className="flex items-center gap-2 py-2">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-6 text-center text-muted">Nic k zobrazení.</p>
      );
    case "status": {
      const total = result.stages.reduce((n, s) => n + s.count, 0) || 1;
      return (
        <div data-testid="widget-status">
          <div
            className="flex h-2.5 overflow-hidden rounded-full bg-hover"
            role="img"
            aria-label={`${title}: ${result.stages.map((s) => `${s.name} ${s.count}`).join(", ")}`}
          >
            {result.stages.map((s) => (
              <span
                key={s.id}
                style={{
                  width: `${(s.count / total) * 100}%`,
                  background: `var(--label-${s.color}-fg, var(--fg-muted))`,
                }}
              />
            ))}
          </div>
          <ul className="mt-3 space-y-1">
            {result.stages.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                <Chip color={s.color} dot>
                  {s.name}
                </Chip>
                <span className="tabular text-muted">
                  {s.count}
                  {s.value !== null && ` · ${formatValue(result.format, s.value)}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    case "attention":
      return result.items.length ? (
        <ul className="divide-y divide-line" data-testid="widget-attention">
          {result.items.map((a) => (
            <li key={a.id}>
              <Link href={a.href} className="flex items-start gap-3 py-2 hover:bg-subtle">
                <span
                  className={cn("mt-1.5 size-2 shrink-0 rounded-full", DOT[a.severity])}
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="font-medium">{a.title}</span>
                  {a.detail && <span className="block text-sm text-muted">{a.detail}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-4 text-muted">Teď nic nehoří, všechno je v pořádku.</p>
      );
    case "tiles":
      return (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="widget-tiles">
          {result.tiles.map((t) => {
            const body = (
              <>
                <div className="text-sm text-muted">{t.title}</div>
                <div
                  className={cn("mt-1 text-2xl font-semibold tabular", TONE[t.tone ?? "default"])}
                >
                  {t.value}
                </div>
                {t.hint && <div className="mt-0.5 truncate text-sm text-muted">{t.hint}</div>}
              </>
            );
            const cls =
              "rounded-lg border border-line p-3 hover:border-line-strong hover:bg-subtle";
            return t.href ? (
              <Link key={t.id} href={t.href} className={cls}>
                {body}
              </Link>
            ) : (
              <div key={t.id} className={cls}>
                {body}
              </div>
            );
          })}
        </div>
      );
    case "empty":
      return <p className="py-6 text-center text-muted">{result.message}</p>;
  }
}
