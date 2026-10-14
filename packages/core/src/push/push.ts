import { and, desc, eq, sql } from "drizzle-orm";
import { schema, type Executor } from "../db/client";
import { UserError } from "../rbac/errors";
import type { Ctx } from "../rbac/types";

/*
  Web Push: odběry zařízení a odeslání zprávy. Co se komu pošle, rozhoduje katalog upozornění (`../notifications`);
  tady je jen doprava: uložení odběru, odeslání na všechna zařízení uživatele a úklid mrtvých odběrů.
  Adresu odběru dodává prohlížeč, proto se smí odesílat jen na známé push služby (jinak by šlo server donutit
  volat libovolnou adresu).
*/

export type VapidConfig = { publicKey: string; privateKey: string; subject: string };

export type PushTarget = { endpoint: string; keys: { p256dh: string; auth: string } };

export type PushUrgency = "very-low" | "low" | "normal" | "high";
export type PushSendOptions = {
  /** Jak dlouho push služba drží zprávu pro nedostupné zařízení (sekundy). */
  ttl: number;
  urgency: PushUrgency;
  /** Nová zpráva se stejným tématem nahradí starší, dosud nedoručenou (RFC 8030); max. 32 znaků base64url. */
  topic?: string | undefined;
};

/** Odešle jednu zprávu; při zrušeném odběru vyhodí chybu se `statusCode` 404 nebo 410. */
export type PushSender = (
  target: PushTarget,
  payload: string,
  options?: PushSendOptions,
) => Promise<void>;

export type PushPayload = {
  title: string;
  body?: string | null;
  url?: string | null;
  /** Zpráva se stejným tagem v zařízení nahradí starší. */
  tag?: string | null;
  /** Id upozornění: po ťuknutí se označí za přečtené. */
  nid?: string | null;
  /** Počet nepřečtených pro odznak na ikoně aplikace. */
  badge?: number | null;
  /** Kolik událostí zpráva sloučila. */
  count?: number | null;
  urgent?: boolean;
  /** Nabídnout akci „Odložit“. */
  snooze?: boolean;
};

export const payloadOf = (p: PushPayload) =>
  JSON.stringify({
    title: p.title.slice(0, 120),
    body: p.body?.slice(0, 240) ?? null,
    url: p.url && p.url.startsWith("/") && !p.url.startsWith("//") ? p.url : "/",
    tag: p.tag?.slice(0, 120) ?? null,
    nid: p.nid ?? null,
    badge: typeof p.badge === "number" ? Math.max(0, Math.min(999, p.badge)) : null,
    count: p.count && p.count > 1 ? p.count : null,
    urgent: p.urgent === true,
    snooze: p.snooze === true,
    ts: Date.now(),
  });

/** Hostitelé push služeb prohlížečů (Chrome/Edge přes FCM, Firefox, Safari, Windows). */
const PUSH_HOSTS = [
  /(^|\.)googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)push\.apple\.com$/,
  /(^|\.)notify\.windows\.com$/,
];

export function isAllowedPushEndpoint(raw: string): boolean {
  try {
    const url = new URL(raw);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (url.port === "" || url.port === "443") &&
      PUSH_HOSTS.some((re) => re.test(url.hostname))
    );
  } catch {
    return false;
  }
}

/** Hostitel push služby (do protokolu doručení; adresa odběru samotná je tajná). */
export function endpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).hostname;
  } catch {
    return "?";
  }
}

function me(ctx: Ctx): string {
  if (!ctx.actor.userId) throw new UserError("Upozornění patří přihlášenému uživateli.");
  return ctx.actor.userId;
}

export async function saveSubscription(
  ctx: Ctx,
  input: {
    endpoint: string;
    p256dh: string;
    auth: string;
    userAgent?: string | null;
    sessionId?: string | null;
  },
): Promise<void> {
  const userId = me(ctx);
  if (!isAllowedPushEndpoint(input.endpoint) || input.endpoint.length > 1000)
    throw new UserError(
      "Tento prohlížeč nepodporuje push upozornění, která by systém mohl poslat.",
    );
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(input.p256dh) || !/^[A-Za-z0-9_-]{10,100}$/.test(input.auth))
    throw new UserError("Odběr upozornění je neúplný.");
  const row = {
    userId,
    p256dh: input.p256dh,
    auth: input.auth,
    userAgent: input.userAgent?.slice(0, 200) ?? null,
    sessionId: input.sessionId ?? null,
    failures: 0,
    lastError: null,
  };
  await ctx.db
    .insert(schema.pushSubscription)
    .values({ ...row, endpoint: input.endpoint })
    // zařízení se mohlo přihlásit jiným uživatelem: odběr patří tomu, kdo ho naposledy potvrdil
    .onConflictDoUpdate({ target: schema.pushSubscription.endpoint, set: row });
}

/**
 * Prohlížeč odběr po čase obnoví (`pushsubscriptionchange`): nový odběr nahradí starý téhož uživatele,
 * aby se zařízení nezdvojilo. Starý odběr smí nahradit jen jeho majitel.
 */
export async function replaceSubscription(
  ctx: Ctx,
  oldEndpoint: string | null,
  input: Parameters<typeof saveSubscription>[1],
): Promise<void> {
  await saveSubscription(ctx, input);
  if (oldEndpoint && oldEndpoint !== input.endpoint) await removeSubscription(ctx, oldEndpoint);
}

export async function removeSubscription(ctx: Ctx, endpoint: string): Promise<void> {
  await ctx.db
    .delete(schema.pushSubscription)
    .where(
      and(
        eq(schema.pushSubscription.userId, me(ctx)),
        eq(schema.pushSubscription.endpoint, endpoint),
      ),
    );
}

/** Odhlášení zařízení ze seznamu zařízení; cizí odběr nejde zrušit. Vrací, zda nějaký zmizel. */
export async function removeDevice(ctx: Ctx, id: string): Promise<boolean> {
  const rows = await ctx.db
    .delete(schema.pushSubscription)
    .where(and(eq(schema.pushSubscription.userId, me(ctx)), eq(schema.pushSubscription.id, id)))
    .returning({ id: schema.pushSubscription.id });
  return rows.length > 0;
}

/** Zruší všechny odběry uživatele (deaktivace účtu, odhlášení ze všech zařízení). */
export async function removeUserSubscriptions(db: Executor, userId: string): Promise<number> {
  const rows = await db
    .delete(schema.pushSubscription)
    .where(eq(schema.pushSubscription.userId, userId))
    .returning({ id: schema.pushSubscription.id });
  return rows.length;
}

/** Zruší odběry navázané na relaci (odhlášení: zařízení po odhlášení nemá dostávat cizí upozornění). */
export async function removeSessionSubscriptions(db: Executor, sessionId: string): Promise<number> {
  const rows = await db
    .delete(schema.pushSubscription)
    .where(eq(schema.pushSubscription.sessionId, sessionId))
    .returning({ id: schema.pushSubscription.id });
  return rows.length;
}

export async function countSubscriptions(ctx: Ctx): Promise<number> {
  const [r] = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.pushSubscription)
    .where(eq(schema.pushSubscription.userId, me(ctx)));
  return r?.n ?? 0;
}

export type PushDevice = {
  id: string;
  endpoint: string;
  host: string;
  userAgent: string | null;
  createdAt: Date;
  lastSentAt: Date | null;
  failures: number;
  lastError: string | null;
};

/** Zařízení přihlášeného s odběrem (nejnovější první). Adresa odběru slouží jen k poznání „tohoto“ zařízení. */
export async function listDevices(ctx: Ctx): Promise<PushDevice[]> {
  const rows = await ctx.db
    .select()
    .from(schema.pushSubscription)
    .where(eq(schema.pushSubscription.userId, me(ctx)))
    .orderBy(desc(schema.pushSubscription.createdAt));
  return rows.map((r) => ({
    id: r.id,
    endpoint: r.endpoint,
    host: endpointHost(r.endpoint),
    userAgent: r.userAgent,
    createdAt: r.createdAt,
    lastSentAt: r.lastSentAt,
    failures: r.failures,
    lastError: r.lastError,
  }));
}

export type PushFailureKind = "gone" | "rejected" | "transient";

/**
 * Jak naložit s chybou push služby: 404/410 odběr zanikl (smazat), 400/401/403/413 je trvalá chyba (špatné klíče
 * VAPID, příliš velká zpráva) a opakování nepomůže, ostatní (429, 5xx, výpadek sítě) se zkusí znovu.
 */
export function classifyPushError(err: unknown): { kind: PushFailureKind; status: number | null } {
  const code = (err as { statusCode?: unknown } | null)?.statusCode;
  const status = typeof code === "number" ? code : null;
  if (status === 404 || status === 410) return { kind: "gone", status };
  if (status === 400 || status === 401 || status === 403 || status === 413)
    return { kind: "rejected", status };
  return { kind: "transient", status };
}

export type PushResult = {
  /** Na kolik zařízení zpráva odešla. */
  sent: number;
  /** Odběry, které zanikly a byly smazány. */
  removed: number;
  /** Zařízení, kde odeslání dočasně selhalo (stojí za opakování). */
  transient: number;
  /** Zařízení, kde push služba zprávu trvale odmítla. */
  rejected: number;
  hosts: string[];
  /** Stavové kódy chyb (bez adres a klíčů). */
  errors: number[];
  /** Uživatel nemá žádné zařízení. */
  noDevice: boolean;
};

/**
 * Pošle zprávu na všechna zařízení uživatele a uklidí, co push služba označila za zaniklé. Nikdy nevyhazuje chybu
 * odeslání: výsledek popisuje, co se stalo (volající rozhodne o opakování).
 */
export async function pushToUser(
  db: Executor,
  send: PushSender,
  userId: string,
  payload: PushPayload | string,
  options: PushSendOptions = { ttl: 60 * 60 * 12, urgency: "normal" },
): Promise<PushResult> {
  const subs = await db
    .select()
    .from(schema.pushSubscription)
    .where(eq(schema.pushSubscription.userId, userId));
  const body = typeof payload === "string" ? payload : payloadOf(payload);
  const out: PushResult = {
    sent: 0,
    removed: 0,
    transient: 0,
    rejected: 0,
    hosts: [],
    errors: [],
    noDevice: subs.length === 0,
  };
  for (const s of subs) {
    try {
      await send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, options);
      out.sent++;
      out.hosts.push(endpointHost(s.endpoint));
      await db
        .update(schema.pushSubscription)
        .set({ lastSentAt: new Date(), failures: 0, lastError: null })
        .where(eq(schema.pushSubscription.id, s.id));
    } catch (err) {
      const { kind, status } = classifyPushError(err);
      if (status) out.errors.push(status);
      if (kind === "gone") {
        await db.delete(schema.pushSubscription).where(eq(schema.pushSubscription.id, s.id));
        out.removed++;
        continue;
      }
      if (kind === "rejected") out.rejected++;
      else out.transient++;
      await db
        .update(schema.pushSubscription)
        .set({
          failures: sql`${schema.pushSubscription.failures} + 1`,
          lastError: status ? `HTTP ${status}` : "výpadek spojení",
        })
        .where(eq(schema.pushSubscription.id, s.id));
    }
  }
  return out;
}

/** Zpětně kompatibilní krátká podoba: počet doručených a smazaných odběrů. */
export async function sendToUser(
  db: Executor,
  send: PushSender,
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; removed: number }> {
  const r = await pushToUser(db, send, userId, payload);
  return { sent: r.sent, removed: r.removed };
}

/** Nový pár klíčů VAPID. */
export async function generateVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  return (await import("web-push")).default.generateVAPIDKeys();
}

/** Odesílač přes knihovnu `web-push` (načítá se líně, ať ji nenesou testy a stránky bez push). */
export async function createWebPushSender(vapid: VapidConfig): Promise<PushSender> {
  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  return async (target, payload, options) => {
    await webpush.sendNotification(target, payload, {
      TTL: options?.ttl ?? 60 * 60 * 12,
      urgency: options?.urgency ?? "normal",
      ...(options?.topic ? { topic: options.topic } : {}),
    });
  };
}
