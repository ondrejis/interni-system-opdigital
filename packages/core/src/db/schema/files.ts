import { sql } from "drizzle-orm";
import {
  bigint,
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

export type Geo = { lat: number; lng: number; accuracy?: number };

/** Nahraný soubor. Obsah je v úložišti (`storage_key`), nikdy ne ve veřejné složce. */
export const file = pgTable(
  "file",
  {
    id: pk(),
    storageKey: text("storage_key").notNull().unique(),
    name: text("name").notNull(),
    mime: text("mime").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    sha256: text("sha256").notNull(),
    kind: text("kind", { enum: ["image", "document"] }).notNull(),
    width: integer("width"),
    height: integer("height"),
    thumbKey: text("thumb_key"),
    uploadedBy: uuid("uploaded_by").references(() => user.id),
    ...audit(),
  },
  (t) => [index("file_uploaded_by_idx").on(t.uploadedBy)],
);

/** Připojení souboru k záznamu (polymorfně). */
export const attachment = pgTable(
  "attachment",
  {
    id: pk(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => file.id),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    /** Druh přílohy: `photo`, `document`, `protocol`, `logo`… */
    kind: text("kind").notNull().default("document"),
    takenAt: ts("taken_at"),
    geo: jsonb("geo").$type<Geo>(),
    note: text("note"),
    ...audit(),
  },
  (t) => [
    index("attachment_entity_idx").on(t.entityType, t.entityId),
    uniqueIndex("attachment_uq")
      .on(t.fileId, t.entityType, t.entityId)
      .where(sql`${t.deletedAt} is null`),
  ],
);

/** Odeslané e-maily. Záměrně bez těla zprávy — tělo může obsahovat tajný odkaz. */
export const emailLog = pgTable(
  "email_log",
  {
    id: pk(),
    toEmail: text("to_email").notNull(),
    template: text("template").notNull(),
    subject: text("subject").notNull(),
    status: text("status", { enum: ["queued", "sent", "failed"] })
      .notNull()
      .default("queued"),
    error: text("error"),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    createdAt: ts("created_at").notNull().defaultNow(),
    sentAt: ts("sent_at"),
  },
  (t) => [index("email_log_time_idx").on(t.createdAt)],
);
