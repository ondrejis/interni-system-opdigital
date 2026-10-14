"use client";

import { cn } from "@rebar/ui";
import { CircleCheck, CirclePlay, Circle, Flag, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { STATE_TONE, type PhaseState } from "./schedule-shared";

/** Ikona stavu fáze: hotovo, zpožděno, probíhá, plán; milník má vlajku v barvě stavu. */
export function StateIcon({
  state,
  milestone,
  className,
}: {
  state: PhaseState;
  milestone?: boolean;
  className?: string;
}) {
  const cls = cn(
    "size-4 shrink-0",
    STATE_TONE[state].text,
    state === "planned" && "text-faint",
    className,
  );
  if (milestone) return <Flag className={cls} aria-hidden />;
  if (state === "done") return <CircleCheck className={cls} aria-hidden />;
  if (state === "late") return <TriangleAlert className={cls} aria-hidden />;
  if (state === "active") return <CirclePlay className={cls} aria-hidden />;
  return <Circle className={cls} aria-hidden />;
}

/** Úzký ukazatel postupu v barvě stavu. */
export function ProgressBar({
  value,
  state,
  className,
  label,
}: {
  value: number;
  state: PhaseState;
  className?: string;
  label?: string;
}) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-label={label ?? "Postup"}
      className={cn("h-2 overflow-hidden rounded-full bg-hover", className)}
    >
      <div
        className="h-full rounded-full transition-[width] duration-150"
        style={{ width: `${value}%`, background: STATE_TONE[state].edge }}
      />
    </div>
  );
}

/** Přepínač několika možností (pohled, přiblížení, typ fáze). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string; icon?: ReactNode; count?: number }[];
  label: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "inline-flex min-h-8 rounded-md border border-line-strong bg-subtle p-0.5",
        className,
      )}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded px-2.5 text-sm font-medium transition-colors duration-150 [&_svg]:size-4",
              on ? "bg-bg text-fg shadow-sm ring-1 ring-line" : "text-muted hover:text-fg",
            )}
          >
            {o.icon}
            {o.label}
            {o.count !== undefined && (
              <span className={cn("tabular text-xs", "text-muted")}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
