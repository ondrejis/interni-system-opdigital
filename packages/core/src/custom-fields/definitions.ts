import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import "../zod-locale";
import { recordAudit } from "../audit/audit";
import { schema, type Executor } from "../db/client";
import type { AuditChange } from "../db/schema/audit";
import { CUSTOM_FIELD_TYPES } from "../db/schema/config";
import { normalizeValue } from "./validate";
import { inTx } from "../rbac/context";
import { NotFoundError, UserError } from "../rbac/errors";
import { assertCan } from "../rbac/permissions";
import type { Ctx } from "../rbac/types";

const optionsSchema = z.object({
  choices: z
    .array(
      z.object({
        value: z
          .string()
          .regex(
            /^[a-z0-9_]+$/,
            "Hodnota možnosti smí mít jen malá písmena, číslice a podtržítko.",
          ),
        label: z.string().trim().min(1),
        color: z.string().optional(),
      }),
    )
    .optional(),
  entityType: z.string().min(1).optional(),
  defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
  hidden: z.boolean().optional(),
});

export const fieldInput = z.object({
  entityType: z.string().min(1),
  key: z
    .string()
    .regex(
      /^[a-z][a-z0-9_]{1,40}$/,
      "Klíč pole: malá písmena, číslice a podtržítko, začíná písmenem.",
    ),
  label: z.string().trim().min(1, "Vyplňte název pole.").max(80),
  type: z.enum(CUSTOM_FIELD_TYPES),
  options: optionsSchema.default({}),
  required: z.boolean().default(false),
  showInTable: z.boolean().default(true),
});

/** Zkontroluje možnosti pole a vrátí je s normalizovanou výchozí hodnotou. */
function checkOptions(
  type: (typeof CUSTOM_FIELD_TYPES)[number],
  options: z.infer<typeof optionsSchema>,
): z.infer<typeof optionsSchema> {
  if (type === "select" || type === "multiselect") {
    const choices = options.choices ?? [];
    if (!choices.length) throw new UserError("Přidejte alespoň jednu možnost.");
    if (new Set(choices.map((c) => c.value)).size !== choices.length)
      throw new UserError("Hodnoty možností se opakují.");
  }
  if (type === "record" && !options.entityType)
    throw new UserError("U odkazu na záznam vyberte typ záznamu.");
  if (options.defaultValue === undefined || options.defaultValue === "") {
    const { defaultValue: _drop, ...rest } = options;
    return rest;
  }
  if (type === "user" || type === "record" || type === "multiselect")
    throw new UserError("U tohoto typu pole výchozí hodnotu nastavit nejde.");
  try {
    return {
      ...options,
      defaultValue: normalizeValue({ type, options }, options.defaultValue) as
        string | number | boolean,
    };
  } catch (e) {
    if (typeof e !== "string") throw e;
    throw new UserError(`Výchozí hodnota ${e}.`);
  }
}

/** Definice vlastních polí entity v pořadí. Čtou je všichni přihlášení (potřebují je formuláře a tabulky). */
export async function listFieldDefs(db: Executor, entityType: string) {
  return db
    .select()
    .from(schema.customFieldDef)
    .where(
      and(
        eq(schema.customFieldDef.entityType, entityType),
        isNull(schema.customFieldDef.deletedAt),
      ),
    )
    .orderBy(asc(schema.customFieldDef.position), asc(schema.customFieldDef.createdAt));
}

export async function createFieldDef(ctx: Ctx, raw: z.input<typeof fieldInput>) {
  assertCan(ctx, "settings.manage");
  const parsed = fieldInput.parse(raw);
  const d = { ...parsed, options: checkOptions(parsed.type, parsed.options) };
  return inTx(ctx, async (c) => {
    const existing = await c.db
      .select({ id: schema.customFieldDef.id })
      .from(schema.customFieldDef)
      .where(
        and(
          eq(schema.customFieldDef.entityType, d.entityType),
          eq(schema.customFieldDef.key, d.key),
          isNull(schema.customFieldDef.deletedAt),
        ),
      );
    if (existing.length) throw new UserError("Pole s tímto klíčem už existuje.");
    const count = (await listFieldDefs(c.db, d.entityType)).length;
    const [row] = await c.db
      .insert(schema.customFieldDef)
      .values({ ...d, position: count, createdBy: c.actor.userId, updatedBy: c.actor.userId })
      .returning();
    await recordAudit(c, {
      action: "create",
      entityType: "custom_field_def",
      entityId: row!.id,
      summary: `Vlastní pole „${d.label}“ (${d.entityType})`,
      changes: [{ field: "type", old: null, new: d.type }],
    });
    return row!;
  });
}

/** Typ a klíč pole se nemění (rozbilo by uložená data); jde změnit název, možnosti, povinnost a zobrazení. */
export async function updateFieldDef(
  ctx: Ctx,
  id: string,
  patch: {
    label?: string;
    options?: z.input<typeof optionsSchema>;
    required?: boolean;
    showInTable?: boolean;
    position?: number;
  },
) {
  assertCan(ctx, "settings.manage");
  await inTx(ctx, async (c) => {
    const [before] = await c.db
      .select()
      .from(schema.customFieldDef)
      .where(and(eq(schema.customFieldDef.id, id), isNull(schema.customFieldDef.deletedAt)));
    if (!before) throw new NotFoundError("Pole nenalezeno.");
    const options = checkOptions(
      before.type,
      patch.options ? optionsSchema.parse(patch.options) : before.options,
    );
    const after = {
      label: patch.label?.trim() || before.label,
      options,
      required: patch.required ?? before.required,
      showInTable: patch.showInTable ?? before.showInTable,
      position: patch.position ?? before.position,
    };
    await c.db
      .update(schema.customFieldDef)
      .set({ ...after, updatedBy: c.actor.userId })
      .where(eq(schema.customFieldDef.id, id));
    const changes: AuditChange[] = (["label", "required", "showInTable", "position"] as const)
      .filter((f) => after[f] !== before[f])
      .map((f) => ({ field: f, old: before[f], new: after[f] }));
    if (JSON.stringify(after.options) !== JSON.stringify(before.options))
      changes.push({ field: "options", old: before.options, new: after.options });
    if (changes.length)
      await recordAudit(c, {
        action: "update",
        entityType: "custom_field_def",
        entityId: id,
        changes,
      });
  });
}

/** Smaže (měkce) definici; hodnoty v záznamech zůstanou, jen se přestanou zobrazovat. */
export async function deleteFieldDef(ctx: Ctx, id: string) {
  assertCan(ctx, "settings.manage");
  await inTx(ctx, async (c) => {
    const [row] = await c.db
      .update(schema.customFieldDef)
      .set({ deletedAt: new Date(), updatedBy: c.actor.userId })
      .where(and(eq(schema.customFieldDef.id, id), isNull(schema.customFieldDef.deletedAt)))
      .returning();
    if (!row) throw new NotFoundError("Pole nenalezeno.");
    await recordAudit(c, {
      action: "delete",
      entityType: "custom_field_def",
      entityId: id,
      summary: `Vlastní pole „${row.label}“ smazáno`,
    });
  });
}

/** Přeuspořádá pole entity; `orderedIds` musí obsahovat všechna aktivní pole entity právě jednou. */
export async function reorderFieldDefs(
  ctx: Ctx,
  entityType: string,
  orderedIds: readonly string[],
) {
  assertCan(ctx, "settings.manage");
  await inTx(ctx, async (c) => {
    const current = await listFieldDefs(c.db, entityType);
    const same =
      current.length === orderedIds.length &&
      new Set(orderedIds).size === orderedIds.length &&
      current.every((f) => orderedIds.includes(f.id));
    if (!same) throw new UserError("Pořadí musí obsahovat všechna pole právě jednou.");
    for (const [i, id] of orderedIds.entries()) {
      await c.db
        .update(schema.customFieldDef)
        .set({ position: i, updatedBy: c.actor.userId })
        .where(eq(schema.customFieldDef.id, id));
    }
    await recordAudit(c, {
      action: "reorder",
      entityType: "custom_field_def",
      entityId: entityType,
      summary: `Změněno pořadí vlastních polí (${entityType})`,
    });
  });
}

/** Vrátí smazané pole, pokud mezitím nevzniklo jiné se stejným klíčem (zpět po omylu; hodnoty v záznamech zůstaly). */
export async function restoreFieldDef(ctx: Ctx, id: string) {
  assertCan(ctx, "settings.manage");
  await inTx(ctx, async (c) => {
    const [row] = await c.db
      .select()
      .from(schema.customFieldDef)
      .where(eq(schema.customFieldDef.id, id));
    if (!row || !row.deletedAt) throw new NotFoundError("Pole nenalezeno.");
    const clash = await c.db
      .select({ id: schema.customFieldDef.id })
      .from(schema.customFieldDef)
      .where(
        and(
          eq(schema.customFieldDef.entityType, row.entityType),
          eq(schema.customFieldDef.key, row.key),
          isNull(schema.customFieldDef.deletedAt),
        ),
      );
    if (clash.length)
      throw new UserError("Pole se stejným klíčem mezitím vzniklo, obnovit ho nejde.");
    const count = (await listFieldDefs(c.db, row.entityType)).length;
    await c.db
      .update(schema.customFieldDef)
      .set({ deletedAt: null, position: count, updatedBy: c.actor.userId })
      .where(eq(schema.customFieldDef.id, id));
    await recordAudit(c, {
      action: "restore",
      entityType: "custom_field_def",
      entityId: id,
      summary: `Vlastní pole „${row.label}“ obnoveno`,
    });
  });
}
