import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { pk, ts } from "../columns";
import { audit } from "./common";
import { user } from "./identity";

/** Komentář k libovolnému záznamu (polymorfní vazba), s @zmínkami. */
export const comment = pgTable(
  "comment",
  {
    id: pk(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => user.id),
    body: text("body").notNull(),
    mentions: uuid("mentions")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    editedAt: ts("edited_at"),
    ...audit(),
  },
  (t) => [index("comment_entity_idx").on(t.entityType, t.entityId, t.createdAt)],
);

/** Úkol; volitelně navázaný na záznam. „Moje úkoly“ = `assignee_id`. */
export const task = pgTable(
  "task",
  {
    id: pk(),
    title: text("title").notNull(),
    description: text("description"),
    assigneeId: uuid("assignee_id")
      .notNull()
      .references(() => user.id),
    dueDate: date("due_date", { mode: "string" }),
    priority: text("priority", { enum: ["low", "normal", "high"] })
      .notNull()
      .default("normal"),
    doneAt: ts("done_at"),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    ...audit(),
  },
  (t) => [
    index("task_assignee_idx").on(t.assigneeId, t.doneAt, t.dueDate),
    index("task_entity_idx").on(t.entityType, t.entityId),
  ],
);

/**
 * Upozornění uživatele. Je to zároveň „outbox“: vzniká ve stejné transakci jako změna, která ho vyvolala (selže-li
 * transakce, upozornění nevznikne), a doručení do zařízení řeší worker z tabulky `notification_delivery`.
 * `inbox = false` je upozornění jen pro push (uživatel má zvonek u dané události vypnutý, nebo jde o zkušební zprávu).
 */
export const notification = pgTable(
  "notification",
  {
    id: pk(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Klíč události z katalogu (`task.assigned`); u starších upozornění původní druh. */
    kind: text("kind").notNull(),
    severity: text("severity", { enum: ["normal", "urgent"] })
      .notNull()
      .default("normal"),
    title: text("title").notNull(),
    body: text("body"),
    url: text("url"),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    /** Zobrazuje se v Inboxu (zvonku) a počítá do nepřečtených. */
    inbox: boolean("inbox").notNull().default(true),
    /** Idempotence: stejný klíč pro stejného příjemce vytvoří upozornění jen jednou. */
    dedupeKey: text("dedupe_key"),
    /** Sloučení: nepřečtené upozornění se stejným klíčem se aktualizuje místo přidání dalšího; je i `tag` push zprávy. */
    collapseKey: text("collapse_key"),
    /** Kolik událostí se do upozornění sloučilo. */
    count: integer("count").notNull().default(1),
    readAt: ts("read_at"),
    /** Zastaralé (původní push „na jedno použití“); nahradila ho tabulka `notification_delivery`. Odstraní se v dalším vydání. */
    pushedAt: ts("pushed_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("notification_user_idx").on(t.userId, t.readAt, t.createdAt),
    index("notification_unpushed_idx")
      .on(t.createdAt)
      .where(sql`${t.pushedAt} is null`),
    uniqueIndex("notification_dedupe_uq")
      .on(t.userId, t.dedupeKey)
      .where(sql`${t.dedupeKey} is not null`),
    index("notification_collapse_idx")
      .on(t.userId, t.collapseKey)
      .where(sql`${t.collapseKey} is not null and ${t.readAt} is null`),
  ],
);

/**
 * Doručení upozornění jedním kanálem (push, e-mail). Řádek je zároveň fronta (`status`, `release_at`) a protokol
 * (stav, důvod přeskočení, počet zařízení). Nikdy neobsahuje adresy odběrů ani klíče.
 */
export const notificationDelivery = pgTable(
  "notification_delivery",
  {
    id: pk(),
    notificationId: uuid("notification_id")
      .notNull()
      .references(() => notification.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    channel: text("channel", { enum: ["push", "email"] }).notNull(),
    /**
     * `queued` čeká na odeslání, `held` čeká na tiché hodiny nebo shrnutí, `retry` čeká na další pokus,
     * `sending` zpracovává worker, `sent`, `failed`, `skipped` (důvod v `reason`).
     */
    status: text("status", {
      enum: ["queued", "held", "retry", "sending", "sent", "failed", "skipped"],
    }).notNull(),
    /** Jak vzniklo zdržení: okamžitě, shrnutí, tiché hodiny. */
    mode: text("mode", { enum: ["instant", "digest", "quiet"] })
      .notNull()
      .default("instant"),
    reason: text("reason"),
    attempts: integer("attempts").notNull().default(0),
    /** Od kdy smí worker odeslat. */
    releaseAt: ts("release_at").notNull().defaultNow(),
    claimedAt: ts("claimed_at"),
    sentAt: ts("sent_at"),
    /** Bez tajemství: počet zařízení, hostitelé push služeb, stavové kódy chyb. */
    detail: jsonb("detail"),
    lastError: text("last_error"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("notification_delivery_due_idx")
      .on(t.releaseAt)
      .where(sql`${t.status} in ('queued', 'held', 'retry', 'sending')`),
    index("notification_delivery_notification_idx").on(t.notificationId),
    index("notification_delivery_user_idx").on(t.userId, t.createdAt),
  ],
);

/** Předvolby upozornění uživatele (události × kanály, tiché hodiny, shrnutí). Struktura je zod schéma v jádru. */
export const notificationPref = pgTable("notification_pref", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  prefs: jsonb("prefs").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** Odběr push upozornění jednoho zařízení (Web Push). Adresa je podle prohlížeče; jeden uživatel jich má víc. */
export const pushSubscription = pgTable(
  "push_subscription",
  {
    id: pk(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    /** Relace, ve které se zařízení přihlásilo k odběru; odhlášení z ní odběr zruší. */
    sessionId: text("session_id"),
    createdAt: ts("created_at").notNull().defaultNow(),
    lastSentAt: ts("last_sent_at"),
    /** Kolikrát po sobě odeslání selhalo (přechodná chyba); po úspěchu se nuluje. */
    failures: integer("failures").notNull().default(0),
    lastError: text("last_error"),
  },
  (t) => [
    uniqueIndex("push_subscription_endpoint_uq").on(t.endpoint),
    index("push_subscription_user_idx").on(t.userId),
  ],
);

/**
 * Zámek proti opakovanému odeslání téže připomínky (STK, servisní interval, zítřejší rezervace…).
 * Klíč skládá modul tak, aby obsahoval i stav (např. `stroje:<id>:stk:<datum>:7`), a znovu se tedy
 * odešle až po změně termínu nebo při dalším stupni upozornění.
 */
export const reminderSent = pgTable("reminder_sent", {
  key: text("key").primaryKey(),
  createdAt: ts("created_at").notNull().defaultNow(),
});
