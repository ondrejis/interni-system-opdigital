import { listSeries } from "@rebar/core/numbering";
import { SettingsPage } from "@rebar/ui";
import { Hash } from "lucide-react";
import { requireCan } from "@/server/request";
import { getServices } from "@/server/services";
import { SeriesAdmin } from "./series-admin";
import { seriesLabel } from "./series-labels";

export const dynamic = "force-dynamic";
export const metadata = { title: "Číselné řady" };

export default async function SeriesPage() {
  const ctx = await requireCan("settings.manage");
  const { runtime } = getServices();
  const names = new Map<string, string>(runtime.modules.map((m) => [m.id, m.name]));
  const rows = (await listSeries(ctx.db)).filter((r) => names.has(r.key.split(".")[0]!));
  return (
    <SettingsPage
      width="lg"
      title="Číselné řady"
      description="Podoba čísel dokladů: faktur, zakázek, příjemek a dalších. Číslo se přiděluje při vzniku dokladu, bez děr."
      icon={<Hash />}
    >
      <SeriesAdmin
        series={rows.map((r) => ({
          key: r.key,
          label: seriesLabel(r.key),
          module: names.get(r.key.split(".")[0]!) ?? "",
          pattern: r.pattern,
          reset: r.reset,
          next: r.next,
          lastValue: r.lastValue,
        }))}
      />
    </SettingsPage>
  );
}
