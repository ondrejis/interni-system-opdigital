CREATE TABLE "job" (
	"id" uuid PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"title" text NOT NULL,
	"company_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"current_phase_id" uuid,
	"billing_model" text DEFAULT 'one_off' NOT NULL,
	"marketing_stage" text,
	"owner_id" uuid,
	"start_date" date,
	"due_date" date,
	"completed_at" timestamp with time zone,
	"price_minor" bigint,
	"description" text,
	"deal_id" uuid,
	"template_id" uuid,
	"drive_folder_id" text,
	"drive_status" text DEFAULT 'none' NOT NULL,
	"is_private" boolean DEFAULT false NOT NULL,
	"visibility_source" text DEFAULT 'own' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"custom" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"deleted_batch" uuid
);
--> statement-breakpoint
CREATE TABLE "job_member" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"deleted_batch" uuid
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
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"deleted_batch" uuid
);
--> statement-breakpoint
CREATE TABLE "job_phase" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"role" text,
	"status" text DEFAULT 'not_started' NOT NULL,
	"planned_start" date,
	"planned_end" date,
	"completed_at" timestamp with time zone,
	"is_private" boolean DEFAULT false NOT NULL,
	"visibility_source" text DEFAULT 'own' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"deleted_batch" uuid
);
--> statement-breakpoint
CREATE TABLE "job_template" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"description" text,
	"default_billing_model" text DEFAULT 'one_off' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"payload" jsonb DEFAULT '{"v":1,"phases":[],"tasks":[],"payments":[]}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"deleted_batch" uuid
);
--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_template_id_job_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."job_template"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_member" ADD CONSTRAINT "job_member_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_member" ADD CONSTRAINT "job_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_member" ADD CONSTRAINT "job_member_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_member" ADD CONSTRAINT "job_member_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_member" ADD CONSTRAINT "job_member_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_participant" ADD CONSTRAINT "job_participant_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_participant" ADD CONSTRAINT "job_participant_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_participant" ADD CONSTRAINT "job_participant_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_participant" ADD CONSTRAINT "job_participant_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_phase" ADD CONSTRAINT "job_phase_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_phase" ADD CONSTRAINT "job_phase_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_phase" ADD CONSTRAINT "job_phase_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_phase" ADD CONSTRAINT "job_phase_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_template" ADD CONSTRAINT "job_template_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_template" ADD CONSTRAINT "job_template_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_template" ADD CONSTRAINT "job_template_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_number_uq" ON "job" USING btree ("number");--> statement-breakpoint
CREATE INDEX "job_company_idx" ON "job" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "job_owner_idx" ON "job" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "job_status_idx" ON "job" USING btree ("status","type");--> statement-breakpoint
CREATE INDEX "job_deal_idx" ON "job" USING btree ("deal_id") WHERE "job"."deal_id" is not null;--> statement-breakpoint
CREATE INDEX "job_due_idx" ON "job" USING btree ("due_date") WHERE "job"."status" in ('planned', 'active', 'paused');--> statement-breakpoint
CREATE INDEX "job_template_idx" ON "job" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "job_title_trgm_idx" ON "job" USING gin (lower(f_unaccent("title")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "job_number_trgm_idx" ON "job" USING gin (lower(f_unaccent("number")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "job_tags_idx" ON "job" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "job_custom_idx" ON "job" USING gin ("custom");--> statement-breakpoint
CREATE INDEX "job_private_idx" ON "job" USING btree ("is_private") WHERE "job"."is_private";--> statement-breakpoint
CREATE UNIQUE INDEX "job_member_uq" ON "job_member" USING btree ("job_id","user_id") WHERE "job_member"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "job_member_user_idx" ON "job_member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_participant_uq" ON "job_participant" USING btree ("job_id","person_id") WHERE "job_participant"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "job_participant_person_idx" ON "job_participant" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "job_phase_job_idx" ON "job_phase" USING btree ("job_id","position");--> statement-breakpoint
CREATE INDEX "job_phase_status_idx" ON "job_phase" USING btree ("status");--> statement-breakpoint
CREATE INDEX "job_phase_private_idx" ON "job_phase" USING btree ("is_private") WHERE "job_phase"."is_private";--> statement-breakpoint
CREATE INDEX "job_template_type_idx" ON "job_template" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX "job_template_default_uq" ON "job_template" USING btree ("type") WHERE "job_template"."is_default" and "job_template"."archived_at" is null and "job_template"."deleted_at" is null;