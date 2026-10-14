CREATE TABLE "job_participant" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"role" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "job_stage_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"stage_id" uuid NOT NULL,
	"phase" text,
	"entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"changed_by" uuid
);
--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "expected_close_date" date;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "crm_probability_pct" smallint;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "crm_source" text;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "crm_source_channel" text;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "crm_campaign" text;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "site_city" text;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "crm_stage_entered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "crm_next_activity_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "crm_last_activity_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "crm_open_activities" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "crm_overdue_activities" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "crm_rotting" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "crm_weighted_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "crm_archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "crm_lost_note" text;--> statement-breakpoint
ALTER TABLE "job_participant" ADD CONSTRAINT "job_participant_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_participant" ADD CONSTRAINT "job_participant_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_participant" ADD CONSTRAINT "job_participant_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_participant" ADD CONSTRAINT "job_participant_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_stage_history" ADD CONSTRAINT "job_stage_history_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_stage_history" ADD CONSTRAINT "job_stage_history_stage_id_pipeline_stage_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."pipeline_stage"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_stage_history" ADD CONSTRAINT "job_stage_history_changed_by_user_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_participant_uq" ON "job_participant" USING btree ("job_id","person_id") WHERE "job_participant"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "job_participant_person_idx" ON "job_participant" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "job_stage_history_job_idx" ON "job_stage_history" USING btree ("job_id","entered_at");--> statement-breakpoint
CREATE INDEX "job_stage_history_stage_idx" ON "job_stage_history" USING btree ("stage_id");--> statement-breakpoint
CREATE INDEX "job_crm_close_idx" ON "job" USING btree ("expected_close_date");--> statement-breakpoint
CREATE INDEX "job_crm_next_activity_idx" ON "job" USING btree ("crm_next_activity_at");