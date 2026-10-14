import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@rebar/core/db";
import { assertEntityAccess } from "@rebar/core/entities";
import { defineCommand } from "@rebar/core/module-server";
import { defect } from "./schema";

/** Otevřené vady zakázky pro kartu na Přehledu (nejdřív po termínu, pak podle stáří). */
export const defectsOpen = defineCommand({
  name: "realizace.defects.open",
  permission: "realizace.read",
  input: z.object({ jobId: z.uuid() }),
  handler: async (ctx, i) => {
    await assertEntityAccess(ctx, "job", i.jobId, "read");
    const rows = await ctx.db
      .select({
        id: defect.id,
        title: defect.title,
        severity: defect.severity,
        dueDate: defect.dueDate,
        stage: schema.pipelineStage.name,
      })
      .from(defect)
      .innerJoin(schema.pipelineStage, eq(schema.pipelineStage.id, defect.stageId))
      .where(
        and(
          eq(defect.jobId, i.jobId),
          isNull(defect.deletedAt),
          sql`${schema.pipelineStage.kind} = 'open'`,
        ),
      )
      .orderBy(sql`${defect.dueDate} asc nulls last`, asc(defect.createdAt))
      .limit(50);
    return { count: rows.length, items: rows.slice(0, 5) };
  },
});
