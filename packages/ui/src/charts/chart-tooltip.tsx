import type { CSSProperties } from "react";
import { cn } from "../lib/cn";
import type { SeriesShape } from "./geometry";
import { SeriesMark } from "./series-mark";

export type ChartTooltipRow = {
  key: string;
  label: string;
  value: string;
  color?: string;
  shape?: SeriesShape;
  /** Řádek součtu: tučně, bez značky. */
  total?: boolean;
};

const TIP_MAX = 220;

/**
 * Jednoduchý tooltip bez portálu. Leží uvnitř `position: relative` kontejneru grafu a souřadnice [x, y]
 * jsou v pixelech kontejneru. Je jen vizuální (`aria-hidden`): totéž čte čtečka z popisku prvku a z datové tabulky.
 * `top` sedí nad bodem (pod něj se překlopí u horního okraje), `side` vedle bodu na tu stranu, kde je víc místa.
 */
export function ChartTooltip({
  x,
  y,
  width,
  placement = "top",
  title,
  rows,
}: {
  x: number;
  y: number;
  /** Šířka kontejneru v px. */
  width: number;
  placement?: "top" | "side";
  title?: string;
  rows: ChartTooltipRow[];
}) {
  const style: CSSProperties = {};
  if (placement === "top") {
    const half = Math.min(TIP_MAX, Math.max(width, 120)) / 2;
    style.left = `clamp(${half}px, ${Math.round(x)}px, calc(100% - ${half}px))`;
    style.top = Math.round(y);
    style.transform = y < 72 ? "translate(-50%, 12px)" : "translate(-50%, calc(-100% - 10px))";
  } else {
    const right = x < width * 0.55;
    style.top = Math.round(y);
    style.transform = "translateY(-50%)";
    if (right) {
      style.left = Math.round(x + 12);
      style.maxWidth = Math.max(120, Math.min(TIP_MAX, width - x - 16));
    } else {
      style.right = Math.round(width - x + 12);
      style.maxWidth = Math.max(120, Math.min(TIP_MAX, x - 16));
    }
  }
  return (
    <div
      aria-hidden
      style={style}
      className={cn(
        "pointer-events-none absolute z-10 w-max rounded-md bg-bg px-2.5 py-2 text-xs shadow-float",
        placement === "top" && "max-w-[220px]",
      )}
    >
      {title && <div className="mb-1 font-medium text-fg">{title}</div>}
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-2">
            {r.shape && r.color ? (
              <SeriesMark shape={r.shape} color={r.color} />
            ) : (
              <span className="w-2.5 shrink-0" />
            )}
            <span
              className={cn(
                "shrink-0 text-fg tabular-nums",
                r.total ? "font-semibold" : "font-medium",
              )}
            >
              {r.value}
            </span>
            <span className="min-w-0 truncate text-muted">{r.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
