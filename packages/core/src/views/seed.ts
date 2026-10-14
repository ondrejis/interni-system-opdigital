import { and, asc, eq, isNull } from "drizzle-orm";
import { schema, type Executor } from "../db/client";
import type { SavedViewConfig } from "../db/schema/views";

/** Výchozí sdílený pohled entity, který modul nasadí klientovi (např. „Moje zakázky“). */
export type SeedViewDef = {
  entityType: string;
  name: string;
  /** Pořadí mezi pohledy entity (menší dřív). */
  position?: number;
  config: SavedViewConfig;
};

/**
 * Založí chybějící výchozí sdílené pohledy. Pohled potřebuje vlastníka, proto se použije nejstarší aktivní
 * uživatel (majitel); bez uživatele se nic neděje a krok se zopakuje při dalším seedu. Pohled stejného názvu,
 * který už existuje (i smazaný správcem), se nezakládá znovu.
 */
export async function ensureSeedViews(db: Executor, views: readonly SeedViewDef[]): Promise<void> {
  if (!views.length) return;
  const [owner] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(and(eq(schema.user.active, true), isNull(schema.user.deletedAt)))
    .orderBy(asc(schema.user.createdAt))
    .limit(1);
  if (!owner) return;
  for (const v of views) {
    const [existing] = await db
      .select({ id: schema.savedView.id })
      .from(schema.savedView)
      .where(
        and(
          eq(schema.savedView.entityType, v.entityType),
          eq(schema.savedView.name, v.name),
          eq(schema.savedView.shared, true),
        ),
      )
      .limit(1);
    if (existing) continue;
    await db.insert(schema.savedView).values({
      entityType: v.entityType,
      name: v.name,
      ownerId: owner.id,
      shared: true,
      position: v.position ?? 0,
      config: v.config,
      createdBy: owner.id,
      updatedBy: owner.id,
    });
  }
}
