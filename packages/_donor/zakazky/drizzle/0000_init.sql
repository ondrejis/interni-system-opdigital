CREATE TABLE "job" (
	"id" uuid PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"title" text NOT NULL,
	"company_id" uuid NOT NULL,
	"person_id" uuid,
	"stage_id" uuid NOT NULL,
	"value_minor" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'CZK' NOT NULL,
	"address" text,
	"start_date" date,
	"end_date" date,
	"manager_id" uuid,
	"description" text,
	"phase" text DEFAULT 'preparation' NOT NULL,
	"phase_changed_at" timestamp with time zone,
	"paused_from" text,
	"lost_reason" text,
	"won_at" date,
	"handover_at" date,
	"closed_at" date,
	"warranty_months" integer,
	"warranty_until" date,
	"color" text,
	"source_inquiry_id" uuid,
	"template_id" uuid,
	"expected_close_date" date,
	"crm_probability_pct" smallint,
	"crm_source" text,
	"crm_source_channel" text,
	"crm_campaign" text,
	"site_city" text,
	"crm_stage_entered_at" timestamp with time zone,
	"crm_next_activity_at" timestamp with time zone,
	"crm_last_activity_at" timestamp with time zone,
	"crm_open_activities" integer DEFAULT 0 NOT NULL,
	"crm_overdue_activities" integer DEFAULT 0 NOT NULL,
	"crm_rotting" boolean DEFAULT false NOT NULL,
	"crm_weighted_minor" bigint DEFAULT 0 NOT NULL,
	"crm_archived_at" timestamp with time zone,
	"crm_lost_note" text,
	"custom" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "job_member" (
	"job_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text,
	CONSTRAINT "job_member_job_id_user_id_pk" PRIMARY KEY("job_id","user_id")
);
--> statement-breakpoint
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
CREATE TABLE "job_template" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_stage_id_pipeline_stage_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."pipeline_stage"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_manager_id_user_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_member" ADD CONSTRAINT "job_member_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_member" ADD CONSTRAINT "job_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_participant" ADD CONSTRAINT "job_participant_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_participant" ADD CONSTRAINT "job_participant_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_participant" ADD CONSTRAINT "job_participant_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_participant" ADD CONSTRAINT "job_participant_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_stage_history" ADD CONSTRAINT "job_stage_history_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_stage_history" ADD CONSTRAINT "job_stage_history_stage_id_pipeline_stage_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."pipeline_stage"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_stage_history" ADD CONSTRAINT "job_stage_history_changed_by_user_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_template" ADD CONSTRAINT "job_template_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_template" ADD CONSTRAINT "job_template_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_number_uq" ON "job" USING btree ("number");--> statement-breakpoint
CREATE INDEX "job_phase_idx" ON "job" USING btree ("phase");--> statement-breakpoint
CREATE INDEX "job_company_idx" ON "job" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "job_stage_idx" ON "job" USING btree ("stage_id");--> statement-breakpoint
CREATE INDEX "job_manager_idx" ON "job" USING btree ("manager_id");--> statement-breakpoint
CREATE INDEX "job_crm_close_idx" ON "job" USING btree ("expected_close_date");--> statement-breakpoint
CREATE INDEX "job_crm_next_activity_idx" ON "job" USING btree ("crm_next_activity_at");--> statement-breakpoint
CREATE INDEX "job_title_trgm_idx" ON "job" USING gin (lower(f_unaccent("title")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "job_number_trgm_idx" ON "job" USING gin (lower(f_unaccent("number")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "job_address_trgm_idx" ON "job" USING gin (lower(f_unaccent("address")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "job_custom_idx" ON "job" USING gin ("custom");--> statement-breakpoint
CREATE INDEX "job_member_user_idx" ON "job_member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_participant_uq" ON "job_participant" USING btree ("job_id","person_id") WHERE "job_participant"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "job_participant_person_idx" ON "job_participant" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "job_stage_history_job_idx" ON "job_stage_history" USING btree ("job_id","entered_at");--> statement-breakpoint
CREATE INDEX "job_stage_history_stage_idx" ON "job_stage_history" USING btree ("stage_id");