"use client";

import { CalendarDays, X } from "lucide-react";
import { lazy, Suspense, useState, type ReactNode } from "react";
import { cn } from "../lib/cn";
import { Popover, PopoverContent, PopoverTrigger } from "./overlay";

/** Kalendář (react-day-picker + čeština z date-fns) se stáhne až při prvním otevření, ne s každou stránkou. */
const CalendarGrid = lazy(() => import("./calendar-grid"));

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (s: string | null) => (s ? new Date(`${s}T12:00:00`) : undefined);
const fmt = new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" });

/** Výběr data (hodnota je ISO `RRRR-MM-DD`). */
export function DatePicker({
  value,
  onChange,
  placeholder = "Vybrat datum",
  clearable = true,
  trigger,
  className,
  disabled,
  open: openProp,
  onOpenChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder?: string;
  clearable?: boolean;
  trigger?: ReactNode;
  className?: string;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  const [state, setState] = useState(false);
  const open = openProp ?? state;
  const setOpen = (o: boolean) => (onOpenChange ? onOpenChange(o) : setState(o));
  const date = parse(value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        {trigger ?? (
          <button
            type="button"
            className={cn(
              "flex h-8 w-full items-center gap-2 rounded-md border border-line-strong bg-bg px-2.5 text-left text-base hover:border-faint disabled:opacity-50",
              className,
            )}
          >
            <CalendarDays className="size-4 text-faint" />
            <span className={cn("flex-1 truncate", !date && "text-faint")}>
              {date ? fmt.format(date) : placeholder}
            </span>
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2">
        <Suspense fallback={<div className="h-[260px] w-[252px]" aria-busy="true" />}>
          <CalendarGrid
            selected={date}
            onSelect={(d) => {
              onChange(d ? iso(d) : null);
              setOpen(false);
            }}
          />
        </Suspense>
        {clearable && date && (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className="mt-1 flex w-full items-center justify-center gap-1 rounded-md py-1 text-muted hover:bg-hover"
          >
            <X className="size-3.5" /> Zrušit datum
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
