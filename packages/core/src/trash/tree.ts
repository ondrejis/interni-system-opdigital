import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { getTableColumns } from "drizzle-orm";
import { recordAudit } from "../audit/audit";
import { childLinks, parentLinks, type LinkRegistry } from "../entities/links";
import { indexRecord, removeFromIndex } from "../entities/search";
import type { EntityDef } from "../entities/types";
import { syncPrivateRecord } from "../entities/visibility";
import { NotFoundError, UserError } from "../rbac/errors";
import type { Ctx } from "../rbac/types";

type Row = Record<string, unknown>;

/** Jak dlouho zůstane smazaný záznam v koši, než ho úklidová úloha smaže natrvalo. */
export const TRASH_RETENTION_DAYS = 30;

const MAX_DEPTH = 5;

const titleOf = (def: EntityDef, raw: Row): string => {
  const field = def.attributes.find((a) => a.key === def.titleKey)?.field;
  return field ? String(raw[field] ?? "") : "";
};

/**
 * Soft-delete záznamu a všeho podřízeného (`children`, `visibility.parents` jiných entit). Všechny řádky dostanou
 * stejnou dávku `deleted_batch` = id kořene, takže koš ukáže jen kořen a obnova vrátí celou dávku. Záznam je odebrán
 * z hledání, do historie se zapíše smazání kořene i každého podřízeného záznamu entity. Volat v transakci (`inTx`).
 * Vrací počet smazaných podřízených řádků.
 */
export async function deleteTree(
  c: Ctx,
  registry: LinkRegistry,
  def: EntityDef,
  id: string,
): Promise<number> {
  const cols = getTableColumns(def.table) as Record<string, AnyPgColumn>;
  const [raw] = (await c.db
    .select()
    .from(def.table)
    .where(and(eq(cols.id!, id), sql`${cols.deletedAt} is null`))) as Row[];
  if (!raw) throw new NotFoundError();
  const now = new Date();
  const stamp = { deletedAt: now, deletedBy: c.actor.userId, deletedBatch: id };
  const visited = new Set<string>([`${def.key}:${id}`]);
  let children = 0;

  const markRow = (
    table: EntityDef["table"],
    columns: Record<string, AnyPgColumn>,
    rowId: string,
  ) => {
    const set: Row = { deletedAt: now };
    if (columns.deletedBy) set.deletedBy = stamp.deletedBy;
    if (columns.deletedBatch) set.deletedBatch = stamp.deletedBatch;
    if (columns.updatedBy) set.updatedBy = c.actor.userId;
    return c.db.update(table).set(set).where(eq(columns.id!, rowId));
  };

  await markRow(def.table, cols, id);
  await removeFromIndex(c.db, def.key, id);
  await recordAudit(c, {
    action: "delete",
    entityType: def.key,
    entityId: id,
    summary: titleOf(def, raw),
    entityTitle: titleOf(def, raw),
    isPrivate: raw.isPrivate === true,
  });

  async function walk(parent: EntityDef, parentId: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH) return;
    for (const link of childLinks(registry, parent.key)) {
      const cc = link.columns;
      // tabulka bez měkkého mazání (historie fází…) nebo bez sloupce `id` (podíly platby: složený klíč) se smaže až při trvalém smazání rodiče
      if (!cc.deletedAt || !cc.id) continue;
      const rows = (await c.db
        .select()
        .from(link.table)
        .where(and(eq(link.fk, parentId), sql`${cc.deletedAt} is null`))) as Row[];
      for (const row of rows) {
        const childId = String(row.id);
        const mark = `${link.entityType}:${childId}`;
        if (visited.has(mark)) continue;
        visited.add(mark);
        await markRow(link.table, cc, childId);
        children++;
        if (link.def) {
          await removeFromIndex(c.db, link.def.key, childId);
          await recordAudit(c, {
            action: "delete",
            entityType: link.def.key,
            entityId: childId,
            summary: titleOf(link.def, row),
            entityTitle: titleOf(link.def, row),
            isPrivate: row.isPrivate === true,
            context: { cascadedFrom: { entityType: def.key, id } },
          });
          await walk(link.def, childId, depth + 1);
        }
      }
    }
  }
  await walk(def, id, 1);
  return children;
}

/**
 * Obnoví smazaný záznam a podřízené řádky smazané stejnou dávkou. Nejdřív musí být obnovený smazaný rodič (jinak by
 * záznam visel pod smazaným záznamem). `reindex` znovu zapíše záznamy do hledání (engine předá správně rozřešenou
 * entitu s vlastními poli). Vrací počet obnovených řádků včetně kořene.
 */
export async function restoreTree(
  c: Ctx,
  registry: LinkRegistry,
  def: EntityDef,
  id: string,
  reindex?: (def: EntityDef, row: Row) => Promise<void>,
): Promise<number> {
  const cols = getTableColumns(def.table) as Record<string, AnyPgColumn>;
  const [raw] = (await c.db
    .select()
    .from(def.table)
    .where(and(eq(cols.id!, id), isNotNull(cols.deletedAt!)))) as Row[];
  if (!raw) throw new NotFoundError();
  const batch = (raw.deletedBatch as string | null) ?? id;

  for (const p of parentLinks(registry, def)) {
    const parentId = raw[p.fkName];
    if (typeof parentId !== "string") continue;
    const pc = getTableColumns(p.def.table) as Record<string, AnyPgColumn>;
    const [parent] = (await c.db.select().from(p.def.table).where(eq(pc.id!, parentId))) as Row[];
    if (parent?.deletedAt)
      throw new UserError(
        `Nejdřív obnovte nadřazený záznam („${titleOf(p.def, parent) || p.def.label.one}“), ke kterému patří.`,
      );
  }

  let restored = 0;
  const visited = new Set<string>();
  const reindexRow = async (d: EntityDef, row: Row) => {
    const live = { ...row, deletedAt: null };
    if (reindex) await reindex(d, live);
    else await indexRecord(c.db, { def: d }, live);
  };

  const restoreRow = async (
    table: EntityDef["table"],
    columns: Record<string, AnyPgColumn>,
    row: Row,
    d: EntityDef | undefined,
  ) => {
    const set: Row = { deletedAt: null };
    if (columns.deletedBy) set.deletedBy = null;
    if (columns.deletedBatch) set.deletedBatch = null;
    if (columns.updatedBy) set.updatedBy = c.actor.userId;
    await c.db
      .update(table)
      .set(set)
      .where(eq(columns.id!, String(row.id)));
    restored++;
    if (d) {
      await reindexRow(d, row);
      if (row.isPrivate === true) await syncPrivateRecord(c.db, d.key, String(row.id), true);
    }
  };

  await restoreRow(def.table, cols, raw, def);
  await recordAudit(c, {
    action: "restore",
    entityType: def.key,
    entityId: id,
    summary: titleOf(def, raw),
    entityTitle: titleOf(def, raw),
    isPrivate: raw.isPrivate === true,
  });
  visited.add(`${def.key}:${id}`);

  async function walk(parent: EntityDef, parentId: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH) return;
    for (const link of childLinks(registry, parent.key)) {
      const cc = link.columns;
      if (!cc.deletedAt || !cc.deletedBatch || !cc.id) continue;
      const rows = (await c.db
        .select()
        .from(link.table)
        .where(
          and(eq(link.fk, parentId), isNotNull(cc.deletedAt), eq(cc.deletedBatch, batch)),
        )) as Row[];
      for (const row of rows) {
        const mark = `${link.entityType}:${String(row.id)}`;
        if (visited.has(mark)) continue;
        visited.add(mark);
        await restoreRow(link.table, cc, row, link.def);
        if (link.def) {
          await recordAudit(c, {
            action: "restore",
            entityType: link.def.key,
            entityId: String(row.id),
            summary: titleOf(link.def, row),
            entityTitle: titleOf(link.def, row),
            isPrivate: row.isPrivate === true,
            context: { cascadedFrom: { entityType: def.key, id } },
          });
          await walk(link.def, String(row.id), depth + 1);
        }
      }
    }
  }
  await walk(def, id, 1);
  return restored;
}
