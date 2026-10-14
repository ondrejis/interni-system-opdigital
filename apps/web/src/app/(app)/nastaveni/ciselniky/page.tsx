import { listLookups } from "@rebar/core/config-data";
import { SettingsPage } from "@rebar/ui";
import { ListChecks } from "lucide-react";
import { requireCan } from "@/server/request";
import { getServices } from "@/server/services";
import { LookupsAdmin } from "./lookups-admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Číselníky" };

export default async function LookupsPage() {
  const ctx = await requireCan("settings.manage");
  const enabled = new Set<string>(getServices().runtime.modules.map((m) => m.id));
  // číselníky vypnutého modulu (klíč `modul.název`) se nenabízejí
  const lists = (await listLookups(ctx.db)).filter((l) => enabled.has(l.key.split(".")[0]!));
  return (
    <SettingsPage
      width="lg"
      title="Číselníky"
      description="Seznamy hodnot, ze kterých se vybírá v záznamech: kategorie, důvody prohry, zdroje poptávek, závažnost vad…"
      icon={<ListChecks />}
    >
      <LookupsAdmin
        lists={lists.map((l) => ({
          id: l.id,
          key: l.key,
          name: l.name,
          items: l.items.map((i) => ({
            id: i.id,
            value: i.value,
            label: i.label,
            color: i.color,
            active: i.active,
          })),
        }))}
      />
    </SettingsPage>
  );
}
