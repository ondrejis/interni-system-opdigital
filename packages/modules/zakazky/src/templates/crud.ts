import { and, eq, isNull, ne } from "drizzle-orm";
import { recordAudit } from "@rebar/core/audit";
import type { ModuleDeps } from "@rebar/core/module-server";
import { inTx, NotFoundError, UserError, type Ctx } from "@rebar/core/rbac";
import { templatePayload, type TemplatePayloadInput, type TemplateView } from "../contract";
import { loadJob, loadTemplate, type TemplateRow } from "../core/lookups";
import { jobTemplate } from "../schema";
import type { BillingModelCode, JobType } from "../shared";
import { payloadFromJob, templateView } from "./payload";

async function mustLoad(c: Ctx, id: string): Promise<TemplateRow> {
  const t = await loadTemplate(c.db, id);
  if (!t) throw new NotFoundError("Šablona nenalezena.");
  return t;
}

async function audit(c: Ctx, action: string, t: { id: string; name: string }, summary: string) {
  await recordAudit(c, {
    action,
    entityType: "job_template",
    entityId: t.id,
    summary,
    entityTitle: t.name,
  });
}

/** Má typ nějakou použitelnou výchozí šablonu (nearchivovanou)? */
async function hasDefault(c: Ctx, type: JobType, exceptId?: string): Promise<boolean> {
  const rows = await c.db
    .select({ id: jobTemplate.id })
    .from(jobTemplate)
    .where(
      and(
        eq(jobTemplate.type, type),
        eq(jobTemplate.isDefault, true),
        isNull(jobTemplate.archivedAt),
        isNull(jobTemplate.deletedAt),
        exceptId ? ne(jobTemplate.id, exceptId) : undefined,
      ),
    );
  return rows.length > 0;
}

/** Založí šablonu. První šablona typu se stane výchozí. Obsah se zkontroluje a normalizuje (`templatePayload`). */
export async function createTemplateImpl(
  ctx: Ctx,
  input: {
    name: string;
    type: JobType;
    description?: string | null | undefined;
    defaultBillingModel: BillingModelCode;
    payload: TemplatePayloadInput;
  },
): Promise<TemplateView> {
  return inTx(ctx, async (c) => {
    const payload = templatePayload.parse(input.payload);
    const [row] = await c.db
      .insert(jobTemplate)
      .values({
        name: input.name,
        type: input.type,
        description: input.description?.trim() || null,
        defaultBillingModel: input.defaultBillingModel,
        isDefault: !(await hasDefault(c, input.type)),
        payload,
        createdBy: c.actor.userId,
        updatedBy: c.actor.userId,
      })
      .returning();
    await audit(c, "create", row!, `Vytvořena šablona zakázky „${row!.name}“`);
    return templateView(row!);
  });
}

/**
 * Upraví šablonu (název, popis, výchozí model fakturace, obsah). Běžící zakázky se nemění: zakázka si při založení
 * obsah zkopírovala.
 */
export async function updateTemplateImpl(
  ctx: Ctx,
  input: {
    id: string;
    name?: string | undefined;
    description?: string | null | undefined;
    defaultBillingModel?: BillingModelCode | undefined;
    payload?: TemplatePayloadInput | undefined;
  },
): Promise<TemplateView> {
  return inTx(ctx, async (c) => {
    const t = await mustLoad(c, input.id);
    const [row] = await c.db
      .update(jobTemplate)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined
          ? { description: input.description?.trim() || null }
          : {}),
        ...(input.defaultBillingModel ? { defaultBillingModel: input.defaultBillingModel } : {}),
        ...(input.payload ? { payload: templatePayload.parse(input.payload) } : {}),
        updatedBy: c.actor.userId,
      })
      .where(eq(jobTemplate.id, t.id))
      .returning();
    await audit(c, "update", row!, `Upravena šablona zakázky „${row!.name}“`);
    return templateView(row!);
  });
}

/** Zduplikuje šablonu (kopie není výchozí a není archivovaná). */
export async function duplicateTemplateImpl(
  ctx: Ctx,
  input: { id: string; name?: string | undefined },
): Promise<TemplateView> {
  return inTx(ctx, async (c) => {
    const t = await mustLoad(c, input.id);
    const [row] = await c.db
      .insert(jobTemplate)
      .values({
        name: input.name ?? `${t.name} (kopie)`,
        type: t.type,
        description: t.description,
        defaultBillingModel: t.defaultBillingModel,
        isDefault: false,
        payload: t.payload,
        createdBy: c.actor.userId,
        updatedBy: c.actor.userId,
      })
      .returning();
    await audit(c, "create", row!, `Šablona „${t.name}“ zduplikována`);
    return templateView(row!);
  });
}

/** Archivuje šablonu (nové zakázky ji nenabídnou, staré zůstanou), nebo ji vrátí. Výchozí šablonu archivovat nejde. */
export async function archiveTemplateImpl(
  ctx: Ctx,
  input: { id: string; archived: boolean },
): Promise<TemplateView> {
  return inTx(ctx, async (c) => {
    const t = await mustLoad(c, input.id);
    if (input.archived && t.isDefault)
      throw new UserError(
        "Výchozí šablonu typu nejde archivovat. Nejdřív nastavte jako výchozí jinou.",
      );
    const [row] = await c.db
      .update(jobTemplate)
      .set({ archivedAt: input.archived ? new Date() : null, updatedBy: c.actor.userId })
      .where(eq(jobTemplate.id, t.id))
      .returning();
    await audit(
      c,
      "update",
      row!,
      input.archived ? `Šablona „${t.name}“ archivována` : `Šablona „${t.name}“ vrácena z archivu`,
    );
    return templateView(row!);
  });
}

/** Nastaví šablonu jako výchozí pro její typ (dosavadní výchozí přestane být). Archivovaná šablona to být nemůže. */
export async function setDefaultTemplateImpl(
  ctx: Ctx,
  input: { id: string },
): Promise<TemplateView> {
  return inTx(ctx, async (c) => {
    const t = await mustLoad(c, input.id);
    if (t.archivedAt) throw new UserError("Archivovaná šablona nemůže být výchozí.");
    if (t.isDefault) return templateView(t);
    await c.db
      .update(jobTemplate)
      .set({ isDefault: false, updatedBy: c.actor.userId })
      .where(
        and(
          eq(jobTemplate.type, t.type),
          eq(jobTemplate.isDefault, true),
          isNull(jobTemplate.deletedAt),
        ),
      );
    const [row] = await c.db
      .update(jobTemplate)
      .set({ isDefault: true, updatedBy: c.actor.userId })
      .where(eq(jobTemplate.id, t.id))
      .returning();
    await audit(c, "update", row!, `Šablona „${t.name}“ je výchozí pro typ`);
    return templateView(row!);
  });
}

/**
 * Uloží hotovou zakázku jako šablonu: fáze bez dat a (když to služba `tasks` umí) otevřené úkoly s termíny jako počet
 * dní od startu. S `replaceId` přepíše obsah existující šablony stejného typu.
 */
export async function saveTemplateFromJobImpl(
  ctx: Ctx,
  deps: ModuleDeps,
  input: {
    jobId: string;
    name: string;
    description?: string | null | undefined;
    includeTasks: boolean;
    replaceId?: string | undefined;
  },
): Promise<TemplateView> {
  return inTx(ctx, async (c) => {
    const j = await loadJob(c, input.jobId);
    const payload = await payloadFromJob(c, deps, input.jobId, {
      includeTasks: input.includeTasks,
    });
    if (!payload.phases.length && !payload.tasks.length)
      throw new UserError("Zakázka nemá fáze ani úkoly, které by šlo uložit do šablony.");
    if (input.replaceId) {
      const t = await mustLoad(c, input.replaceId);
      if (t.type !== j.type) throw new UserError("Šablona je pro jiný typ zakázky.");
      const [row] = await c.db
        .update(jobTemplate)
        .set({
          name: input.name,
          description: input.description?.trim() || t.description,
          payload,
          updatedBy: c.actor.userId,
        })
        .where(eq(jobTemplate.id, t.id))
        .returning();
      await audit(c, "update", row!, `Šablona „${row!.name}“ přepsána ze zakázky ${j.number}`);
      return templateView(row!);
    }
    const [row] = await c.db
      .insert(jobTemplate)
      .values({
        name: input.name,
        type: j.type,
        description: input.description?.trim() || null,
        defaultBillingModel: j.billingModel,
        isDefault: !(await hasDefault(c, j.type)),
        payload,
        createdBy: c.actor.userId,
        updatedBy: c.actor.userId,
      })
      .returning();
    await audit(c, "create", row!, `Šablona „${row!.name}“ uložena ze zakázky ${j.number}`);
    return templateView(row!);
  });
}
