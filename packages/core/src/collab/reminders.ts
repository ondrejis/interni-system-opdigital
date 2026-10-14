import { schema, type Executor } from "../db/client";

/**
 * Zabere si klíč připomínky. Vrací `true` jen poprvé; kdo `false` dostane, připomínku už někdo odeslal,
 * takže ji znovu posílat nemá. Díky jednomu `INSERT … ON CONFLICT` je to bezpečné i při souběžných bězích.
 */
export async function claimReminder(db: Executor, key: string): Promise<boolean> {
  const rows = await db
    .insert(schema.reminderSent)
    .values({ key })
    .onConflictDoNothing()
    .returning({ key: schema.reminderSent.key });
  return rows.length > 0;
}
