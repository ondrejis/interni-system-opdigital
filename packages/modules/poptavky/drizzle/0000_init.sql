CREATE TABLE "inquiry" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"company_id" uuid,
	"person_id" uuid,
	"company_name" text,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"stage_id" uuid NOT NULL,
	"source" text,
	"expected_value_minor" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'CZK' NOT NULL,
	"owner_id" uuid,
	"next_step" text,
	"next_step_at" date,
	"lost_reason" text,
	"converted_job_id" uuid,
	"message" text,
	"custom" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "inquiry_intake_key" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "inquiry_intake" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key_id" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"outcome" text NOT NULL,
	"inquiry_id" uuid,
	"ip" text,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "inquiry" ADD CONSTRAINT "inquiry_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry" ADD CONSTRAINT "inquiry_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry" ADD CONSTRAINT "inquiry_stage_id_pipeline_stage_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."pipeline_stage"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry" ADD CONSTRAINT "inquiry_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry" ADD CONSTRAINT "inquiry_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry" ADD CONSTRAINT "inquiry_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_intake_key" ADD CONSTRAINT "inquiry_intake_key_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_intake_key" ADD CONSTRAINT "inquiry_intake_key_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_intake" ADD CONSTRAINT "inquiry_intake_key_id_inquiry_intake_key_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."inquiry_intake_key"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_intake" ADD CONSTRAINT "inquiry_intake_inquiry_id_inquiry_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inquiry_stage_idx" ON "inquiry" USING btree ("stage_id");--> statement-breakpoint
CREATE INDEX "inquiry_owner_idx" ON "inquiry" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "inquiry_company_idx" ON "inquiry" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "inquiry_next_step_idx" ON "inquiry" USING btree ("next_step_at");--> statement-breakpoint
CREATE INDEX "inquiry_title_trgm_idx" ON "inquiry" USING gin (lower(f_unaccent("title")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "inquiry_custom_idx" ON "inquiry" USING gin ("custom");--> statement-breakpoint
CREATE UNIQUE INDEX "inquiry_intake_key_hash_uq" ON "inquiry_intake_key" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "inquiry_intake_received_idx" ON "inquiry_intake" USING btree ("received_at");