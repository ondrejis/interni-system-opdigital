"use client";

import { DashboardApiProvider, DashboardGrid } from "@rebar/ui";
import type { DashboardFilters, DashboardWidget } from "@rebar/core/dashboards-shared";
import { Maximize2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { dashboardApi } from "@/lib/dashboard-api";

const REFRESH_MS = 60_000;

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  if (!now) return null;
  return (
    <time className="tabular text-lg text-muted" dateTime={now.toISOString()}>
      {now.toLocaleString("cs-CZ", {
        weekday: "long",
        day: "numeric",
        month: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })}
    </time>
  );
}

/** Nástěnka na celou obrazovku: velké nadpisy, hodiny, automatické obnovování každou minutu, bez navigace. */
export function TvBoard({
  name,
  widgets,
  filters,
  backHref,
}: {
  name: string;
  widgets: DashboardWidget[];
  filters: DashboardFilters;
  backHref: string;
}) {
  return (
    <DashboardApiProvider api={dashboardApi}>
      <main className="min-h-screen bg-bg p-4 md:p-6" data-testid="tv-board">
        <header className="mb-4 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold md:text-3xl">{name}</h1>
          <div className="ml-auto flex items-center gap-3">
            <Clock />
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-muted hover:bg-hover hover:text-fg"
              onClick={() => void document.documentElement.requestFullscreen?.()}
            >
              <Maximize2 className="size-4" aria-hidden /> Celá obrazovka
            </button>
            <Link
              href={backHref}
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-muted hover:bg-hover hover:text-fg"
            >
              <X className="size-4" aria-hidden /> Zavřít
            </Link>
          </div>
        </header>
        {widgets.length ? (
          <DashboardGrid
            widgets={widgets}
            filters={filters}
            refreshKey={0}
            autoRefreshMs={REFRESH_MS}
            hideMenu
          />
        ) : (
          <p className="text-muted">Nástěnka je prázdná.</p>
        )}
      </main>
    </DashboardApiProvider>
  );
}
