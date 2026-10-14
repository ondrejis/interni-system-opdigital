import { createHash } from "node:crypto";
import { and, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { schema, type Executor } from "../db/client";
import { pushToUser, type PushPayload, type PushSender } from "../push/push";
import { getEventDef } from "./catalog";
import type { Severity } from "./types";

/*
  Doručování upozornění (worker). Zdrojem je tabulka `notification_delivery`: řádek je zároveň fronta a protokol.
  Odeslání se vždy děje tady, nikdy v požadavku uživatele; řádky vznikají v transakci změny (outbox), takže se
  neodešle nic, co se nepotvrdilo, a nic se neztratí, když worker právě neběží.
*/

export type EmailMessage = { to: string; subject: string; body: string; url: string | null };

/** Odesílání e-mailů není nastavené (SMTP): doručení se přeskočí, neopakuje. */
export class EmailNotConfiguredError extends Error {
  constructor() {
    super("Odesílání e-mailů není nastavené.");
    this.name = "EmailNotConfiguredError";
  }
}

export type DispatchDeps = {
  db: Executor;
  /** `null` = klíče VAPID nejsou nastavené, push se přeskakuje. */
  push: PushSender | null;
  /** Odešle e-mail s upozorněním (zařadí do fronty e-mailů); `null` = SMTP není nastavené. */
  email?: ((mail: EmailMessage) => Promise<void>) | null | undefined;
  now?: Date;
  /** Zpracovat jen doručení těchto uživatelů (testy, ruční odeslání). */
  userIds?: readonly string[] | undefined;
};

export type DispatchResult = {
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
  retried: number;
  deferred: number;
};

/** Po každém neúspěšném pokusu se čeká déle; po posledním je doručení „failed“. */
export const RETRY_BACKOFF_SECONDS = [30, 120, 600, 1800, 7200, 21600] as const;
export const MAX_ATTEMPTS = RETRY_BACKOFF_SECONDS.length + 1;
/** Víc než tolik běžných upozornění naráz se pošle jako jedno shrnutí. */
export const BURST_LIMIT = 3;
/** Kolik push zpráv za 10 minut je pro jednoho člověka ještě normální; nad to se běžná upozornění zdrží. */
export const RATE_LIMIT_PER_10_MIN = 20;
const MAX_URGENT_INDIVIDUAL = 10;
const STALE_CLAIM_MS = 5 * 60_000;
/** Upozornění starší než to se do zařízení neposílá (už nejsou aktuální). */
const NORMAL_MAX_AGE_MS = 24 * 3_600_000;
const URGENT_MAX_AGE_MS = 6 * 3_600_000;

export const ttlFor = (kind: string, severity: Severity): number =>
  getEventDef(kind)?.ttlSeconds ?? (severity === "urgent" ? 6 * 3600 : 24 * 3600);

/** Téma push zprávy (RFC 8030): nejvýš 32 znaků base64url; zpráva se stejným tématem nahradí nedoručenou starší. */
export const topicOf = (tag: string) =>
  createHash("sha256").update(tag).digest("base64url").slice(0, 32);

export const tagOf = (n: { id: string; collapseKey: string | null }) =>
  n.collapseKey ?? `n:${n.id}`;

type Row = {
  d: typeof schema.notificationDelivery.$inferSelect;
  n: typeof schema.notification.$inferSelect;
  email: string;
  active: boolean;
};

type Outcome =
  | { status: "sent"; detail?: Record<string, unknown>; reason?: string }
  | { status: "skipped"; reason: string; detail?: Record<string, unknown> }
  | { status: "failed"; reason: string; error?: string; detail?: Record<string, unknown> }
  | { status: "retry"; error: string; detail?: Record<string, unknown> }
  | { status: "defer"; until: Date; reason: string };

/**
 * Zpracuje všechna doručení, jejichž čas nadešel. Bezpečné spouštět souběžně (každý řádek zpracuje jen jeden běh)
 * i opakovaně. Řádky, které zůstaly „sending“ po pádu workeru, se po pěti minutách zpracují znovu.
 */
export async function dispatchDue(deps: DispatchDeps): Promise<DispatchResult> {
  const { db } = deps;
  const now = deps.now ?? new Date();
  const result: DispatchResult = {
    claimed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    retried: 0,
    deferred: 0,
  };
  for (let round = 0; round < 10; round++) {
    const stale = new Date(now.getTime() - STALE_CLAIM_MS);
    const only = deps.userIds
      ? !deps.userIds.length
        ? sql`and false`
        : sql`and user_id in (${sql.join(
            deps.userIds.map((u) => sql`${u}::uuid`),
            sql`, `,
          )})`
      : sql``;
    const claimed = await db.execute<{ id: string }>(sql`
      update notification_delivery d
         set status = 'sending', claimed_at = ${now.toISOString()}::timestamptz, attempts = d.attempts + 1
       where d.id in (
         select id from notification_delivery
          where ((status in ('queued', 'held', 'retry') and release_at <= ${now.toISOString()}::timestamptz)
             or (status = 'sending' and claimed_at < ${stale.toISOString()}::timestamptz))
             ${only}
          order by release_at
          limit 200
          for update skip locked)
      returning d.id`);
    const ids = [...claimed].map((r) => r.id);
    if (!ids.length) break;
    result.claimed += ids.length;

    const rows: Row[] = await db
      .select({
        d: schema.notificationDelivery,
        n: schema.notification,
        email: schema.user.email,
        active: schema.user.active,
        deletedAt: schema.user.deletedAt,
      })
      .from(schema.notificationDelivery)
      .innerJoin(
        schema.notification,
        eq(schema.notificationDelivery.notificationId, schema.notification.id),
      )
      .innerJoin(schema.user, eq(schema.notificationDelivery.userId, schema.user.id))
      .where(inArray(schema.notificationDelivery.id, ids))
      .then((rs) => rs.map((r) => ({ ...r, active: r.active && !r.deletedAt })));

    const groups = new Map<string, Row[]>();
    for (const r of rows) {
      const key = `${r.d.userId}|${r.d.channel}`;
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    for (const items of groups.values()) {
      const outcomes =
        items[0]!.d.channel === "push"
          ? await processPush(deps, items, now)
          : await processEmail(deps, items, now);
      for (const it of items) {
        // řádek bez výsledku (chyba v rozhodování) se zkusí znovu, nezůstane viset ve stavu „sending“
        const o: Outcome = outcomes.get(it.d.id) ?? { status: "retry", error: "nezpracováno" };
        await settle(db, it, o, now);
        if (o.status === "sent") result.sent++;
        else if (o.status === "skipped") result.skipped++;
        else if (o.status === "failed") result.failed++;
        else if (o.status === "retry") result.retried++;
        else result.deferred++;
      }
    }
    if (ids.length < 200) break;
  }
  return result;
}

async function settle(db: Executor, row: Row, o: Outcome, now: Date): Promise<void> {
  const set: Partial<typeof schema.notificationDelivery.$inferInsert> = {};
  switch (o.status) {
    case "sent":
      Object.assign(set, {
        status: "sent",
        sentAt: now,
        reason: o.reason ?? null,
        detail: o.detail ?? null,
        lastError: null,
      });
      break;
    case "skipped":
      Object.assign(set, { status: "skipped", reason: o.reason, detail: o.detail ?? null });
      break;
    case "failed":
      Object.assign(set, {
        status: "failed",
        reason: o.reason,
        lastError: o.error ?? null,
        detail: o.detail ?? null,
      });
      break;
    case "retry": {
      const wait =
        RETRY_BACKOFF_SECONDS[Math.min(row.d.attempts, RETRY_BACKOFF_SECONDS.length) - 1]!;
      Object.assign(set, {
        status: "retry",
        releaseAt: new Date(now.getTime() + wait * 1000),
        lastError: o.error,
        detail: o.detail ?? null,
      });
      break;
    }
    case "defer":
      // odložení není pokus: počítadlo se vrací zpět
      Object.assign(set, {
        status: "held",
        releaseAt: o.until,
        reason: o.reason,
        attempts: Math.max(0, row.d.attempts - 1),
      });
      break;
  }
  await db
    .update(schema.notificationDelivery)
    .set(set)
    .where(eq(schema.notificationDelivery.id, row.d.id));
}

/** Společné předfiltrování: neaktivní uživatel, už přečtené, zastaralé a sloučené. */
function prefilter(items: Row[], now: Date): { live: Row[]; outcomes: Map<string, Outcome> } {
  const outcomes = new Map<string, Outcome>();
  const live: Row[] = [];
  for (const r of items) {
    // měří se od plánovaného odeslání, ne od vzniku: upozornění zdržené shrnutím nebo tichými hodinami není „staré“
    const age = now.getTime() - r.d.releaseAt.getTime();
    const max = r.n.severity === "urgent" ? URGENT_MAX_AGE_MS : NORMAL_MAX_AGE_MS;
    if (!r.active) outcomes.set(r.d.id, { status: "skipped", reason: "user_inactive" });
    else if (r.n.readAt) outcomes.set(r.d.id, { status: "skipped", reason: "already_read" });
    else if (age > max) outcomes.set(r.d.id, { status: "skipped", reason: "expired" });
    else live.push(r);
  }
  // stejné téma: pošle se jen nejnovější (starší by na zařízení stejně nahradila)
  const newest = new Map<string, Row>();
  for (const r of live) {
    const tag = r.n.collapseKey;
    if (!tag) continue;
    const cur = newest.get(tag);
    if (!cur || r.n.updatedAt > cur.n.updatedAt) newest.set(tag, r);
  }
  const keep = live.filter((r) => !r.n.collapseKey || newest.get(r.n.collapseKey) === r);
  for (const r of live)
    if (!keep.includes(r)) outcomes.set(r.d.id, { status: "skipped", reason: "merged" });
  return { live: keep, outcomes };
}

const unreadFor = async (db: Executor, userId: string) =>
  (
    await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.notification)
      .where(
        and(
          eq(schema.notification.userId, userId),
          eq(schema.notification.inbox, true),
          isNull(schema.notification.readAt),
        ),
      )
  )[0]?.n ?? 0;

async function processPush(
  deps: DispatchDeps,
  items: Row[],
  now: Date,
): Promise<Map<string, Outcome>> {
  const { db } = deps;
  const userId = items[0]!.d.userId;
  const { live, outcomes } = prefilter(items, now);
  if (!live.length) return outcomes;
  if (!deps.push) {
    for (const r of live)
      outcomes.set(r.d.id, { status: "skipped", reason: "push_not_configured" });
    return outcomes;
  }

  const recent =
    (
      await db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.notificationDelivery)
        .where(
          and(
            eq(schema.notificationDelivery.userId, userId),
            eq(schema.notificationDelivery.channel, "push"),
            eq(schema.notificationDelivery.status, "sent"),
            gte(schema.notificationDelivery.sentAt, new Date(now.getTime() - 10 * 60_000)),
          ),
        )
    )[0]?.n ?? 0;

  const urgent = live.filter((r) => r.n.severity === "urgent");
  const normal = live.filter((r) => r.n.severity !== "urgent");
  // ochrana před zahlcením: příliš mnoho zpráv za krátkou dobu se zdrží a pak pošle jako shrnutí
  if (recent >= RATE_LIMIT_PER_10_MIN && normal.length) {
    const until = new Date(now.getTime() + 10 * 60_000);
    for (const r of normal)
      outcomes.set(r.d.id, { status: "defer", until, reason: "rate_limited" });
    return finish(deps, userId, urgent, [], outcomes);
  }

  const individual = urgent.slice(0, MAX_URGENT_INDIVIDUAL);
  const rest = [...urgent.slice(MAX_URGENT_INDIVIDUAL), ...normal];
  const summarize =
    rest.length >= 2 && (rest.length > BURST_LIMIT || rest.some((r) => r.d.mode !== "instant"));
  if (!summarize) individual.push(...rest);
  return finish(deps, userId, individual, summarize ? rest : [], outcomes);
}

async function finish(
  deps: DispatchDeps,
  userId: string,
  individual: Row[],
  summary: Row[],
  outcomes: Map<string, Outcome>,
): Promise<Map<string, Outcome>> {
  const { db, push } = deps;
  if (!push || (!individual.length && !summary.length)) return outcomes;
  const badge = await unreadFor(db, userId);

  for (const r of individual) {
    const payload: PushPayload = {
      title: r.n.title,
      body: r.n.body,
      url: r.n.url,
      tag: tagOf(r.n),
      nid: r.n.inbox ? r.n.id : null,
      badge,
      count: r.n.count,
      urgent: r.n.severity === "urgent",
      snooze: getEventDef(r.n.kind)?.snooze === true,
    };
    const res = await pushToUser(db, push, userId, payload, {
      ttl: ttlFor(r.n.kind, r.n.severity),
      urgency: r.n.severity === "urgent" ? "high" : "normal",
      topic: topicOf(payload.tag!),
    });
    outcomes.set(r.d.id, outcomeOf(res, r.d.attempts));
  }

  if (summary.length) {
    const sorted = [...summary].sort((a, b) => b.n.createdAt.getTime() - a.n.createdAt.getTime());
    const titles = sorted.slice(0, 3).map((r) => r.n.title);
    const more = sorted.length - titles.length;
    const res = await pushToUser(
      db,
      push,
      userId,
      {
        title: `${sorted.length} nových upozornění`,
        body: titles.join("\n") + (more > 0 ? `\n…a ${more} dalších` : ""),
        url: "/inbox",
        tag: `summary:${userId}`,
        badge,
        count: sorted.length,
      },
      { ttl: 24 * 3600, urgency: "normal", topic: topicOf(`summary:${userId}`) },
    );
    summary.forEach((r, i) => {
      const o = outcomeOf(res, r.d.attempts);
      outcomes.set(
        r.d.id,
        o.status === "sent" ? { ...o, reason: i === 0 ? "summary" : "summarized" } : o,
      );
    });
  }
  return outcomes;
}

function outcomeOf(res: Awaited<ReturnType<typeof pushToUser>>, attempts: number): Outcome {
  const detail = {
    devices: res.sent,
    ...(res.removed ? { removed: res.removed } : {}),
    ...(res.hosts.length ? { hosts: [...new Set(res.hosts)] } : {}),
    ...(res.errors.length ? { errors: res.errors } : {}),
  };
  if (res.sent > 0) return { status: "sent", detail };
  if (res.noDevice || (res.removed > 0 && !res.transient && !res.rejected))
    return { status: "skipped", reason: "no_device", detail };
  if (res.rejected > 0 && !res.transient)
    return {
      status: "failed",
      reason: "push_rejected",
      error: `Push služba zprávu odmítla (HTTP ${res.errors.join(", ")}). Zkontrolujte klíče VAPID.`,
      detail,
    };
  if (attempts >= MAX_ATTEMPTS)
    return {
      status: "failed",
      reason: "retries_exhausted",
      error: "Push služba je opakovaně nedostupná.",
      detail,
    };
  return {
    status: "retry",
    error: res.errors.length ? `HTTP ${res.errors.join(", ")}` : "výpadek spojení",
    detail,
  };
}

async function processEmail(
  deps: DispatchDeps,
  items: Row[],
  now: Date,
): Promise<Map<string, Outcome>> {
  const { live, outcomes } = prefilter(items, now);
  if (!live.length) return outcomes;
  if (!deps.email) {
    for (const r of live)
      outcomes.set(r.d.id, { status: "skipped", reason: "email_not_configured" });
    return outcomes;
  }
  const first = live[0]!;
  const sorted = [...live].sort((a, b) => a.n.createdAt.getTime() - b.n.createdAt.getTime());
  const single = sorted.length === 1;
  const mail: EmailMessage = single
    ? {
        to: first.email,
        subject: first.n.title,
        body: [first.n.title, first.n.body].filter(Boolean).join("\n\n"),
        url: first.n.url,
      }
    : {
        to: first.email,
        subject: `${sorted.length} nových upozornění`,
        body: sorted
          .map((r) => `• ${r.n.title}${r.n.body ? `\n  ${r.n.body.replace(/\n/g, "\n  ")}` : ""}`)
          .join("\n\n"),
        url: "/inbox",
      };
  try {
    await deps.email(mail);
    for (const r of live) outcomes.set(r.d.id, { status: "sent", detail: { recipients: 1 } });
  } catch (err) {
    if (err instanceof EmailNotConfiguredError) {
      for (const r of live)
        outcomes.set(r.d.id, { status: "skipped", reason: "email_not_configured" });
      return outcomes;
    }
    const message = err instanceof Error ? err.message.slice(0, 200) : "chyba";
    for (const r of live)
      outcomes.set(
        r.d.id,
        r.d.attempts >= MAX_ATTEMPTS
          ? { status: "failed", reason: "retries_exhausted", error: message }
          : { status: "retry", error: message },
      );
  }
  return outcomes;
}

/**
 * Odložení upozornění (akce „Odložit“ na push): stejné upozornění se za zadanou dobu připomene znovu.
 * Smí jen majitel upozornění. Vrací, zda bylo odloženo.
 */
export async function snoozeNotification(
  db: Executor,
  userId: string,
  notificationId: string,
  minutes = 60,
  now = new Date(),
): Promise<boolean> {
  const [n] = await db
    .select({ id: schema.notification.id })
    .from(schema.notification)
    .where(and(eq(schema.notification.id, notificationId), eq(schema.notification.userId, userId)));
  if (!n) return false;
  await db.insert(schema.notificationDelivery).values({
    notificationId: n.id,
    userId,
    channel: "push",
    status: "held",
    mode: "quiet",
    reason: "snoozed",
    releaseAt: new Date(now.getTime() + Math.max(1, Math.min(minutes, 24 * 60)) * 60_000),
  });
  await db.execute(sql`select pg_notify('notification_new', '')`);
  return true;
}

/** Úklid: stará upozornění a technická zkušební zpráva. Doručení mizí s upozorněním (cascade). */
export async function cleanupNotifications(
  db: Executor,
  now = new Date(),
): Promise<{ removed: number }> {
  const old = new Date(now.getTime() - 90 * 86_400_000);
  const hidden = new Date(now.getTime() - 7 * 86_400_000);
  const a = await db
    .delete(schema.notification)
    .where(lt(schema.notification.createdAt, old))
    .returning({ id: schema.notification.id });
  const b = await db
    .delete(schema.notification)
    .where(and(eq(schema.notification.inbox, false), lt(schema.notification.createdAt, hidden)))
    .returning({ id: schema.notification.id });
  return { removed: a.length + b.length };
}
