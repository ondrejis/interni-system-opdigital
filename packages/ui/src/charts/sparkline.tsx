import { cn } from "../lib/cn";
import { n } from "./geometry";
import { linearScale } from "./scale";
import { cleanValues } from "./series";

export type SparklineProps = {
  values: (number | null)[];
  ariaLabel: string;
  width?: number;
  height?: number;
  className?: string;
};

/** Drobná čára pro KPI: tlumená, jen poslední bod v barvě grafu. Přeruší se u `null`. */
export function Sparkline({
  values,
  ariaLabel,
  width = 80,
  height = 24,
  className,
}: SparklineProps) {
  const vals = cleanValues(values, values.length);
  const finite = vals.filter((v): v is number => v !== null);
  const pad = 3;
  const lo = Math.min(...finite);
  const hi = Math.max(...finite);
  const x = (i: number) =>
    vals.length > 1 ? pad + (i * (width - 2 * pad)) / (vals.length - 1) : width / 2;
  const flat = hi === lo;
  const y = flat ? () => height / 2 : linearScale(lo, hi, height - pad, pad);

  const runs: [number, number][][] = [];
  let run: [number, number][] = [];
  let last: [number, number] | null = null;
  vals.forEach((v, i) => {
    if (v === null) {
      if (run.length) runs.push(run);
      run = [];
      return;
    }
    const p: [number, number] = [n(x(i)), n(y(v))];
    run.push(p);
    last = p;
  });
  if (run.length) runs.push(run);
  const d = runs
    .filter((r) => r.length > 1)
    .map((r) => `M${r.map(([px, py]) => `${px},${py}`).join("L")}`)
    .join("");
  const end = last as [number, number] | null;

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("block shrink-0", className)}
    >
      {d && (
        <path
          d={d}
          data-mark="spark"
          fill="none"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          className="stroke-faint"
        />
      )}
      {end && (
        <circle
          cx={end[0]}
          cy={end[1]}
          r={3}
          data-mark="spark-end"
          style={{
            fill: "var(--chart-1)",
            stroke: "var(--bg)",
            strokeWidth: 4,
            paintOrder: "stroke",
          }}
        />
      )}
    </svg>
  );
}
