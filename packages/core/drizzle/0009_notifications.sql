CREATE TABLE "notification_delivery" (
	"id" uuid PRIMARY KEY NOT NULL,
	"notification_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"status" text NOT NULL,
	"mode" text DEFAULT 'instant' NOT NULL,
	"reason" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"release_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"detail" jsonb,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_pref" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"prefs" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "severity" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "inbox" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "dedupe_key" text;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "collapse_key" text;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD COLUMN "session_id" text;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD COLUMN "failures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "notification_delivery" ADD CONSTRAINT "notification_delivery_notification_id_notification_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notification"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_delivery" ADD CONSTRAINT "notification_delivery_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_pref" ADD CONSTRAINT "notification_pref_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_delivery_due_idx" ON "notification_delivery" USING btree ("release_at") WHERE "notification_delivery"."status" in ('queued', 'held', 'retry', 'sending');--> statement-breakpoint
CREATE INDEX "notification_delivery_notification_idx" ON "notification_delivery" USING btree ("notification_id");--> statement-breakpoint
CREATE INDEX "notification_delivery_user_idx" ON "notification_delivery" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_dedupe_uq" ON "notification" USING btree ("user_id","dedupe_key") WHERE "notification"."dedupe_key" is not null;--> statement-breakpoint
CREATE INDEX "notification_collapse_idx" ON "notification" USING btree ("user_id","collapse_key") WHERE "notification"."collapse_key" is not null and "notification"."read_at" is null;