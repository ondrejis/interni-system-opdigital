import { eq } from "drizzle-orm";
import { z } from "zod";
import "../zod-locale";
import { auditChange } from "../audit/audit";
import { schema } from "../db/client";
import { inTx } from "../rbac/context";
import { NotFoundError, PermissionError } from "../rbac/errors";
import { can } from "../rbac/permissions";
import type { Ctx } from "../rbac/types";

export const employeeInput = z.object({
  employeeNo: z.string().trim().max(30).nullish(),
  jobTitle: z.string().trim().max(100).nullish(),
  phone: z.string().trim().max(30).nullish(),
  employmentType: z.enum(["hpp", "dpp", "dpc", "osvc", "external"]).default("hpp"),
  workload: z.number().min(0.05, "Úvazek musí být kladný.").max(1.5),
  hourlyCostMinor: z.number().int().min(0).nullish(),
  startDate: z.iso.date().nullish(),
  licenseGroups: z.string().trim().max(50).nullish(),
});

/**
 * Údaje zaměstnance. Zaměstnanec vidí svůj záznam, ostatní jen s `employees.read`.
 * Hodinový náklad firmy vidí jen ten, kdo má `employees.read` — zaměstnanec o něm neví.
 */
export async function getEmployee(ctx: Ctx, userId: string) {
  const self = ctx.actor.userId === userId;
  const reader = can(ctx, "employees.read");
  if (!self && !reader) throw new PermissionError();
  const [row] = await ctx.db
    .select()
    .from(schema.employee)
    .where(eq(schema.employee.userId, userId));
  if (!row) return null;
  return reader ? row : { ...row, hourlyCostMinor: null };
}

export async function saveEmployee(ctx: Ctx, userId: string, raw: z.input<typeof employeeInput>) {
  if (!can(ctx, "employees.write")) throw new PermissionError();
  const d = employeeInput.parse(raw);
  await inTx(ctx, async (c) => {
    const [u] = await c.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.id, userId));
    if (!u) throw new NotFoundError("Uživatel nenalezen.");
    const [before] = await c.db
      .select()
      .from(schema.employee)
      .where(eq(schema.employee.userId, userId));
    const values = {
      employeeNo: d.employeeNo ?? null,
      jobTitle: d.jobTitle ?? null,
      phone: d.phone ?? null,
      employmentType: d.employmentType,
      workload: d.workload.toFixed(2),
      hourlyCostMinor: d.hourlyCostMinor ?? null,
      startDate: d.startDate ?? null,
      licenseGroups: d.licenseGroups ?? null,
      updatedBy: c.actor.userId,
    };
    await c.db
      .insert(schema.employee)
      .values({ userId, ...values, createdBy: c.actor.userId })
      .onConflictDoUpdate({ target: schema.employee.userId, set: values });
    await auditChange(c, {
      entityType: "employee",
      entityId: userId,
      before: before ? { ...before } : {},
      after: { ...values },
      summary: "Údaje zaměstnance",
    });
  });
}
