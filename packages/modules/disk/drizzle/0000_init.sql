CREATE TABLE "drive_folder" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"subkey" text DEFAULT '' NOT NULL,
	"folder_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"deleted_batch" uuid
);
--> statement-breakpoint
CREATE TABLE "drive_request" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"requested_by" uuid,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"done_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "drive_folder" ADD CONSTRAINT "drive_folder_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_folder" ADD CONSTRAINT "drive_folder_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_folder" ADD CONSTRAINT "drive_folder_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_request" ADD CONSTRAINT "drive_request_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "drive_folder_entity_uq" ON "drive_folder" USING btree ("entity_type","entity_id","subkey");--> statement-breakpoint
CREATE INDEX "drive_request_entity_idx" ON "drive_request" USING btree ("entity_type","entity_id","requested_at");--> statement-breakpoint
CREATE INDEX "drive_request_open_idx" ON "drive_request" USING btree ("requested_at") WHERE "drive_request"."state" in ('pending', 'sent');--> statement-breakpoint
CREATE INDEX "drive_request_error_idx" ON "drive_request" USING btree ("requested_at") WHERE "drive_request"."state" in ('error', 'timeout');