import { getPipeline } from "../config-data";
import type { Executor } from "../db/client";
import { can, scopeOf } from "../rbac/permissions";
import type { Ctx } from "../rbac/types";
import { visibleTo, type EntityRegistry, type ResolvedEntity } from "./engine";
import type { AttributeDescriptor, EntityDescriptor } from "./shared";

/** Popis entity pro prohlížeč: atributy (včetně vlastních polí), stavy pipeline a to, co aktér smí. */
export async function describeEntity(
  ctx: Ctx,
  db: Executor,
  e: ResolvedEntity,
  /** S registrem se vynechají odkazy na entity vypnutých modulů. */
  registry?: EntityRegistry,
): Promise<EntityDescriptor> {
  const attributes: AttributeDescriptor[] = [];
  for (const a of visibleTo(ctx, e).attributes) {
    if (registry && a.type === "record" && a.record && !registry.get(a.record.entityType)) continue;
    const stages =
      a.type === "status" && a.pipeline
        ? ((await getPipeline(db, a.pipeline.entityType, a.pipeline.key))?.stages ?? [])
        : undefined;
    attributes.push({
      key: a.key,
      label: a.label,
      type: a.type,
      custom: !!a.custom,
      readonly: !!a.readonly,
      required: !!a.required,
      sortable: a.sortable !== false,
      filterable: a.filterable !== false,
      aggregate: !!a.aggregate?.includes("sum"),
      defaultVisible: a.defaultVisible ?? false,
      width: a.width ?? 160,
      ...(a.default !== undefined ? { default: a.default } : {}),
      ...(a.unit ? { unit: a.unit } : {}),
      ...(a.choices ? { choices: a.choices } : {}),
      ...(a.record ? { record: a.record } : {}),
      ...(stages
        ? {
            stages: stages.map((s) => ({
              id: s.id,
              name: s.name,
              color: s.color,
              kind: s.kind,
              phase: s.phase,
              probabilityPct: s.probabilityPct,
              rottingDays: s.rottingDays,
            })),
          }
        : {}),
    });
  }
  const p = e.def.permissions;
  return {
    key: e.def.key,
    label: e.def.label,
    listPath: e.def.listPath,
    titleKey: e.def.titleKey,
    statusKey: e.def.statusKey ?? null,
    attributes,
    can: {
      create: !e.def.noCreate && scopeOf(ctx, p.create ?? p.write) !== null,
      write: can(ctx, p.write),
      delete: !e.def.noDelete && can(ctx, p.delete ?? p.write),
      export: scopeOf(ctx, p.export ?? p.read) !== null,
    },
  };
}
