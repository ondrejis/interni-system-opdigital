"use client";

import { cn } from "@rebar/ui";
import { BookOpen, Clock, Package, Pencil, Receipt, Truck, type LucideIcon } from "lucide-react";

export function Err({ error }: { error: Error | null }) {
  return error ? (
    <p role="alert" className="mt-2 text-sm text-danger">
      {error.message}
    </p>
  ) : null;
}

/** Procento na jedno desetinné místo s českou čárkou. */
export const fmtPct = (p: number | null | undefined) =>
  p === null || p === undefined
    ? "–"
    : `${p.toLocaleString("cs-CZ", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;

const SOURCE_ICON: Record<string, LucideIcon> = {
  manual: Pencil,
  faktura_prijata: Receipt,
  dochazka: Clock,
  sklad: Package,
  stroje: Truck,
  diary: BookOpen,
};
export function SourceIcon({ source, className }: { source: string; className?: string }) {
  const C = SOURCE_ICON[source] ?? Pencil;
  return <C className={cn("size-4 shrink-0", className)} strokeWidth={1.5} aria-hidden />;
}

export type SectionOption = { id: string; label: string; costCategory: string | null };
export type ItemOption = { id: string; sectionId: string; label: string };

export type CostRow = {
  key: string;
  allocSource: string;
  source: string;
  ref: string;
  id: string | null;
  date: string | null;
  category: string;
  label: string;
  supplier: string | null;
  amountMinor: number;
  href: string | null;
  orderId: string | null;
  allocations: { sectionId: string; itemId: string | null; amountMinor: number | null }[];
  status: "paired" | "partial" | "unpaired";
  remainingMinor: number;
  editable: boolean;
};

export type CostList = {
  rows: CostRow[];
  sections: SectionOption[];
  items: ItemOption[];
  totalMinor: number;
  allMinor: number;
  unpairedCount: number;
  unpairedMinor: number;
  hasBudget: boolean;
};

/** Čerpání jako úzký pruh: barva podle stavu (v pořádku, pozor, překročeno). */
export function DrawdownBar({
  pct,
  tone,
}: {
  pct: number | null;
  tone: "ok" | "warn" | "over" | "none";
}) {
  const w = Math.max(0, Math.min(100, pct ?? 0));
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-subtle" aria-hidden>
        <div
          className={cn(
            "h-full rounded-full",
            tone === "over" ? "bg-danger" : tone === "warn" ? "bg-warning" : "bg-accent",
          )}
          style={{ width: `${w}%` }}
        />
      </div>
      <span
        className={cn(
          "tabular text-sm",
          tone === "over" ? "text-danger" : tone === "warn" ? "text-warning" : "text-muted",
        )}
      >
        {fmtPct(pct)}
      </span>
    </div>
  );
}
