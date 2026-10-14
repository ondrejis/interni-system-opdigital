"use client";

import {
  DashboardApiProvider,
  DashboardSwitcher,
  DashboardView,
  NewBoardDialog,
  OrderDialog,
  dashKeys,
  emptyBoard,
  useCan,
} from "@rebar/ui";
import {
  filtersFromSearch,
  filtersToSearch,
  type DashboardSummary,
} from "@rebar/core/dashboards-shared";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { dashboardApi } from "@/lib/dashboard-api";

/**
 * Přepínač nástěnek na úvodní stránce. Klasický Přehled (server) se vykreslí jako `children`, když není vybraná žádná
 * nástěnka; jinak se ukáže zvolená nástěnka. Výběr nástěnky i filtry jsou v adrese, takže jdou sdílet záložkou.
 */
export function HomeBoards({
  boards,
  activeId,
  hasHome,
  jobsAvailable,
  children,
}: {
  boards: DashboardSummary[];
  activeId: string | null;
  /** Pro roli je nástěnka nastavená jako domovská, klasický Přehled je pak na `?board=prehled`. */
  hasHome: boolean;
  jobsAvailable: boolean;
  children?: ReactNode;
}) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const qc = useQueryClient();
  const can = useCan();
  const canWrite = can("dashboards.write");
  const [newOpen, setNewOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const filters = useMemo(() => filtersFromSearch((k) => sp.get(k)), [sp]);

  const setFilters = (f: Parameters<typeof filtersToSearch>[0]) => {
    const next = new URLSearchParams();
    if (activeId) next.set("board", activeId);
    for (const [k, v] of Object.entries(filtersToSearch(f))) next.set(k, v);
    router.replace(`${path}?${next.toString()}`, { scroll: false });
  };

  return (
    <DashboardApiProvider api={dashboardApi}>
      <div className="mb-4">
        <DashboardSwitcher
          boards={boards}
          activeId={activeId}
          overviewHref={hasHome ? "/?board=prehled" : "/"}
          boardHref={(id) => `/?board=${id}`}
          onCreate={canWrite ? () => setNewOpen(true) : undefined}
          onOrder={() => setOrderOpen(true)}
        />
      </div>
      {activeId ? (
        <DashboardView
          key={activeId}
          boardId={activeId}
          filters={filters}
          onFiltersChange={setFilters}
          canWrite={canWrite}
          jobsAvailable={jobsAvailable}
          tvHref={`/tv/${activeId}${sp.toString() ? `?${sp.toString().replace(/board=[^&]*&?/, "")}` : ""}`}
          onDeleted={() => {
            router.replace("/");
            router.refresh();
          }}
          onCloned={(id) => {
            router.push(`/?board=${id}`);
            router.refresh();
          }}
        />
      ) : (
        children
      )}
      <NewBoardDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreate={async (name) => {
          const r = await dashboardApi.create({ name, definition: emptyBoard() });
          await qc.invalidateQueries({ queryKey: dashKeys.list });
          router.push(`/?board=${r.id}`);
          router.refresh();
        }}
      />
      {orderOpen && (
        <OrderDialog
          open
          onOpenChange={setOrderOpen}
          boards={boards}
          onSave={async (ids) => {
            await dashboardApi.reorder(ids);
            router.refresh();
          }}
        />
      )}
    </DashboardApiProvider>
  );
}
