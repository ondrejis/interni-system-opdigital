import { and, desc, eq, gte, sql } from "drizzle-orm";
import { schema } from "../db/client";
import { getEntityPolicy } from "../entities/policy";
import { UserError } from "../rbac/errors";
import { assertCan, can } from "../rbac/permissions";
import type { Ctx } from "../rbac/types";
import type { SettingsService } from "../settings";
import { SYSTEM_TEST, getNotificationRuntime, listEventDefs } from "./catalog";
import { notify } from "./notify";
import {
  userPrefsSchema,
  type EventRule,
  type NotificationRules,
  type PushMode,
  type QuietHours,
  type UserPrefs,
} from "./config";
import { resolveEvent, effectiveTimes, type EffectiveEvent, type PlanContext } from "./rules";
import { loadPrefs, loadRules, notificationRulesSetting } from "./store";
import { describeRecipient, validateRule } from "./validate";
import type { AnyEventDef, Channel } from "./types";

/** Zkontroluje všechny úpravy proti katalogu (neznámá událost = chyba). */
export function validateRules(events: Record<string, EventRule>): string[] {
  const problems: string[] = [];
  const catalog = getNotificationRuntime().events;
  for (const [key, rule] of Object.entries(events)) {
    const def = catalog.get(key);
    if (!def) problems.push(`Neznámá událost „${key}“.`);
    else problems.push(...validateRule(def, rule));
  }
  return problems;
}

export type EventView = {
  key: string;
  label: string;
  description: string;
  group: string;
  severity: "normal" | "urgent";
  scheduled: boolean;
  mandatory: boolean;
  /** Výchozí chování po zohlednění klienta. */
  defaults: { push: PushMode; bell: boolean; email: boolean };
  /** Co si uživatel nastavil sám (chybějící = výchozí). */
  pref: { push?: PushMode; bell?: boolean; email?: boolean };
};

const defaultPush = (eff: EffectiveEvent): PushMode => (eff.channels.push ? "instant" : "off");

/** Události, které se uživatele mohou týkat: má právo na záznam nebo na událost samu. */
function relevantFor(ctx: Ctx, def: AnyEventDef): boolean {
  if (def.internal) return false;
  if (
    def.access &&
    !(typeof def.access === "string" ? [def.access] : def.access).some((p) => can(ctx, p))
  )
    return false;
  const policy = def.entity ? getEntityPolicy(def.entity) : undefined;
  if (policy && !can(ctx, policy.read)) return false;
  return true;
}

export type MyPreferences = {
  events: EventView[];
  quiet: QuietHours;
  /** Tiché hodiny si uživatel nastavil sám (jinak platí výchozí klienta). */
  quietCustom: boolean;
  clientQuiet: QuietHours;
  digestTimes: string[];
  digestCustom: boolean;
  clientDigestTimes: string[];
  timezone: string;
};

function me(ctx: Ctx): string {
  if (!ctx.actor.userId) throw new UserError("Předvolby patří přihlášenému uživateli.");
  return ctx.actor.userId;
}

/** Předvolby přihlášeného uživatele spolu s popisem událostí, které se ho týkají. */
export async function getMyPreferences(ctx: Ctx): Promise<MyPreferences> {
  const userId = me(ctx);
  const runtime = getNotificationRuntime();
  const rules = await loadRules(ctx.db);
  const prefs = (await loadPrefs(ctx.db, [userId])).get(userId) ?? null;
  const planCtx: PlanContext = {
    now: new Date(),
    timezone: runtime.timezone,
    config: runtime.config,
    rules: { quietHours: rules.quietHours, digestTimes: rules.digestTimes },
  };
  const client = effectiveTimes(null, planCtx);
  const mine = effectiveTimes(prefs, planCtx);
  const events: EventView[] = [];
  for (const def of listEventDefs()) {
    if (!relevantFor(ctx, def)) continue;
    const eff = resolveEvent(def, runtime.config.events[def.key], rules.events[def.key]);
    if (!eff.enabled) continue;
    events.push({
      key: def.key,
      label: def.label,
      description: def.description,
      group: def.group,
      severity: eff.severity,
      scheduled: def.scheduled === true,
      mandatory: eff.mandatory,
      defaults: { push: defaultPush(eff), bell: eff.channels.bell, email: eff.channels.email },
      pref: prefs?.events[def.key] ?? {},
    });
  }
  return {
    events,
    quiet: mine.quiet,
    quietCustom: !!prefs?.quiet,
    clientQuiet: client.quiet,
    digestTimes: mine.digestTimes,
    digestCustom: !!prefs?.digestTimes,
    clientDigestTimes: client.digestTimes,
    timezone: runtime.timezone,
  };
}

/**
 * Uloží předvolby přihlášeného. Neznámé události se zahodí; hodnoty shodné s výchozími se neukládají
 * (pozdější změna výchozího chování klienta se pak projeví i tomu, kdo nic neměnil).
 */
export async function saveMyPreferences(ctx: Ctx, raw: unknown): Promise<void> {
  const userId = me(ctx);
  const input = userPrefsSchema.parse(raw);
  const runtime = getNotificationRuntime();
  const rules = await loadRules(ctx.db);
  const events: UserPrefs["events"] = {};
  for (const [key, p] of Object.entries(input.events)) {
    const def = runtime.events.get(key);
    if (!def || def.internal) continue;
    const eff = resolveEvent(def, runtime.config.events[key], rules.events[key]);
    const clean: UserPrefs["events"][string] = {};
    if (p.push !== undefined && p.push !== defaultPush(eff)) clean.push = p.push;
    if (p.bell !== undefined && p.bell !== eff.channels.bell) clean.bell = p.bell;
    if (p.email !== undefined && p.email !== eff.channels.email) clean.email = p.email;
    if (Object.keys(clean).length) events[key] = clean;
  }
  const next: UserPrefs = {
    events,
    ...(input.quiet ? { quiet: input.quiet } : {}),
    ...(input.digestTimes ? { digestTimes: input.digestTimes } : {}),
  };
  await ctx.db
    .insert(schema.notificationPref)
    .values({ userId, prefs: next })
    .onConflictDoUpdate({
      target: schema.notificationPref.userId,
      set: { prefs: next, updatedAt: new Date() },
    });
}

export type AdminEventView = {
  key: string;
  label: string;
  description: string;
  group: string;
  scheduled: boolean;
  audiences: Record<string, string>;
  params: { name: string; label: string; example: string; sensitive: boolean }[];
  /** Co platí po složení katalogu, konfigurace a úprav. */
  effective: {
    enabled: boolean;
    mandatory: boolean;
    severity: "normal" | "urgent";
    channels: Record<Channel, boolean>;
    recipients: { token: string; label: string }[];
    title: string;
    body: string;
  };
  /** Co by platilo bez úprav správce (katalog + konfigurace klienta): základ, nad který se skládají úpravy. */
  base: {
    enabled: boolean;
    mandatory: boolean;
    severity: "normal" | "urgent";
    channels: Record<Channel, boolean>;
    recipients: string[];
    title: string;
    body: string;
  };
  /** Text podle katalogu (pro „Vrátit výchozí text“). */
  catalog: { title: string; body: string };
  /** Úprava uložená správcem v Nastavení. */
  adminRule: EventRule;
  /** Změněno v konfiguraci klienta (soubor). */
  configured: boolean;
};

export type AdminRulesView = {
  events: AdminEventView[];
  quietHours: QuietHours;
  digestTimes: string[];
  /** Výchozí z konfigurace klienta. */
  configQuietHours: QuietHours;
  configDigestTimes: string[];
  timezone: string;
};

/** Pravidla pro Nastavení → Pravidla upozornění. Jen správce. */
export async function getAdminRules(ctx: Ctx): Promise<AdminRulesView> {
  assertCan(ctx, "settings.manage");
  const runtime = getNotificationRuntime();
  const rules = await loadRules(ctx.db);
  const events: AdminEventView[] = [];
  for (const def of listEventDefs()) {
    if (def.internal) continue;
    const eff = resolveEvent(def, runtime.config.events[def.key], rules.events[def.key]);
    const base = resolveEvent(def, runtime.config.events[def.key]);
    events.push({
      key: def.key,
      label: def.label,
      description: def.description,
      group: def.group,
      scheduled: def.scheduled === true,
      audiences: def.audiences,
      params: Object.entries(def.params).map(([name, p]) => ({
        name,
        label: p.label,
        example: p.example,
        sensitive: !!p.sensitive,
      })),
      effective: {
        enabled: eff.enabled,
        mandatory: eff.mandatory,
        severity: eff.severity,
        channels: eff.channels,
        recipients: eff.recipients.map((token) => ({
          token,
          label: describeRecipient(def, token),
        })),
        title: eff.title,
        body: eff.body ?? "",
      },
      base: {
        enabled: base.enabled,
        mandatory: base.mandatory,
        severity: base.severity,
        channels: base.channels,
        recipients: base.recipients,
        title: base.title,
        body: base.body ?? "",
      },
      catalog: { title: def.template.title, body: def.template.body ?? "" },
      adminRule: rules.events[def.key] ?? {},
      configured: !!runtime.config.events[def.key],
    });
  }
  return {
    events,
    quietHours: rules.quietHours ?? runtime.config.quietHours,
    digestTimes: rules.digestTimes ?? runtime.config.digestTimes,
    configQuietHours: runtime.config.quietHours,
    configDigestTimes: runtime.config.digestTimes,
    timezone: runtime.timezone,
  };
}

/** Uloží úpravy správce (celý dokument). Pravidlo shodné s výchozím se předem odstraní (zadá volající). */
export async function saveAdminRules(
  ctx: Ctx,
  settings: SettingsService,
  rules: NotificationRules,
): Promise<void> {
  assertCan(ctx, "settings.manage");
  const problems = validateRules(rules.events);
  if (problems.length) throw new UserError(problems[0]!);
  // celý dokument: vynechané tiché hodiny nebo časy shrnutí znamenají „platí výchozí klienta“, ne „ponechat uložené“
  await settings.set(ctx, notificationRulesSetting, {
    events: rules.events,
    quietHours: rules.quietHours,
    digestTimes: rules.digestTimes,
  } as NotificationRules);
}

export type DeliveryLogRow = {
  id: string;
  title: string;
  kind: string;
  channel: "push" | "email";
  status: string;
  mode: string;
  reason: string | null;
  attempts: number;
  createdAt: Date;
  sentAt: Date | null;
  devices: number | null;
};

/** Poslední doručení upozornění přihlášeného (pro hledání, proč mu push nechodí). Bez tajemství. */
export async function listMyDeliveries(ctx: Ctx, limit = 15): Promise<DeliveryLogRow[]> {
  const rows = await ctx.db
    .select({
      id: schema.notificationDelivery.id,
      title: schema.notification.title,
      kind: schema.notification.kind,
      channel: schema.notificationDelivery.channel,
      status: schema.notificationDelivery.status,
      mode: schema.notificationDelivery.mode,
      reason: schema.notificationDelivery.reason,
      attempts: schema.notificationDelivery.attempts,
      createdAt: schema.notificationDelivery.createdAt,
      sentAt: schema.notificationDelivery.sentAt,
      detail: schema.notificationDelivery.detail,
    })
    .from(schema.notificationDelivery)
    .innerJoin(
      schema.notification,
      eq(schema.notificationDelivery.notificationId, schema.notification.id),
    )
    .where(eq(schema.notificationDelivery.userId, me(ctx)))
    .orderBy(desc(schema.notificationDelivery.createdAt))
    .limit(Math.min(limit, 50));
  return rows.map(({ detail, ...r }) => ({
    ...r,
    devices:
      typeof (detail as { devices?: unknown } | null)?.devices === "number"
        ? (detail as { devices: number }).devices
        : null,
  }));
}

export type DeliveryStats = {
  /** Za posledních 24 hodin podle stavu a důvodu. */
  counts: { channel: string; status: string; reason: string | null; n: number }[];
  /** Nejnovější selhání bez obsahu (kdo, událost, důvod). */
  failures: {
    at: Date;
    kind: string;
    channel: string;
    reason: string | null;
    error: string | null;
    attempts: number;
  }[];
  devices: number;
  pending: number;
};

/** Souhrn doručování pro správce (diagnostika „push nechodí“). Bez textů upozornění. */
export async function getDeliveryStats(ctx: Ctx): Promise<DeliveryStats> {
  assertCan(ctx, "settings.manage");
  const since = new Date(Date.now() - 24 * 3_600_000);
  const counts = await ctx.db
    .select({
      channel: schema.notificationDelivery.channel,
      status: schema.notificationDelivery.status,
      reason: schema.notificationDelivery.reason,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.notificationDelivery)
    .where(gte(schema.notificationDelivery.createdAt, since))
    .groupBy(
      schema.notificationDelivery.channel,
      schema.notificationDelivery.status,
      schema.notificationDelivery.reason,
    );
  const failures = await ctx.db
    .select({
      at: schema.notificationDelivery.createdAt,
      kind: schema.notification.kind,
      channel: schema.notificationDelivery.channel,
      reason: schema.notificationDelivery.reason,
      error: schema.notificationDelivery.lastError,
      attempts: schema.notificationDelivery.attempts,
    })
    .from(schema.notificationDelivery)
    .innerJoin(
      schema.notification,
      eq(schema.notificationDelivery.notificationId, schema.notification.id),
    )
    .where(
      and(
        eq(schema.notificationDelivery.status, "failed"),
        gte(schema.notificationDelivery.createdAt, since),
      ),
    )
    .orderBy(desc(schema.notificationDelivery.createdAt))
    .limit(10);
  const [dev] = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.pushSubscription);
  const [pend] = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.notificationDelivery)
    .where(sql`${schema.notificationDelivery.status} in ('queued', 'held', 'retry', 'sending')`);
  return { counts, failures, devices: dev?.n ?? 0, pending: pend?.n ?? 0 };
}

export type DeliveryStatus = {
  id: string;
  status: string;
  reason: string | null;
  devices: number | null;
  error: string | null;
};

/**
 * Zkušební upozornění sobě („Pošli mi zkušební upozornění“). Jde stejnou cestou jako ostatní: zapíše se do fronty
 * a odešle ho worker, stav se pak čte přes `getDeliveryStatus`. Víc než jedno za 10 sekund se odmítne.
 */
export async function queueTestNotification(ctx: Ctx): Promise<{ deliveryId: string | null }> {
  const userId = me(ctx);
  const since = new Date(Date.now() - 10_000);
  const [recent] = await ctx.db
    .select({ id: schema.notificationDelivery.id })
    .from(schema.notificationDelivery)
    .innerJoin(
      schema.notification,
      eq(schema.notificationDelivery.notificationId, schema.notification.id),
    )
    .where(
      and(
        eq(schema.notificationDelivery.userId, userId),
        eq(schema.notification.kind, SYSTEM_TEST.key),
        gte(schema.notificationDelivery.createdAt, since),
      ),
    )
    .limit(1);
  if (recent) throw new UserError("Zkušební upozornění už je na cestě, chvíli počkejte.");
  await notify(ctx.db, SYSTEM_TEST, { params: {}, to: { self: [userId] } });
  const [row] = await ctx.db
    .select({ id: schema.notificationDelivery.id })
    .from(schema.notificationDelivery)
    .innerJoin(
      schema.notification,
      eq(schema.notificationDelivery.notificationId, schema.notification.id),
    )
    .where(
      and(
        eq(schema.notificationDelivery.userId, userId),
        eq(schema.notification.kind, SYSTEM_TEST.key),
        eq(schema.notificationDelivery.channel, "push"),
      ),
    )
    .orderBy(desc(schema.notificationDelivery.createdAt))
    .limit(1);
  return { deliveryId: row?.id ?? null };
}

/** Stav jednoho doručení přihlášeného (cizí doručení se tváří jako neexistující). */
export async function getDeliveryStatus(ctx: Ctx, id: string): Promise<DeliveryStatus | null> {
  const [row] = await ctx.db
    .select()
    .from(schema.notificationDelivery)
    .where(
      and(eq(schema.notificationDelivery.id, id), eq(schema.notificationDelivery.userId, me(ctx))),
    );
  if (!row) return null;
  const devices = (row.detail as { devices?: unknown } | null)?.devices;
  return {
    id: row.id,
    status: row.status,
    reason: row.reason,
    devices: typeof devices === "number" ? devices : null,
    error: row.lastError,
  };
}
