import { getPipelinePhases, listPipelines } from "@rebar/core/config-data";
import { SettingsPage } from "@rebar/ui";
import { Workflow } from "lucide-react";
import { requireCan } from "@/server/request";
import { getServices } from "@/server/services";
import { StagesAdmin, type PipelineView } from "./stages-admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stavy a pipeline" };

export default async function StagesPage() {
  const ctx = await requireCan(["settings.manage", "settings.pipelines"]);
  const { registry } = getServices();
  const all = await listPipelines(ctx.db);
  // jen pipeline, ke kterým existuje entita zapnutého modulu (vypnutý modul v administraci nemá stopu)
  const pipelines: PipelineView[] = all
    .filter((p) => registry.get(p.entityType))
    .map((p) => ({
      id: p.id,
      key: p.key,
      name: p.name,
      entityType: p.entityType,
      entityLabel: registry.get(p.entityType)!.label.many,
      phases: [...getPipelinePhases(p.entityType)],
      stages: p.stages.map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        kind: s.kind,
        phase: s.phase,
        probabilityPct: s.probabilityPct,
        rottingDays: s.rottingDays,
        usage: s.usage,
      })),
    }));
  return (
    <SettingsPage
      width="lg"
      title="Stavy a pipeline"
      description="Fáze obchodů, jejich pravděpodobnosti a doby do zvýraznění; stavy dalších záznamů. Pořadí stavů je pořadí sloupců na kanbanu."
      icon={<Workflow />}
    >
      <StagesAdmin pipelines={pipelines} />
    </SettingsPage>
  );
}
