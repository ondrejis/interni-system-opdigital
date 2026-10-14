import { formatValue } from "@rebar/core/dashboards-shared";
import { cn } from "../lib/cn";
import { formatShareText } from "./format";
import { gaugeState, type GaugeTone } from "./series";
import type { ChartValueFormat } from "./types";

export type GaugeProps = {
  value: number;
  target: number;
  format: ChartValueFormat;
  label?: string;
  /** Čím méně, tím lépe (rozpočet, limit): blízko cíle je varování, překročení chyba. */
  lowerIsBetter?: boolean;
  className?: string;
};

const TONE_FILL: Record<GaugeTone, string> = {
  neutral: "var(--chart-1)",
  good: "var(--success)",
  warning: "var(--warning)",
  bad: "var(--danger)",
};

/**
 * Měřidlo plnění cíle: vodorovný pruh se značkou cíle. Pod cílem modře, splněno zeleně, přesah nad cíl
 * jiným odstínem (u `lowerIsBetter` červeně). Stav je i slovy, takže význam nestojí jen na barvě.
 */
export function Gauge({
  value,
  target,
  format,
  label,
  lowerIsBetter = false,
  className,
}: GaugeProps) {
  const g = gaugeState(value, target, lowerIsBetter);
  const v = Number.isFinite(value) ? Math.max(0, value) : 0;
  const text =
    g.pct === null
      ? formatValue(format, v)
      : `${formatValue(format, v)} z ${formatValue(format, target)} (${formatShareText(g.pct)})`;
  const max = Math.max(v, Number.isFinite(target) && target > 0 ? target : 0, 1e-9);
  const name = label ?? "Plnění cíle";
  const overFill = g.tone === "bad" ? TONE_FILL.bad : "var(--chart-3)";

  return (
    <div className={cn("w-full min-w-0", className)}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
        {label ? <span className="min-w-0 truncate text-muted">{label}</span> : <span />}
        <span className="shrink-0 font-medium text-fg tabular-nums">{text}</span>
      </div>
      <div
        role="meter"
        aria-label={name}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={v}
        aria-valuetext={g.status ? `${text}. ${g.status}` : text}
        className="relative h-2 w-full rounded-full bg-active"
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${g.fillPct}%`,
            background: TONE_FILL[g.tone],
            borderTopRightRadius: g.over ? 0 : undefined,
            borderBottomRightRadius: g.over ? 0 : undefined,
          }}
        />
        {g.over && (
          <div
            className="absolute inset-y-0 rounded-r-full"
            style={{
              left: `calc(${g.markerPct}% + 2px)`,
              width: `calc(${g.overPct}% - 2px)`,
              background: overFill,
            }}
          />
        )}
        {g.ratio !== null && (
          <div
            aria-hidden
            className="absolute -top-1 h-4 w-0.5 -translate-x-1/2 rounded-full bg-fg"
            style={{ left: `${g.markerPct}%`, marginLeft: g.markerPct >= 100 ? -1 : 0 }}
          />
        )}
      </div>
      {g.status && <div className="mt-1 text-xs text-muted">{g.status}</div>}
    </div>
  );
}
