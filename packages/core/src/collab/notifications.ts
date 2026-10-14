import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { schema, type Executor } from "../db/client";
import { getNotificationRuntime } from "../notifications/catalog";
import { hasMoney, MONEY_PERMISSIONS, stripMoney } from "../notifications/money";
import { insertDrafts, type Draft } from "../notifications/pipeline";
import { usersWithPermission } from "../notifications/recipients";
import { planDelivery, resolveEvent } from "../notifications/rules";
import { loadPrefs, loadRules } from "../notifications/store";
import type { AnyEventDef } from "../notifications/types";
import { scopeOf } from "../rbac/permissions";
import type { Ctx } from "../rbac/types";

export type NewNotification = {
  userId: string;
  kind: string;
  title: string;
  body?: string | null;
  url?: string | null;
  entityType?: string | null;
  entityId?: string | null;
};

export { MONEY_PERMISSIONS, stripMoney } from "../notifications/money";
export { usersWithPermission } from "../notifications/recipients";

/**
 * Vytvoří upozornění bez katalogu událostí (starší způsob). Kdo vyvolává událost z modulu, má použít `notify()`
 * z `@rebar/core/notifications`: tam má správce klienta pravidla, uživatel předvolby a text jde přepsat.
 * Tato funkce dělá totéž s tím, co zná: je-li `kind` v katalogu, platí pro něj pravidla události; jinak jde o běžné
 * upozornění (zvoneček + push). Částky v textu dostanou jen ti, kdo smí vidět peníze (`MONEY_PERMISSIONS`).
 * Příjemci, kteří nejsou aktivní, se vynechají. Vrací počet vytvořených (sloučených a zdeduplikovaných bez nich).
 */
export async function createNotifications(
  db: Executor,
  items: readonly NewNotification[],
): Promise<number> {
  if (!items.length) return 0;
  const ids = [...new Set(items.map((i) => i.userId))];
  const active = new Set(
    (
      await db
        .select({ id: schema.user.id })
        .from(schema.user)
        .where(
          and(
            inArray(schema.user.id, ids),
            eq(schema.user.active, true),
            isNull(schema.user.deletedAt),
          ),
        )
    ).map((r) => r.id),
  );
  const rows = items.filter((i) => active.has(i.userId));
  if (!rows.length) return 0;
  const priced = rows.some((i) => hasMoney(i.title) || hasMoney(i.body));
  const moneyUsers = new Set<string>();
  if (priced)
    for (const key of MONEY_PERMISSIONS)
      for (const id of await usersWithPermission(db, key)) moneyUsers.add(id);
  const textFor = (i: NewNotification, text: string | null | undefined) =>
    text && !moneyUsers.has(i.userId) && hasMoney(text) ? stripMoney(text) : (text ?? null);

  const runtime = getNotificationRuntime();
  const rules = await loadRules(db);
  const prefs = await loadPrefs(db, ids);
  const now = new Date();
  const drafts: Draft[] = [];
  for (const i of rows) {
    const def = runtime.events.get(i.kind) ?? legacyEvent(i.kind);
    const eff = resolveEvent(def, runtime.config.events[i.kind], rules.events[i.kind]);
    if (!eff.enabled) continue;
    drafts.push({
      userId: i.userId,
      kind: i.kind,
      severity: eff.severity,
      title: textFor(i, i.title) ?? "",
      body: textFor(i, i.body),
      url: i.url ?? null,
      entityType: i.entityType ?? null,
      entityId: i.entityId ?? null,
      dedupeKey: null,
      collapseKey: null,
      mergeWindowSeconds: 0,
      plan: planDelivery(eff, prefs.get(i.userId), {
        now,
        timezone: runtime.timezone,
        config: runtime.config,
        rules: { quietHours: rules.quietHours, digestTimes: rules.digestTimes },
      }),
    });
  }
  const r = await insertDrafts(db, drafts, now);
  return r.created + r.merged;
}

/** Událost pro starší volání s vlastním druhem: zvoneček a push, běžná závažnost. */
function legacyEvent(kind: string): AnyEventDef {
  return {
    key: kind,
    label: kind,
    description: "",
    group: "Ostatní",
    severity: "normal",
    channels: { push: true, bell: true },
    audiences: {},
    recipients: [],
    params: {},
    template: { title: "{title}", url: "/inbox" },
  };
}

function me(ctx: Ctx): string {
  if (!ctx.actor.userId) throw new Error("Upozornění patří přihlášenému uživateli.");
  return ctx.actor.userId;
}

/** Inbox přihlášeného uživatele (nejnovější první). */
export async function listNotifications(
  ctx: Ctx,
  opts: { unreadOnly?: boolean; limit?: number } = {},
) {
  const userId = me(ctx);
  const rows = await ctx.db
    .select()
    .from(schema.notification)
    .where(
      and(
        eq(schema.notification.userId, userId),
        eq(schema.notification.inbox, true),
        opts.unreadOnly ? isNull(schema.notification.readAt) : undefined,
      ),
    )
    .orderBy(desc(schema.notification.createdAt))
    .limit(Math.min(opts.limit ?? 50, 200));
  // pojistka pro upozornění vytvořená dřív, nebo po změně role: peníze v textu jen s oprávněním
  if (MONEY_PERMISSIONS.some((k) => scopeOf(ctx, k))) return rows;
  return rows.map((n) => ({
    ...n,
    title: hasMoney(n.title) ? stripMoney(n.title) : n.title,
    body: n.body && hasMoney(n.body) ? stripMoney(n.body) : n.body,
  }));
}

export async function unreadCount(ctx: Ctx): Promise<number> {
  const [row] = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.notification)
    .where(
      and(
        eq(schema.notification.userId, me(ctx)),
        eq(schema.notification.inbox, true),
        isNull(schema.notification.readAt),
      ),
    );
  return row?.n ?? 0;
}

/** Označí jako přečtené jen upozornění přihlášeného uživatele (cizí id se ignoruje). */
export async function markRead(ctx: Ctx, ids: readonly string[]): Promise<void> {
  if (!ids.length) return;
  await ctx.db
    .update(schema.notification)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(schema.notification.userId, me(ctx)),
        inArray(schema.notification.id, [...ids]),
        isNull(schema.notification.readAt),
      ),
    );
}

export async function markAllRead(ctx: Ctx): Promise<void> {
  await ctx.db
    .update(schema.notification)
    .set({ readAt: new Date() })
    .where(and(eq(schema.notification.userId, me(ctx)), isNull(schema.notification.readAt)));
}
