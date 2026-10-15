import { getPipeline } from "../config-data";
import type { Executor } from "../db/client";
import { can, canSeePrivate, scopeOf } from "../rbac/permissions";
import type { Ctx } from "../rbac/types";
import { visibleTo, type EntityRegistry, type ResolvedEntity } from "./engine";
import type { AttributeDescriptor, EntityDescriptor } from "./shared";
import type { Condition, FilterGroup } from "./operators";

/** Atributy, na které se filtr odkazuje (včetně vnořených skupin). */
function attrsOf(f: FilterGroup | Condition): string[] {
  return "conditions" in f ? f.conditions.flatMap(attrsOf) : [f.attr];
}

/**
 * Rychlé předvolby entity pro aktéra: filtry z `EntityDef.quickFilters` (funkce se vyhodnotí pro aktéra a dnešek) plus
 * „Soukromé“ pro vlastníka u entit se zámkem. Předvolba, která odkazuje na atribut, který aktér nevidí nebo nejde
 * filtrovat, se vynechá.
 */
function quickFiltersOf(
  ctx: Ctx,
  e: ResolvedEntity,
  attributes: readonly AttributeDescriptor[],
): NonNullable<EntityDescriptor["quickFilters"]> {
  const ok = new Set(attributes.filter((a) => a.filterable).map((a) => a.key));
  const out: NonNullable<EntityDescriptor["quickFilters"]> = [];
  for (const q of e.def.quickFilters ?? []) {
    try {
      const filter = typeof q.filter === "function" ? q.filter(ctx) : q.filter;
      if (attrsOf(filter).every((a) => ok.has(a))) out.push({ key: q.key, label: q.label, filter });
    } catch {
      /* chybná předvolba se nenabídne */
    }
  }
  if (
    e.def.visibility &&
    canSeePrivate(ctx) &&
    ok.has("isPrivate") &&
    !out.some((q) => q.key === "private")
  )
    out.push({
      key: "private",
      label: "Soukromé",
      filter: { op: "and", conditions: [{ attr: "isPrivate", op: "is_true" }] },
    });
  return out;
}

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
      ...(a.showInForm ? { showInForm: true } : {}),
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
  const quickFilters = quickFiltersOf(ctx, e, attributes);
  return {
    key: e.def.key,
    label: e.def.label,
    listPath: e.def.listPath,
    titleKey: e.def.titleKey,
    statusKey: e.def.statusKey ?? null,
    attributes,
    ...(e.def.visibility
      ? {
          visibility: {
            hasLock: true,
            lockable: canSeePrivate(ctx) && e.def.visibility.ownLock !== false,
          },
        }
      : {}),
    ...(quickFilters.length ? { quickFilters } : {}),
    can: {
      create: !e.def.noCreate && scopeOf(ctx, p.create ?? p.write) !== null,
      write: can(ctx, p.write),
      delete: !e.def.noDelete && can(ctx, p.delete ?? p.write),
      export: scopeOf(ctx, p.export ?? p.read) !== null,
    },
  };
}
