import { JobsPage } from "@rebar/zakazky/ui";
import { requireCan } from "@/server/request";

export const dynamic = "force-dynamic";

const TYPES = ["web", "marketing", "systemy"] as const;

/** Board zakázek podle fází jednoho typu (`?typ=web|marketing|systemy`). */
export default async function ZakazkyFazePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireCan("zakazky.read");
  const sp = await searchParams;
  const typ = TYPES.find((t) => t === sp.typ) ?? "web";
  return <JobsPage view="faze" type={typ} />;
}
