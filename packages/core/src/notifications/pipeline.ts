import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { schema, type Executor } from "../db/client";
import type { DeliveryPlan } from "./rules";
import type { Severity } from "./types";

/** Kanál, na který worker poslouchá (LISTEN), aby odeslal čerstvá upozornění hned, ne až při minutovém průchodu. */
export const NOTIFY_CHANNEL = "notification_new";

/** Hotové upozornění pro jednoho příjemce, včetně rozhodnutí o doručení. */
export type Draft = {
  userId: string;
  kind: string;
  severity: Severity;
  title: string;
  body: string | null;
  url: string | null;
  entityType: string | null;
  entityId: string | null;
  dedupeKey: string | null;
  collapseKey: string | null;
  mergeWindowSeconds: number;
  plan: DeliveryPlan;
};

export type InsertResult = {
  created: number;
  merged: number;
  /** Idempotence: upozornění se stejným klíčem už pro příjemce existuje. */
  deduped: number;
  /** Nic k doručení (všechny kanály vypnuté). */
  dropped: number;
};

type NewDelivery = typeof schema.notificationDelivery.$inferInsert;

function deliveriesFor(notificationId: string, d: Draft, now: Date): NewDelivery[] {
  const rows: NewDelivery[] = [];
  const base = { notificationId, userId: d.userId, createdAt: now };
  const p = d.plan.push;
  if (p.deliver)
    rows.push({
      ...base,
      channel: "push",
      status: p.mode === "instant" ? "queued" : "held",
      mode: p.mode,
      releaseAt: p.releaseAt,
    });
  else if (p.reason === "user_off")
    rows.push({
      ...base,
      channel: "push",
      status: "skipped",
      reason: "user_off",
      releaseAt: now,
    });
  if (d.plan.email)
    rows.push({ ...base, channel: "email", status: "queued", mode: "instant", releaseAt: now });
  return rows;
}

const PENDING = ["queued", "held", "retry", "sending"] as const;

/**
 * Zapíše upozornění do Inboxu a naplánuje doručení (outbox): vše běží v transakci volajícího, takže při jejím
 * zrušení nevznikne nic. Doručení do zařízení a e-mailem dělá worker až po potvrzení transakce.
 */
export async function insertDrafts(
  db: Executor,
  drafts: readonly Draft[],
  now = new Date(),
): Promise<InsertResult> {
  const out: InsertResult = { created: 0, merged: 0, deduped: 0, dropped: 0 };
  /** Komu se plánuje doručení; jde do `NOTIFY` jako informace (worker ji nepotřebuje, hodí se při ladění a v testech). */
  const scheduledFor = new Set<string>();
  for (const d of drafts) {
    const { plan } = d;
    if (!plan.bell && !plan.push.deliver && !plan.email) {
      out.dropped++;
      continue;
    }

    // sloučení: nepřečtené upozornění téže události a záznamu se aktualizuje místo přidání dalšího
    if (d.collapseKey && d.mergeWindowSeconds > 0) {
      const since = new Date(now.getTime() - d.mergeWindowSeconds * 1000);
      const [target] = await db
        .select({ id: schema.notification.id, count: schema.notification.count })
        .from(schema.notification)
        .where(
          and(
            eq(schema.notification.userId, d.userId),
            eq(schema.notification.collapseKey, d.collapseKey),
            isNull(schema.notification.readAt),
            gte(schema.notification.updatedAt, since),
          ),
        )
        .orderBy(desc(schema.notification.updatedAt))
        .limit(1)
        .for("update");
      if (target) {
        const count = target.count + 1;
        await db
          .update(schema.notification)
          .set({
            count,
            title: `${d.title} (${count}×)`,
            body: d.body,
            url: d.url,
            severity: d.severity,
            inbox: plan.bell || undefined,
            createdAt: now,
            updatedAt: now,
          })
          .where(eq(schema.notification.id, target.id));
        const pending = await db
          .select({
            id: schema.notificationDelivery.id,
            channel: schema.notificationDelivery.channel,
          })
          .from(schema.notificationDelivery)
          .where(
            and(
              eq(schema.notificationDelivery.notificationId, target.id),
              inArray(schema.notificationDelivery.status, [...PENDING]),
            ),
          );
        const have = new Set(pending.map((p) => p.channel));
        const fresh = deliveriesFor(target.id, d, now).filter((r) => !have.has(r.channel));
        if (fresh.length) {
          await db.insert(schema.notificationDelivery).values(fresh);
          if (fresh.some((r) => r.status !== "skipped")) scheduledFor.add(d.userId);
        }
        out.merged++;
        continue;
      }
    }

    const [row] = await db
      .insert(schema.notification)
      .values({
        userId: d.userId,
        kind: d.kind,
        severity: d.severity,
        title: d.title,
        body: d.body,
        url: d.url,
        entityType: d.entityType,
        entityId: d.entityId,
        inbox: plan.bell,
        dedupeKey: d.dedupeKey,
        collapseKey: d.collapseKey,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: schema.notification.id });
    if (!row) {
      out.deduped++;
      continue;
    }
    out.created++;
    const rows = deliveriesFor(row.id, d, now);
    if (rows.length) {
      await db.insert(schema.notificationDelivery).values(rows);
      if (rows.some((r) => r.status !== "skipped")) scheduledFor.add(d.userId);
    }
  }
  // NOTIFY se doručí až po potvrzení transakce: worker se probudí, když už jsou řádky vidět
  if (scheduledFor.size)
    await db.execute(
      sql`select pg_notify(${NOTIFY_CHANNEL}, ${[...scheduledFor].slice(0, 20).join(",")})`,
    );
  return out;
}
