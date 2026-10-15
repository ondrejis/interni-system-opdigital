import { ensurePersonalBoards, listBoards } from "@rebar/core/dashboards";
import { can } from "@rebar/core/rbac";
import { PageHeader } from "@rebar/ui";
import { notFound } from "next/navigation";
import { dashboardsEnabled } from "@/server/dashboards";
import { requireCtx } from "@/server/request";
import { getServices } from "@/server/services";
import { PrehledHost } from "./prehled-host";

export const dynamic = "force-dynamic";
export const metadata = { title: "Přehled" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Přehled (PRE-01 až PRE-07): osobní přehledy z widgetů a přepínač mezi nimi („Den“, „Finance“…). Při prvním otevření
 * dostane uživatel kopie výchozí sady své role (u Ondřeje a Patrika „Den“ a „Finance“) a pak si je upravuje sám
 * v režimu Upravit. Statická trasa předběhne zástupnou stránku modulu (`[...path]`); `/` sem přesměruje.
 */
export default async function PrehledPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requireCtx();
  if (!can(ctx, "prehled.read")) notFound();
  const enabled = dashboardsEnabled();
  const sp = await searchParams;
  let boards: Awaited<ReturnType<typeof listBoards>> = [];
  if (enabled) {
    await ensurePersonalBoards(ctx);
    boards = await listBoards(ctx);
  }
  const requested = sp.board && UUID.test(sp.board) ? sp.board : null;
  // výchozí sady rolí jsou vzory (Nastavení → Nástěnky), v přepínači jsou jen přehledy uživatele a sdílené
  const tabs = boards.filter((b) => !b.template || b.id === requested);
  const activeId = requested ?? tabs[0]?.id ?? null;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader breadcrumbs={[{ label: "Přehled" }]} />
      <div className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
        <PrehledHost
          enabled={enabled}
          boards={tabs}
          activeId={activeId}
          jobsAvailable={!!getServices().registry.get("job")}
        />
      </div>
    </div>
  );
}
