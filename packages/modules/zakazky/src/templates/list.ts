import { and, asc, eq, isNull } from "drizzle-orm";
import type { ServiceType } from "@rebar/core/contracts";
import type { Ctx } from "@rebar/core/rbac";
import type { TemplateBrief } from "../api";
import type { TemplateListItem } from "../contract";
import { jobTemplate } from "../schema";
import { templateItem } from "./payload";

/** Šablony pro výběr v dialozích (bez archivovaných; výchozí typu první). */
export async function listTemplatesImpl(ctx: Ctx, type?: ServiceType): Promise<TemplateBrief[]> {
  const rows = await ctx.db
    .select()
    .from(jobTemplate)
    .where(
      and(
        isNull(jobTemplate.deletedAt),
        isNull(jobTemplate.archivedAt),
        type ? eq(jobTemplate.type, type) : undefined,
      ),
    )
    .orderBy(asc(jobTemplate.type), asc(jobTemplate.name));
  return rows
    .map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      isDefault: r.isDefault,
      defaultBilling: r.defaultBillingModel,
    }))
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}

/** Seznam šablon se souhrnem obsahu (správa šablon). */
export async function listTemplateItemsImpl(
  ctx: Ctx,
  input: { type?: ServiceType | undefined; includeArchived: boolean },
): Promise<TemplateListItem[]> {
  const rows = await ctx.db
    .select()
    .from(jobTemplate)
    .where(
      and(
        isNull(jobTemplate.deletedAt),
        input.includeArchived ? undefined : isNull(jobTemplate.archivedAt),
        input.type ? eq(jobTemplate.type, input.type) : undefined,
      ),
    )
    .orderBy(asc(jobTemplate.type), asc(jobTemplate.name));
  return rows.map(templateItem);
}
