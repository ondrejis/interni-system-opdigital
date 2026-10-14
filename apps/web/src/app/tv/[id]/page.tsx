import { filtersFromSearch } from "@rebar/core/dashboards-shared";
import { getBoard } from "@rebar/core/dashboards";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { dashboardsEnabled } from "@/server/dashboards";
import { requireCtx } from "@/server/request";
import { TvBoard } from "./tv-board";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nástěnka", robots: { index: false, follow: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Celoobrazovkový režim nástěnky pro televizi v kanceláři: bez navigace, data se sama obnovují. Přihlášení je běžné
 * (cookie); po vypršení relace widgety ohlásí, že je nutné se znovu přihlásit.
 */
export default async function TvPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  if (!UUID.test(id) || !dashboardsEnabled()) notFound();
  const ctx = await requireCtx();
  const sp = await searchParams;
  const board = await getBoard(ctx, id).catch(() => null);
  if (!board) notFound();
  const filters = filtersFromSearch((k) => sp[k], board.definition.defaultPeriod ?? "all");
  return (
    <TvBoard
      name={board.summary.name}
      widgets={board.definition.widgets}
      filters={filters}
      // zpět na stejnou nástěnku v běžné aplikaci
      backHref={`/?board=${id}`}
    />
  );
}
