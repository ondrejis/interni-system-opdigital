CREATE TABLE "private_record" (
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"since" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "private_record_entity_type_entity_id_pk" PRIMARY KEY("entity_type","entity_id")
);
--> statement-breakpoint
CREATE TABLE "recent_record" (
	"user_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"visited_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recent_record_user_id_entity_type_entity_id_pk" PRIMARY KEY("user_id","entity_type","entity_id")
);
--> statement-breakpoint
CREATE TABLE "inbound_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"error" text,
	"entity_type" text,
	"entity_id" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "integration_credential" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"user_id" uuid,
	"data_enc" text NOT NULL,
	"status" text DEFAULT 'ok' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"deleted_batch" uuid
);
--> statement-breakpoint
CREATE TABLE "webhook_delivery" (
	"id" uuid PRIMARY KEY NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"event" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoint" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"secret_enc" text NOT NULL,
	"events" text[] DEFAULT '{}'::text[] NOT NULL,
	"include_private" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"deleted_batch" uuid
);
--> statement-breakpoint
ALTER TABLE "task" RENAME TO "core_task";--> statement-breakpoint
ALTER INDEX "task_pkey" RENAME TO "core_task_pkey";--> statement-breakpoint
ALTER TABLE "core_task" DROP CONSTRAINT "task_assignee_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "core_task" DROP CONSTRAINT "task_created_by_user_id_fk";
--> statement-breakpoint
ALTER TABLE "core_task" DROP CONSTRAINT "task_updated_by_user_id_fk";
--> statement-breakpoint
DROP INDEX "task_assignee_idx";--> statement-breakpoint
DROP INDEX "task_entity_idx";--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "deleted_batch" uuid;--> statement-breakpoint
ALTER TABLE "role" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "role" ADD COLUMN "deleted_batch" uuid;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "short_name" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "ico" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "billing_tool" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "avatar_color" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "prefs" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "deleted_batch" uuid;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "actor_label" text;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "category" text DEFAULT 'data' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "is_private" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "entity_title" text;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "context" jsonb;--> statement-breakpoint
ALTER TABLE "comment" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "comment" ADD COLUMN "deleted_batch" uuid;--> statement-breakpoint
ALTER TABLE "core_task" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "core_task" ADD COLUMN "deleted_batch" uuid;--> statement-breakpoint
ALTER TABLE "custom_field_def" ADD COLUMN "show_in_form" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "custom_field_def" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "custom_field_def" ADD COLUMN "deleted_batch" uuid;--> statement-breakpoint
ALTER TABLE "employee" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "employee" ADD COLUMN "deleted_batch" uuid;--> statement-breakpoint
ALTER TABLE "lookup_item" ADD COLUMN "scopes" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "lookup_item" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "lookup_item" ADD COLUMN "deleted_batch" uuid;--> statement-breakpoint
ALTER TABLE "lookup_list" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "lookup_list" ADD COLUMN "deleted_batch" uuid;--> statement-breakpoint
ALTER TABLE "pipeline" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "pipeline" ADD COLUMN "deleted_batch" uuid;--> statement-breakpoint
ALTER TABLE "pipeline_stage" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "pipeline_stage" ADD COLUMN "deleted_batch" uuid;--> statement-breakpoint
ALTER TABLE "vat_rate" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "vat_rate" ADD COLUMN "deleted_batch" uuid;--> statement-breakpoint
ALTER TABLE "attachment" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "attachment" ADD COLUMN "deleted_batch" uuid;--> statement-breakpoint
ALTER TABLE "file" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "file" ADD COLUMN "deleted_batch" uuid;--> statement-breakpoint
ALTER TABLE "saved_view" ADD COLUMN "pinned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_view" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "saved_view" ADD COLUMN "deleted_batch" uuid;--> statement-breakpoint
ALTER TABLE "search_document" ADD COLUMN "is_private" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "dashboard" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "dashboard" ADD COLUMN "deleted_batch" uuid;--> statement-breakpoint
ALTER TABLE "export_schedule" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "export_schedule" ADD COLUMN "deleted_batch" uuid;--> statement-breakpoint
ALTER TABLE "export_template" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "export_template" ADD COLUMN "deleted_batch" uuid;--> statement-breakpoint
ALTER TABLE "recent_record" ADD CONSTRAINT "recent_record_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_credential" ADD CONSTRAINT "integration_credential_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_credential" ADD CONSTRAINT "integration_credential_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_credential" ADD CONSTRAINT "integration_credential_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_credential" ADD CONSTRAINT "integration_credential_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_endpoint_id_webhook_endpoint_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoint"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoint" ADD CONSTRAINT "webhook_endpoint_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoint" ADD CONSTRAINT "webhook_endpoint_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoint" ADD CONSTRAINT "webhook_endpoint_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "private_record_id_idx" ON "private_record" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "recent_record_user_idx" ON "recent_record" USING btree ("user_id","visited_at");--> statement-breakpoint
CREATE UNIQUE INDEX "inbound_event_uq" ON "inbound_event" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "inbound_event_status_idx" ON "inbound_event" USING btree ("status","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_credential_shared_uq" ON "integration_credential" USING btree ("provider") WHERE "integration_credential"."user_id" is null and "integration_credential"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "integration_credential_user_uq" ON "integration_credential" USING btree ("provider","user_id") WHERE "integration_credential"."user_id" is not null and "integration_credential"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_delivery_event_uq" ON "webhook_delivery" USING btree ("endpoint_id","event_id");--> statement-breakpoint
CREATE INDEX "webhook_delivery_due_idx" ON "webhook_delivery" USING btree ("next_attempt_at") WHERE "webhook_delivery"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "webhook_delivery_failed_idx" ON "webhook_delivery" USING btree ("created_at") WHERE "webhook_delivery"."status" = 'failed';--> statement-breakpoint
CREATE INDEX "webhook_endpoint_active_idx" ON "webhook_endpoint" USING btree ("active");--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role" ADD CONSTRAINT "role_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core_task" ADD CONSTRAINT "core_task_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core_task" ADD CONSTRAINT "core_task_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core_task" ADD CONSTRAINT "core_task_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core_task" ADD CONSTRAINT "core_task_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_def" ADD CONSTRAINT "custom_field_def_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee" ADD CONSTRAINT "employee_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lookup_item" ADD CONSTRAINT "lookup_item_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lookup_list" ADD CONSTRAINT "lookup_list_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline" ADD CONSTRAINT "pipeline_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_stage" ADD CONSTRAINT "pipeline_stage_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vat_rate" ADD CONSTRAINT "vat_rate_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file" ADD CONSTRAINT "file_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_view" ADD CONSTRAINT "saved_view_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard" ADD CONSTRAINT "dashboard_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_schedule" ADD CONSTRAINT "export_schedule_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_template" ADD CONSTRAINT "export_template_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_category_idx" ON "audit_log" USING btree ("category","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_log_private_idx" ON "audit_log" USING btree ("occurred_at") WHERE "audit_log"."is_private";--> statement-breakpoint
CREATE INDEX "audit_log_title_trgm_idx" ON "audit_log" USING gin (lower(f_unaccent("entity_title")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "core_task_assignee_idx" ON "core_task" USING btree ("assignee_id","done_at","due_date");--> statement-breakpoint
CREATE INDEX "core_task_entity_idx" ON "core_task" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "search_document_private_idx" ON "search_document" USING btree ("entity_type") WHERE "search_document"."is_private";