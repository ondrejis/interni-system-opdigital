"use client";

import { useNav } from "../nav";
import { cn } from "../lib/cn";
import type { SeriesShape } from "./geometry";
import { SeriesMark } from "./series-mark";

export type ChartLegendItem = {
  key: string;
  label: string;
  color: string;
  shape: SeriesShape;
  /** Hodnota a podíl (jen v seznamu, např. u koláče). */
  value?: string;
  share?: string;
  href?: string;
};

/**
 * Legenda grafu. `inline` je řádek značek pod grafem, `list` svislý seznam s hodnotami a podíly.
 * Barva je jen ve značce, text zůstává v barvách textu; tvar značky nese rozlišení i bez barev.
 */
export function ChartLegend({
  items,
  layout = "inline",
  activeKey,
  onHover,
  className,
  label = "Legenda",
}: {
  items: ChartLegendItem[];
  layout?: "inline" | "list";
  activeKey?: string | null;
  /** Najetí na položku (pro zvýraznění výřezu); `null` při opuštění. */
  onHover?: (key: string | null) => void;
  className?: string;
  label?: string;
}) {
  const { Link } = useNav();
  if (!items.length) return null;
  const list = layout === "list";
  return (
    <ul
      aria-label={label}
      className={cn(
        list ? "min-w-0 space-y-1" : "flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted",
        className,
      )}
    >
      {items.map((item) => {
        const body = (
          <>
            <SeriesMark shape={item.shape} color={item.color} />
            <span className={cn("min-w-0", list && "flex-1 truncate text-fg")} title={item.label}>
              {item.label}
            </span>
            {item.value !== undefined && (
              <span className="shrink-0 text-fg tabular-nums">{item.value}</span>
            )}
            {item.share !== undefined && (
              <span className="w-14 shrink-0 text-right text-muted tabular-nums">{item.share}</span>
            )}
          </>
        );
        const cls = cn(
          "flex items-center gap-1.5",
          list && "rounded-sm px-1 py-0.5 text-sm",
          list && activeKey === item.key && "bg-hover",
        );
        const hover = onHover
          ? {
              onPointerEnter: () => onHover(item.key),
              onPointerLeave: () => onHover(null),
              onFocus: () => onHover(item.key),
              onBlur: () => onHover(null),
            }
          : {};
        return (
          <li key={item.key} className="min-w-0">
            {item.href ? (
              <Link href={item.href} className={cn(cls, "hover:underline")} {...hover}>
                {body}
              </Link>
            ) : (
              <span className={cls} {...hover}>
                {body}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
