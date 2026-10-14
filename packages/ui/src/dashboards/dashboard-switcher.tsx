"use client";

import type { DashboardSummary } from "@rebar/core/dashboards-shared";
import { Plus, Users } from "lucide-react";
import { useNav } from "../nav";
import { cn } from "../lib/cn";
import { Button } from "../components/button";

/** Přepínač nástěnek na úvodní stránce: klasický Přehled a nástěnky uživatele. Mobil: vodorovný posuvný pruh. */
export function DashboardSwitcher({
  boards,
  activeId,
  overviewHref,
  boardHref,
  onCreate,
  onOrder,
}: {
  boards: DashboardSummary[];
  /** Id aktivní nástěnky, `null` = klasický Přehled. */
  activeId: string | null;
  overviewHref: string;
  boardHref: (id: string) => string;
  onCreate?: (() => void) | undefined;
  onOrder?: (() => void) | undefined;
}) {
  const { Link } = useNav();
  const tab = (active: boolean) =>
    cn(
      "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-base font-medium transition-colors",
      active ? "bg-accent-soft text-accent-text" : "text-muted hover:bg-hover hover:text-fg",
    );
  return (
    <nav
      aria-label="Nástěnky"
      className="scrollbar-thin -mx-1 flex items-center gap-1 overflow-x-auto px-1 pb-1"
      data-testid="dashboard-switcher"
    >
      <Link
        href={overviewHref}
        className={tab(activeId === null)}
        aria-current={activeId === null ? "page" : undefined}
      >
        Přehled
      </Link>
      {boards.map((b) => (
        <Link
          key={b.id}
          href={boardHref(b.id)}
          className={tab(activeId === b.id)}
          aria-current={activeId === b.id ? "page" : undefined}
          data-testid="dashboard-tab"
        >
          {b.kind !== "personal" && (
            <Users className="size-3.5 opacity-70" aria-label="Sdílená nástěnka" />
          )}
          {b.name}
        </Link>
      ))}
      {onCreate && (
        <Button variant="ghost" size="sm" onClick={onCreate} data-testid="new-dashboard">
          <Plus /> Nová nástěnka
        </Button>
      )}
      {onOrder && boards.length > 1 && (
        <Button variant="ghost" size="sm" onClick={onOrder}>
          Pořadí
        </Button>
      )}
    </nav>
  );
}
