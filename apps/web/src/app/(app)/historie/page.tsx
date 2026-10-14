import { PageHeader, Placeholder } from "@rebar/ui";
import { requireCan } from "@/server/request";

export const dynamic = "force-dynamic";
export const metadata = { title: "Historie změn" };

/** Zástupná stránka (kostra S0); skutečný obsah doplní C3. */
export default async function Page() {
  await requireCan("activity.read");
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader breadcrumbs={[{ label: "Historie změn" }]} />
      <Placeholder title="Historie změn" icon="history" />
    </div>
  );
}
