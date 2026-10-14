"use client";

import { useRef, type KeyboardEvent } from "react";
import { cn } from "../lib/cn";

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
  /** `accent` zvýrazní zvolenou možnost akcentovou barvou, `neutral` jen jemně. */
  tone?: "accent" | "neutral";
};

/** Přepínač jedné možnosti ze 2–3 (např. „Ne / Jen moje / Vše“). Přístupná skupina voleb, šipky přepínají. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  disabled,
  className,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  /** Název skupiny pro čtečky obrazovky. */
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  function onKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const dir =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (i + dir + options.length) % options.length;
    onChange(options[next]!.value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("inline-flex shrink-0 rounded-lg bg-hover p-0.5", className)}
    >
      {options.map((o, i) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={i === index ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "h-7 cursor-pointer whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors duration-150 disabled:cursor-default",
              selected
                ? o.tone === "neutral"
                  ? "bg-bg text-fg shadow-sm"
                  : "bg-accent text-accent-fg shadow-sm"
                : "text-muted hover:text-fg disabled:hover:text-muted",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
