CREATE TABLE "ad" (
	"id" uuid PRIMARY KEY NOT NULL,
	"ad_set_id" uuid NOT NULL,
	"meta_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text,
	"creative_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"deleted_batch" uuid
);
--> statement-breakpoint
CREATE TABLE "ad_account" (
	"id" uuid PRIMARY KEY NOT NULL,
	"meta_id" text NOT NULL,
	"name" text NOT NULL,
	"timezone" text,
	"currency" text,
	"owner_kind" text DEFAULT 'agency' NOT NULL,
	"company_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"deleted_batch" uuid
);
--> statement-breakpoint
CREATE TABLE "ad_campaign" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"meta_id" text NOT NULL,
	"name" text NOT NULL,
	"objective" text,
	"status" text,
	"job_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"deleted_batch" uuid
);
--> statement-breakpoint
CREATE TABLE "ad_insight_daily" (
	"id" uuid PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"level" text NOT NULL,
	"object_id" uuid NOT NULL,
	"spend_minor" bigint DEFAULT 0 NOT NULL,
	"impressions" bigint DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"leads" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_set" (
	"id" uuid PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"meta_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"deleted_batch" uuid
);
--> statement-breakpoint
CREATE TABLE "lead_form_mapping" (
	"id" uuid PRIMARY KEY NOT NULL,
	"meta_form_id" text NOT NULL,
	"name" text NOT NULL,
	"pipeline_id" uuid,
	"stage_id" uuid,
	"owner_id" uuid,
	"default_services" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"deleted_batch" uuid
);
--> statement-breakpoint
ALTER TABLE "ad" ADD CONSTRAINT "ad_ad_set_id_ad_set_id_fk" FOREIGN KEY ("ad_set_id") REFERENCES "public"."ad_set"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad" ADD CONSTRAINT "ad_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad" ADD CONSTRAINT "ad_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad" ADD CONSTRAINT "ad_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_account" ADD CONSTRAINT "ad_account_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_account" ADD CONSTRAINT "ad_account_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_account" ADD CONSTRAINT "ad_account_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_campaign" ADD CONSTRAINT "ad_campaign_account_id_ad_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ad_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_campaign" ADD CONSTRAINT "ad_campaign_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_campaign" ADD CONSTRAINT "ad_campaign_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_campaign" ADD CONSTRAINT "ad_campaign_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_set" ADD CONSTRAINT "ad_set_campaign_id_ad_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."ad_campaign"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_set" ADD CONSTRAINT "ad_set_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_set" ADD CONSTRAINT "ad_set_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_set" ADD CONSTRAINT "ad_set_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_form_mapping" ADD CONSTRAINT "lead_form_mapping_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_form_mapping" ADD CONSTRAINT "lead_form_mapping_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_form_mapping" ADD CONSTRAINT "lead_form_mapping_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_form_mapping" ADD CONSTRAINT "lead_form_mapping_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ad_meta_uq" ON "ad" USING btree ("meta_id");--> statement-breakpoint
CREATE INDEX "ad_ad_set_idx" ON "ad" USING btree ("ad_set_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ad_account_meta_uq" ON "ad_account" USING btree ("meta_id");--> statement-breakpoint
CREATE INDEX "ad_account_company_idx" ON "ad_account" USING btree ("company_id") WHERE "ad_account"."company_id" is not null;--> statement-breakpoint
CREATE INDEX "ad_account_name_trgm_idx" ON "ad_account" USING gin (lower(f_unaccent("name")) gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "ad_campaign_meta_uq" ON "ad_campaign" USING btree ("meta_id");--> statement-breakpoint
CREATE INDEX "ad_campaign_account_idx" ON "ad_campaign" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "ad_campaign_job_idx" ON "ad_campaign" USING btree ("job_id") WHERE "ad_campaign"."job_id" is not null;--> statement-breakpoint
CREATE INDEX "ad_campaign_name_trgm_idx" ON "ad_campaign" USING gin (lower(f_unaccent("name")) gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "ad_insight_daily_uq" ON "ad_insight_daily" USING btree ("level","object_id","date");--> statement-breakpoint
CREATE INDEX "ad_insight_daily_date_idx" ON "ad_insight_daily" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "ad_set_meta_uq" ON "ad_set" USING btree ("meta_id");--> statement-breakpoint
CREATE INDEX "ad_set_campaign_idx" ON "ad_set" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_form_mapping_form_uq" ON "lead_form_mapping" USING btree ("meta_form_id") WHERE "lead_form_mapping"."deleted_at" is null;