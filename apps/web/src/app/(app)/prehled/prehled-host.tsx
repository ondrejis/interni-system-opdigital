"use client";

import {
  filtersFromSearch,
  filtersToSearch,
  type DashboardSummary,
} from "@rebar/core/dashboards-shared";
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
import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { dashboardApi } from "@/lib/dashboard-api";

/**
 * Přepínač přehledů a zvolený přehled. Výběr přehledu i filtry jsou v adrese (`?board=…&obdobi=…`), takže jdou sdílet
 * záložkou. Úpravy (přidat, přetáhnout, zvětšit, nastavit, odebrat) jsou jen v režimu „Upravit“; na telefonu se v něm
 * jen přeskládává pořadí.
 */
export function PrehledHost({
  enabled,
  boards,
  activeId,
  jobsAvailable,
}: {
  enabled: boolean;
  boards: DashboardSummary[];
  activeId: string | null;
  jobsAvailable: boolean;
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

  if (!enabled) return <p className="text-muted">Přehledy jsou v tomto systému vypnuté.</p>;

  return (
    <DashboardApiProvider api={dashboardApi}>
      <div className="mb-4">
        <DashboardSwitcher
          boards={boards}
          activeId={activeId}
          boardHref={(id) => `/prehled?board=${id}`}
          onCreate={canWrite ? () => setNewOpen(true) : undefined}
          createLabel="Nový přehled"
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
            router.replace("/prehled");
            router.refresh();
          }}
          onCloned={(id) => {
            router.push(`/prehled?board=${id}`);
            router.refresh();
          }}
        />
      ) : (
        <div
          className="rounded-lg border border-dashed border-line p-8 text-center text-muted"
          data-testid="prehled-empty"
        >
          <p className="font-medium text-fg">Zatím nemáte žádný přehled.</p>
          <p className="mt-1">
            {canWrite
              ? "Založte si ho tlačítkem „Nový přehled“ a poskládejte z widgetů."
              : "Přehled vám zatím nikdo nepřipravil ani nesdílel."}
          </p>
        </div>
      )}
      <NewBoardDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreate={async (name) => {
          const r = await dashboardApi.create({ name, definition: emptyBoard() });
          await qc.invalidateQueries({ queryKey: dashKeys.list });
          router.push(`/prehled?board=${r.id}`);
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
