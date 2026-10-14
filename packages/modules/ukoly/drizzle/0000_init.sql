CREATE TABLE "task" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"type_key" text DEFAULT 'task' NOT NULL,
	"status" text DEFAULT 'todo' NOT NULL,
	"priority" text DEFAULT 'none' NOT NULL,
	"assignee_id" uuid,
	"due_date" date,
	"due_time" time,
	"duration_min" integer,
	"all_day" boolean DEFAULT false NOT NULL,
	"place" text,
	"estimate_min" integer,
	"outcome" text,
	"completed_at" timestamp with time zone,
	"parent_id" uuid,
	"deal_id" uuid,
	"company_id" uuid,
	"person_id" uuid,
	"job_id" uuid,
	"job_phase_id" uuid,
	"send_invites" boolean DEFAULT false NOT NULL,
	"source_template_task" text,
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
	"deleted_batch" uuid,
	CONSTRAINT "task_duration_chk" CHECK ("task"."duration_min" is null or "task"."duration_min" > 0)
);
--> statement-breakpoint
CREATE TABLE "task_attendee" (
	"id" uuid PRIMARY KEY NOT NULL,
	"task_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"ref" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"deleted_batch" uuid
);
--> statement-breakpoint
CREATE TABLE "task_type" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"color" text,
	"is_calendar_event" boolean DEFAULT false NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"deleted_batch" uuid
);
--> statement-breakpoint
CREATE TABLE "note" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" text,
	"body_json" jsonb,
	"body_text" text DEFAULT '' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"deal_id" uuid,
	"company_id" uuid,
	"person_id" uuid,
	"job_id" uuid,
	"is_private" boolean DEFAULT false NOT NULL,
	"visibility_source" text DEFAULT 'own' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"deleted_batch" uuid,
	CONSTRAINT "note_single_link_chk" CHECK (num_nonnulls("note"."deal_id", "note"."company_id", "note"."person_id", "note"."job_id") <= 1)
);
--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_parent_id_task_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."task"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_attendee" ADD CONSTRAINT "task_attendee_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_attendee" ADD CONSTRAINT "task_attendee_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_attendee" ADD CONSTRAINT "task_attendee_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_attendee" ADD CONSTRAINT "task_attendee_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_type" ADD CONSTRAINT "task_type_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_type" ADD CONSTRAINT "task_type_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_type" ADD CONSTRAINT "task_type_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_assignee_idx" ON "task" USING btree ("assignee_id","status","due_date");--> statement-breakpoint
CREATE INDEX "task_open_due_idx" ON "task" USING btree ("due_date") WHERE "task"."status" in ('todo', 'in_progress');--> statement-breakpoint
CREATE INDEX "task_completed_idx" ON "task" USING btree ("completed_at") WHERE "task"."completed_at" is not null;--> statement-breakpoint
CREATE INDEX "task_deal_idx" ON "task" USING btree ("deal_id") WHERE "task"."deal_id" is not null;--> statement-breakpoint
CREATE INDEX "task_company_idx" ON "task" USING btree ("company_id") WHERE "task"."company_id" is not null;--> statement-breakpoint
CREATE INDEX "task_person_idx" ON "task" USING btree ("person_id") WHERE "task"."person_id" is not null;--> statement-breakpoint
CREATE INDEX "task_job_idx" ON "task" USING btree ("job_id") WHERE "task"."job_id" is not null;--> statement-breakpoint
CREATE INDEX "task_job_phase_idx" ON "task" USING btree ("job_phase_id") WHERE "task"."job_phase_id" is not null;--> statement-breakpoint
CREATE INDEX "task_parent_idx" ON "task" USING btree ("parent_id") WHERE "task"."parent_id" is not null;--> statement-breakpoint
CREATE INDEX "task_created_by_idx" ON "task" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "task_title_trgm_idx" ON "task" USING gin (lower(f_unaccent("title")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "task_tags_idx" ON "task" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "task_custom_idx" ON "task" USING gin ("custom");--> statement-breakpoint
CREATE INDEX "task_private_idx" ON "task" USING btree ("is_private") WHERE "task"."is_private";--> statement-breakpoint
CREATE UNIQUE INDEX "task_attendee_uq" ON "task_attendee" USING btree ("task_id","kind","ref") WHERE "task_attendee"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "task_attendee_ref_idx" ON "task_attendee" USING btree ("kind","ref");--> statement-breakpoint
CREATE UNIQUE INDEX "task_type_key_uq" ON "task_type" USING btree ("key") WHERE "task_type"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "note_title_trgm_idx" ON "note" USING gin (lower(f_unaccent("title")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "note_body_trgm_idx" ON "note" USING gin (lower(f_unaccent("body_text")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "note_deal_idx" ON "note" USING btree ("deal_id") WHERE "note"."deal_id" is not null;--> statement-breakpoint
CREATE INDEX "note_company_idx" ON "note" USING btree ("company_id") WHERE "note"."company_id" is not null;--> statement-breakpoint
CREATE INDEX "note_person_idx" ON "note" USING btree ("person_id") WHERE "note"."person_id" is not null;--> statement-breakpoint
CREATE INDEX "note_job_idx" ON "note" USING btree ("job_id") WHERE "note"."job_id" is not null;--> statement-breakpoint
CREATE INDEX "note_pinned_idx" ON "note" USING btree ("updated_at") WHERE "note"."pinned";--> statement-breakpoint
CREATE INDEX "note_tags_idx" ON "note" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "note_private_idx" ON "note" USING btree ("is_private") WHERE "note"."is_private";