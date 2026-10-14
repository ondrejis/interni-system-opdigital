CREATE TABLE "time_entry" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"kind" text DEFAULT 'work' NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"break_minutes" integer DEFAULT 0 NOT NULL,
	"break_started_at" timestamp with time zone,
	"minutes" integer DEFAULT 0 NOT NULL,
	"job_id" uuid,
	"phase_id" uuid,
	"note" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"hourly_cost_minor" bigint DEFAULT 0 NOT NULL,
	"reviewer_id" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "time_lock" (
	"month" text PRIMARY KEY NOT NULL,
	"locked_by" uuid,
	"locked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_reviewer_id_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_lock" ADD CONSTRAINT "time_lock_locked_by_user_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "time_entry_user_date_idx" ON "time_entry" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "time_entry_job_idx" ON "time_entry" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "time_entry_status_idx" ON "time_entry" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "time_entry_running_uq" ON "time_entry" USING btree ("user_id") WHERE "time_entry"."source" = 'clock' and "time_entry"."ended_at" is null and "time_entry"."deleted_at" is null;