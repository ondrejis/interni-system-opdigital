import { eq, getTableColumns } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { recordAudit, diffRecords } from "../audit/audit";
import { NotFoundError, UserError } from "../rbac/errors";
import type { Ctx } from "../rbac/types";
import type { EntityRegistry } from "./engine";
import { indexRecord } from "./search";

const camel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/**
 * Zapíše systémová pole záznamu: sloupce, které nepíše uživatel, ale jiný modul nebo úloha (`drive_folder_id`,
 * `next_activity_at`, `marketing_stage`…). Povolené jsou jen sloupce deklarované v `EntityDef.systemFields`; názvy
 * lze zadat jako vlastnost tabulky (`driveFolderId`) i jako sloupec (`drive_folder_id`). Změna se zapíše do auditu
 * (`actorLabel` = kdo ji způsobil: „n8n“, „Google“, „Systém“…) a záznam se znovu zaindexuje. Volat v transakci
 * (`inTx`). Chybí-li entita v registru (modul není zapnutý), nic se neděje a vrátí `false`; jinak vrací, zda se
 * hodnota změnila.
 */
export async function writeSystemFields(
  ctx: Ctx,
  registry: EntityRegistry,
  entityKey: string,
  id: string,
  patch: Record<string, unknown>,
  opts: { actorLabel?: string } = {},
): Promise<boolean> {
  const def = registry.get(entityKey);
  if (!def) return false;
  const columns = getTableColumns(def.table) as Record<string, AnyPgColumn>;
  const declared = new Set(def.systemFields ?? []);
  const set: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(patch)) {
    const prop = columns[name] ? name : camel(name);
    if (!columns[prop]) throw new UserError(`Entita „${entityKey}“ nemá sloupec „${name}“.`);
    if (!declared.has(prop))
      throw new UserError(`Sloupec „${name}“ entity „${entityKey}“ není systémové pole.`);
    set[prop] = value;
  }
  if (!Object.keys(set).length) return false;
  const idCol = columns.id!;
  const [before] = await ctx.db.select().from(def.table).where(eq(idCol, id));
  if (!before || (before as Record<string, unknown>).deletedAt) throw new NotFoundError();
  const changes = diffRecords(before as Record<string, unknown>, {
    ...(before as Record<string, unknown>),
    ...set,
  });
  if (!changes.length) return false;
  const [after] = await ctx.db.update(def.table).set(set).where(eq(idCol, id)).returning();
  await recordAudit(ctx, {
    action: "update",
    entityType: entityKey,
    entityId: id,
    changes,
    summary: `Systémová pole (${opts.actorLabel ?? (ctx.actor.kind === "user" ? "uživatel" : "systém")})`,
  });
  // změna systémového pole může ovlivnit text hledání (např. stav složky)
  await indexRecord(ctx.db, { def }, after as Record<string, unknown>);
  return true;
}
