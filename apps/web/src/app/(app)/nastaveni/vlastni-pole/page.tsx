import { listFieldDefs } from "@rebar/core/custom-fields";
import { SettingsPage } from "@rebar/ui";
import { getTableColumns } from "drizzle-orm";
import { SlidersHorizontal } from "lucide-react";
import { requireCan } from "@/server/request";
import { getServices } from "@/server/services";
import { FieldsAdmin, type EntityView } from "./fields-admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vlastní pole" };

export default async function CustomFieldsPage() {
  const ctx = await requireCan(["settings.manage", "settings.custom_fields"]);
  const { registry } = getServices();
  // vlastní pole mají entity, jejichž tabulka má sloupec `custom`
  const customizable = registry.all().filter((d) => "custom" in getTableColumns(d.table));
  const entities: EntityView[] = [];
  for (const d of customizable) {
    const defs = await listFieldDefs(ctx.db, d.key);
    entities.push({
      key: d.key,
      label: d.label.many,
      fields: defs.map((f) => ({
        id: f.id,
        key: f.key,
        label: f.label,
        type: f.type,
        required: f.required,
        showInTable: f.showInTable,
        showInForm: f.showInForm,
        hidden: !!f.options.hidden,
        defaultValue: f.options.defaultValue ?? null,
        choices: f.options.choices ?? [],
        recordEntity: f.options.entityType ?? null,
      })),
    });
  }
  return (
    <SettingsPage
      width="xl"
      title="Vlastní pole"
      description="Doplňte si k organizacím, kontaktům, obchodům, zakázkám a úkolům vlastní údaje. Pole se objeví v tabulce, filtrech, řazení, detailu, exportu i hledání."
      icon={<SlidersHorizontal />}
    >
      <FieldsAdmin
        entities={entities}
        recordTargets={registry
          .all()
          .map((d) => ({ value: d.key, label: d.label.many }))
          .sort((a, b) => a.label.localeCompare(b.label, "cs"))}
      />
    </SettingsPage>
  );
}
