import { PageHeader, Placeholder } from "@rebar/ui";
import { requireCan } from "@/server/request";

export const dynamic = "force-dynamic";
export const metadata = { title: "Koš" };

/** Zástupná stránka (kostra S0); skutečný obsah doplní C1. */
export default async function Page() {
  await requireCan("trash.read");
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader breadcrumbs={[{ label: "Koš" }]} />
      <Placeholder title="Koš" icon="trash" />
    </div>
  );
}
