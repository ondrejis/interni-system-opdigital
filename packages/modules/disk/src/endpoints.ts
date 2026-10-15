/*
  Napojení na n8n: které aktivní webhooky odebírají události `drive.*` a jestli smějí dostat soukromé záznamy.
  Čte jádrovou tabulku `webhook_endpoint` (Nastavení → Integrace). Pomáhá hlásit „není nastaven webhook“ hned,
  ne až po 10 minutách čekání.
*/
import { and, eq, isNull } from "drizzle-orm";
import { schema, type Executor } from "@rebar/core/db";

/** Odebírá endpoint událost `name`? Seznam obsahuje přesné názvy, skupiny s hvězdičkou (`drive.*`) nebo `*`. */
export function endpointMatches(events: readonly string[], name: string): boolean {
  return events.some(
    (e) => e === "*" || e === name || (e.endsWith(".*") && name.startsWith(e.slice(0, -1))),
  );
}

/** Aktivní endpoint pro události Disku. */
export type DriveEndpoint = { id: string; name: string; includePrivate: boolean };

/** Aktivní webhooky, které odebírají (alespoň některé) události `drive.*`. */
export async function driveEndpoints(db: Executor): Promise<DriveEndpoint[]> {
  const rows = await db
    .select({
      id: schema.webhookEndpoint.id,
      name: schema.webhookEndpoint.name,
      events: schema.webhookEndpoint.events,
      includePrivate: schema.webhookEndpoint.includePrivate,
    })
    .from(schema.webhookEndpoint)
    .where(and(eq(schema.webhookEndpoint.active, true), isNull(schema.webhookEndpoint.deletedAt)));
  return rows
    .filter(
      (r) =>
        endpointMatches(r.events, "drive.client.create") ||
        r.events.some((e) => e.startsWith("drive.")),
    )
    .map((r) => ({ id: r.id, name: r.name, includePrivate: r.includePrivate }));
}
