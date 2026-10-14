CREATE TABLE "dashboard" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"owner_id" uuid,
	"definition" jsonb NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"seed_key" text,
	"default_for_role" text,
	"is_home" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "dashboard_pref" (
	"user_id" uuid NOT NULL,
	"dashboard_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "dashboard_pref_user_id_dashboard_id_pk" PRIMARY KEY("user_id","dashboard_id")
);
--> statement-breakpoint
CREATE TABLE "dashboard_share" (
	"dashboard_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"ref" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dashboard_share_dashboard_id_kind_ref_pk" PRIMARY KEY("dashboard_id","kind","ref")
);
--> statement-breakpoint
CREATE TABLE "export_run" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"schedule_id" uuid,
	"template_id" uuid,
	"entity_type" text NOT NULL,
	"label" text NOT NULL,
	"format" text NOT NULL,
	"file_name" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"row_count" integer,
	"size_bytes" bigint,
	"file_key" text,
	"spec" jsonb NOT NULL,
	"error" text,
	"period_key" text,
	"deliver_email" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "export_schedule" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"template_id" uuid,
	"spec" jsonb NOT NULL,
	"frequency" text NOT NULL,
	"weekday" integer,
	"month_day" integer,
	"time_local" text DEFAULT '06:00' NOT NULL,
	"recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"deliver" text DEFAULT 'myexports' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"last_status" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "export_template" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"shared" boolean DEFAULT false NOT NULL,
	"config" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "dashboard" ADD CONSTRAINT "dashboard_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard" ADD CONSTRAINT "dashboard_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard" ADD CONSTRAINT "dashboard_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_pref" ADD CONSTRAINT "dashboard_pref_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_pref" ADD CONSTRAINT "dashboard_pref_dashboard_id_dashboard_id_fk" FOREIGN KEY ("dashboard_id") REFERENCES "public"."dashboard"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_share" ADD CONSTRAINT "dashboard_share_dashboard_id_dashboard_id_fk" FOREIGN KEY ("dashboard_id") REFERENCES "public"."dashboard"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_run" ADD CONSTRAINT "export_run_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_run" ADD CONSTRAINT "export_run_schedule_id_export_schedule_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."export_schedule"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_run" ADD CONSTRAINT "export_run_template_id_export_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."export_template"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_schedule" ADD CONSTRAINT "export_schedule_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_schedule" ADD CONSTRAINT "export_schedule_template_id_export_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."export_template"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_schedule" ADD CONSTRAINT "export_schedule_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_schedule" ADD CONSTRAINT "export_schedule_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_template" ADD CONSTRAINT "export_template_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_template" ADD CONSTRAINT "export_template_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_template" ADD CONSTRAINT "export_template_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dashboard_seed_key_uq" ON "dashboard" USING btree ("seed_key") WHERE "dashboard"."seed_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "dashboard_home_role_uq" ON "dashboard" USING btree ("default_for_role") WHERE "dashboard"."is_home" and "dashboard"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "dashboard_owner_idx" ON "dashboard" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "dashboard_role_idx" ON "dashboard" USING btree ("default_for_role");--> statement-breakpoint
CREATE INDEX "dashboard_share_ref_idx" ON "dashboard_share" USING btree ("kind","ref");--> statement-breakpoint
CREATE INDEX "export_run_user_idx" ON "export_run" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "export_run_pending_idx" ON "export_run" USING btree ("created_at") WHERE "export_run"."status" in ('queued', 'running');--> statement-breakpoint
CREATE INDEX "export_run_expiry_idx" ON "export_run" USING btree ("expires_at") WHERE "export_run"."file_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "export_run_period_uq" ON "export_run" USING btree ("schedule_id","period_key","user_id") WHERE "export_run"."schedule_id" is not null and "export_run"."period_key" is not null;--> statement-breakpoint
CREATE INDEX "export_schedule_due_idx" ON "export_schedule" USING btree ("next_run_at") WHERE "export_schedule"."active" and "export_schedule"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "export_schedule_owner_idx" ON "export_schedule" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "export_template_entity_idx" ON "export_template" USING btree ("entity_type","owner_id");