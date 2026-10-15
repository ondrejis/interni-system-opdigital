import { PageHeader } from "@rebar/ui";
import { can } from "@rebar/core/rbac";
import { requireCan } from "@/server/request";
import { HistoryView, type HistoryInitial } from "./history-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Historie změn" };

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Globální historie změn: každá změna dat, integrací a bezpečnostní události s filtry (kdo, typ záznamu, akce, období,
 * kategorie), hledáním a před → po u polí. Čtení jde výhradně přes `auditReadScope` (partner nevidí historii soukromých
 * záznamů, bezpečnostní události vidí jen své). Historii nejde upravit ani smazat. Filtry jsou v adrese (jde ji poslat).
 */
export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const ctx = await requireCan("activity.read");
  const s = await searchParams;
  const initial: HistoryInitial = {
    q: one(s.q) ?? "",
    actor: one(s.kdo) ?? "",
    entityType: one(s.typ) ?? "",
    action: one(s.akce) ?? "",
    category: one(s.kategorie) ?? "",
    from: one(s.od) ?? "",
    to: one(s.do) ?? "",
  };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader breadcrumbs={[{ label: "Historie změn" }]} />
      <HistoryView initial={initial} canExport={can(ctx, "activity.export")} />
    </div>
  );
}
