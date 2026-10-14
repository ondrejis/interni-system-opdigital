CREATE TABLE "defect" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"stage_id" uuid NOT NULL,
	"severity" text,
	"found_at" date,
	"due_date" date,
	"responsible_id" uuid,
	"fixed_at" date,
	"handover_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "handover_item" (
	"id" uuid PRIMARY KEY NOT NULL,
	"protocol_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"text" text NOT NULL,
	"ok" boolean DEFAULT true NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "handover_protocol" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"number" text NOT NULL,
	"date" date NOT NULL,
	"note" text,
	"accepted_by" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"signature_file_id" uuid,
	"signed_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "job_phase" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"baseline_start" date,
	"baseline_end" date,
	"actual_start" date,
	"actual_end" date,
	"progress" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"planned_hours" integer,
	"responsible_id" uuid,
	"depends_on_id" uuid,
	"milestone" boolean DEFAULT false NOT NULL,
	"note" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "site_diary" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"date" date NOT NULL,
	"weather" text,
	"temperature" integer,
	"people" text,
	"work" text,
	"machines" text,
	"materials" text,
	"events" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "defect" ADD CONSTRAINT "defect_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "defect" ADD CONSTRAINT "defect_stage_id_pipeline_stage_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."pipeline_stage"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "defect" ADD CONSTRAINT "defect_responsible_id_user_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "defect" ADD CONSTRAINT "defect_handover_id_handover_protocol_id_fk" FOREIGN KEY ("handover_id") REFERENCES "public"."handover_protocol"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "defect" ADD CONSTRAINT "defect_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "defect" ADD CONSTRAINT "defect_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_item" ADD CONSTRAINT "handover_item_protocol_id_handover_protocol_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."handover_protocol"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_protocol" ADD CONSTRAINT "handover_protocol_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_protocol" ADD CONSTRAINT "handover_protocol_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_protocol" ADD CONSTRAINT "handover_protocol_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_phase" ADD CONSTRAINT "job_phase_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_phase" ADD CONSTRAINT "job_phase_responsible_id_user_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_phase" ADD CONSTRAINT "job_phase_depends_on_id_job_phase_id_fk" FOREIGN KEY ("depends_on_id") REFERENCES "public"."job_phase"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_phase" ADD CONSTRAINT "job_phase_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_phase" ADD CONSTRAINT "job_phase_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_diary" ADD CONSTRAINT "site_diary_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_diary" ADD CONSTRAINT "site_diary_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_diary" ADD CONSTRAINT "site_diary_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "defect_job_idx" ON "defect" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "defect_stage_idx" ON "defect" USING btree ("stage_id");--> statement-breakpoint
CREATE INDEX "defect_responsible_idx" ON "defect" USING btree ("responsible_id");--> statement-breakpoint
CREATE INDEX "defect_due_idx" ON "defect" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "handover_item_protocol_idx" ON "handover_item" USING btree ("protocol_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "handover_number_uq" ON "handover_protocol" USING btree ("number");--> statement-breakpoint
CREATE INDEX "handover_job_idx" ON "handover_protocol" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "job_phase_job_idx" ON "job_phase" USING btree ("job_id","position");--> statement-breakpoint
CREATE INDEX "job_phase_range_idx" ON "job_phase" USING btree ("start_date","end_date");--> statement-breakpoint
CREATE UNIQUE INDEX "site_diary_job_date_uq" ON "site_diary" USING btree ("job_id","date") WHERE "site_diary"."deleted_at" is null;