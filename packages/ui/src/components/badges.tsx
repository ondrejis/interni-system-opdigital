import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

export const LABEL_COLORS = [
  "gray",
  "blue",
  "green",
  "orange",
  "red",
  "purple",
  "pink",
  "teal",
  "yellow",
  "indigo",
] as const;
export type LabelColor = (typeof LABEL_COLORS)[number];

/** Barevný štítek (stav, role, typ). Barva nese význam — bez významu zůstává šedá. */
export function Chip({
  color = "gray",
  dot,
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { color?: string; dot?: boolean }) {
  return (
    <span className={cn("chip", className)} data-color={color} {...rest}>
      {dot && <span className="chip-dot" />}
      {children}
    </span>
  );
}

const PALETTE = ["blue", "green", "orange", "purple", "pink", "teal", "indigo", "yellow"];

/** Stabilní barva avataru podle jména. */
export function colorFor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")
  ).toUpperCase();
}

export function Avatar({
  name,
  size = 20,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn("chip shrink-0 justify-center !p-0 font-semibold", className)}
      data-color={colorFor(name)}
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.42)) }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-line-strong bg-subtle px-1 font-sans text-xs font-medium text-muted",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-hover before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.4s_infinite] before:bg-gradient-to-r before:from-transparent before:via-fg/10 before:to-transparent",
        className,
      )}
    />
  );
}

/** Prázdný stav vždy vysvětlí, co tu bude, a nabídne hlavní akci. */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      {icon && (
        <div className="mb-1 flex size-10 items-center justify-center rounded-lg bg-hover text-muted [&_svg]:size-5">
          {icon}
        </div>
      )}
      <p className="text-lg font-semibold">{title}</p>
      {description && <p className="max-w-sm text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
