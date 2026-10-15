CREATE TABLE "calendar" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"google_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"visible" boolean DEFAULT true NOT NULL,
	"is_write_target" boolean DEFAULT false NOT NULL,
	"sync_token" text,
	"watch_channel_id" text,
	"watch_expires_at" timestamp with time zone,
	"access_role" text DEFAULT 'reader' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"time_zone" text,
	"sync_window_to" date,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"watch_resource_id" text,
	"watch_token_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"deleted_batch" uuid
);
--> statement-breakpoint
CREATE TABLE "calendar_account" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"google_email" text NOT NULL,
	"tokens_enc" text NOT NULL,
	"status" text DEFAULT 'ok' NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"deleted_batch" uuid
);
--> statement-breakpoint
CREATE TABLE "calendar_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"calendar_id" uuid NOT NULL,
	"google_id" text NOT NULL,
	"etag" text,
	"title" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"place" text,
	"meet_url" text,
	"attendees" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_google_private" boolean DEFAULT false NOT NULL,
	"task_id" uuid,
	"deal_id" uuid,
	"company_id" uuid,
	"person_id" uuid,
	"linked_by" uuid,
	"remote_deleted" boolean DEFAULT false NOT NULL,
	"description" text,
	"html_link" text,
	"recurring_event_id" text,
	"original_start_at" timestamp with time zone,
	"visibility" text DEFAULT 'default' NOT NULL,
	"organizer_email" text,
	"google_updated_at" timestamp with time zone,
	"source" text DEFAULT 'google' NOT NULL,
	"remote_deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"deleted_batch" uuid
);
--> statement-breakpoint
CREATE TABLE "calendar_push" (
	"id" uuid PRIMARY KEY NOT NULL,
	"task_id" uuid,
	"op" text DEFAULT 'upsert' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"want_meet" boolean DEFAULT false NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"done_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "calendar" ADD CONSTRAINT "calendar_account_id_calendar_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."calendar_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar" ADD CONSTRAINT "calendar_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar" ADD CONSTRAINT "calendar_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar" ADD CONSTRAINT "calendar_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_account" ADD CONSTRAINT "calendar_account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_account" ADD CONSTRAINT "calendar_account_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_account" ADD CONSTRAINT "calendar_account_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_account" ADD CONSTRAINT "calendar_account_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_calendar_id_calendar_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendar"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_linked_by_user_id_fk" FOREIGN KEY ("linked_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_google_uq" ON "calendar" USING btree ("account_id","google_id") WHERE "calendar"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_write_target_uq" ON "calendar" USING btree ("account_id") WHERE "calendar"."is_write_target" and "calendar"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_watch_channel_uq" ON "calendar" USING btree ("watch_channel_id") WHERE "calendar"."watch_channel_id" is not null;--> statement-breakpoint
CREATE INDEX "calendar_watch_expires_idx" ON "calendar" USING btree ("watch_expires_at") WHERE "calendar"."watch_channel_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_account_user_uq" ON "calendar_account" USING btree ("user_id") WHERE "calendar_account"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_event_google_uq" ON "calendar_event" USING btree ("calendar_id","google_id");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_event_task_uq" ON "calendar_event" USING btree ("task_id") WHERE "calendar_event"."task_id" is not null;--> statement-breakpoint
CREATE INDEX "calendar_event_recurring_idx" ON "calendar_event" USING btree ("recurring_event_id") WHERE "calendar_event"."recurring_event_id" is not null;--> statement-breakpoint
CREATE INDEX "calendar_event_range_idx" ON "calendar_event" USING btree ("starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "calendar_event_task_idx" ON "calendar_event" USING btree ("task_id") WHERE "calendar_event"."task_id" is not null;--> statement-breakpoint
CREATE INDEX "calendar_event_deal_idx" ON "calendar_event" USING btree ("deal_id") WHERE "calendar_event"."deal_id" is not null;--> statement-breakpoint
CREATE INDEX "calendar_event_company_idx" ON "calendar_event" USING btree ("company_id") WHERE "calendar_event"."company_id" is not null;--> statement-breakpoint
CREATE INDEX "calendar_event_person_idx" ON "calendar_event" USING btree ("person_id") WHERE "calendar_event"."person_id" is not null;--> statement-breakpoint
CREATE INDEX "calendar_event_title_trgm_idx" ON "calendar_event" USING gin (lower(f_unaccent("title")) gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_push_task_uq" ON "calendar_push" USING btree ("task_id") WHERE "calendar_push"."task_id" is not null and "calendar_push"."done_at" is null;--> statement-breakpoint
CREATE INDEX "calendar_push_due_idx" ON "calendar_push" USING btree ("next_attempt_at") WHERE "calendar_push"."done_at" is null;