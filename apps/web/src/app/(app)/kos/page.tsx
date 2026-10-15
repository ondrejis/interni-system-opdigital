import { PageHeader } from "@rebar/ui";
import { can } from "@rebar/core/rbac";
import { requireCan } from "@/server/request";
import { TrashView } from "./trash-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Koš" };

/** Koš: smazané záznamy 30 dní; obnova vrátí i podřízené záznamy, trvalé smazání jen s právem `trash.purge`. */
export default async function Page() {
  const ctx = await requireCan("trash.read");
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader breadcrumbs={[{ label: "Koš" }]} />
      <TrashView canPurge={can(ctx, "trash.purge")} />
    </div>
  );
}
