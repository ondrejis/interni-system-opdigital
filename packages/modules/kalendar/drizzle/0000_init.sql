CREATE TABLE "calendar_feed" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_fetch_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "calendar_import" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"url_encrypted" text NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"event_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_resource" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'room' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"type" text DEFAULT 'meeting' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"location" text,
	"owner_id" uuid NOT NULL,
	"resource_id" uuid,
	"job_id" uuid,
	"note" text,
	"recurrence" text,
	"recurrence_until" date,
	"reminder_minutes" integer,
	"custom" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "event_attendee" (
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "event_attendee_event_id_user_id_pk" PRIMARY KEY("event_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "external_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"import_id" uuid NOT NULL,
	"uid" text NOT NULL,
	"title" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_feed" ADD CONSTRAINT "calendar_feed_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_import" ADD CONSTRAINT "calendar_import_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_resource" ADD CONSTRAINT "calendar_resource_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_resource" ADD CONSTRAINT "calendar_resource_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_resource_id_calendar_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."calendar_resource"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_attendee" ADD CONSTRAINT "event_attendee_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_attendee" ADD CONSTRAINT "event_attendee_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_event" ADD CONSTRAINT "external_event_import_id_calendar_import_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."calendar_import"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_feed_token_uq" ON "calendar_feed" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "calendar_import_user_idx" ON "calendar_import" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "calendar_resource_active_idx" ON "calendar_resource" USING btree ("active");--> statement-breakpoint
CREATE INDEX "event_starts_idx" ON "event" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "event_owner_idx" ON "event" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "event_resource_idx" ON "event" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "event_job_idx" ON "event" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "event_custom_idx" ON "event" USING gin ("custom");--> statement-breakpoint
CREATE INDEX "event_attendee_user_idx" ON "event_attendee" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "external_event_import_idx" ON "external_event" USING btree ("import_id");--> statement-breakpoint
CREATE INDEX "external_event_starts_idx" ON "external_event" USING btree ("starts_at");