CREATE TABLE "deal" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"company_id" uuid,
	"person_id" uuid,
	"stage_id" uuid NOT NULL,
	"stage_entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"result" text DEFAULT 'open' NOT NULL,
	"value_minor" bigint,
	"weighted_minor" bigint,
	"services" text[] DEFAULT '{}'::text[] NOT NULL,
	"expected_close_date" date,
	"owner_id" uuid,
	"source" text DEFAULT 'manual' NOT NULL,
	"source_detail" text,
	"meta_campaign_id" text,
	"meta_adset_id" text,
	"meta_ad_id" text,
	"meta_leadgen_id" text,
	"won_at" timestamp with time zone,
	"lost_at" timestamp with time zone,
	"lost_reason" text,
	"lost_note" text,
	"first_opened_at" timestamp with time zone,
	"opened_by" uuid,
	"next_activity_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone,
	"next_task_id" uuid,
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
CREATE TABLE "deal_participant" (
	"id" uuid PRIMARY KEY NOT NULL,
	"deal_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"deleted_batch" uuid
);
--> statement-breakpoint
CREATE TABLE "deal_stage_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"deal_id" uuid NOT NULL,
	"from_stage_id" uuid,
	"to_stage_id" uuid NOT NULL,
	"entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"duration_sec" integer,
	"by_user_id" uuid
);
--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_stage_id_pipeline_stage_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."pipeline_stage"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_opened_by_user_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_participant" ADD CONSTRAINT "deal_participant_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_participant" ADD CONSTRAINT "deal_participant_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_participant" ADD CONSTRAINT "deal_participant_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_participant" ADD CONSTRAINT "deal_participant_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_stage_history" ADD CONSTRAINT "deal_stage_history_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_stage_history" ADD CONSTRAINT "deal_stage_history_from_stage_id_pipeline_stage_id_fk" FOREIGN KEY ("from_stage_id") REFERENCES "public"."pipeline_stage"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_stage_history" ADD CONSTRAINT "deal_stage_history_to_stage_id_pipeline_stage_id_fk" FOREIGN KEY ("to_stage_id") REFERENCES "public"."pipeline_stage"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_stage_history" ADD CONSTRAINT "deal_stage_history_by_user_id_user_id_fk" FOREIGN KEY ("by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deal_meta_leadgen_uq" ON "deal" USING btree ("meta_leadgen_id") WHERE "deal"."meta_leadgen_id" is not null;--> statement-breakpoint
CREATE INDEX "deal_stage_idx" ON "deal" USING btree ("stage_id","result");--> statement-breakpoint
CREATE INDEX "deal_company_idx" ON "deal" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "deal_person_idx" ON "deal" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "deal_owner_idx" ON "deal" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "deal_open_close_idx" ON "deal" USING btree ("expected_close_date") WHERE "deal"."result" = 'open';--> statement-breakpoint
CREATE INDEX "deal_next_activity_idx" ON "deal" USING btree ("next_activity_at") WHERE "deal"."result" = 'open';--> statement-breakpoint
CREATE INDEX "deal_unopened_idx" ON "deal" USING btree ("created_at") WHERE "deal"."first_opened_at" is null and "deal"."source" = 'meta';--> statement-breakpoint
CREATE INDEX "deal_title_trgm_idx" ON "deal" USING gin (lower(f_unaccent("title")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "deal_services_idx" ON "deal" USING gin ("services");--> statement-breakpoint
CREATE INDEX "deal_tags_idx" ON "deal" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "deal_custom_idx" ON "deal" USING gin ("custom");--> statement-breakpoint
CREATE INDEX "deal_private_idx" ON "deal" USING btree ("is_private") WHERE "deal"."is_private";--> statement-breakpoint
CREATE UNIQUE INDEX "deal_participant_uq" ON "deal_participant" USING btree ("deal_id","person_id") WHERE "deal_participant"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "deal_participant_person_idx" ON "deal_participant" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "deal_stage_history_deal_idx" ON "deal_stage_history" USING btree ("deal_id","entered_at");--> statement-breakpoint
CREATE INDEX "deal_stage_history_stage_idx" ON "deal_stage_history" USING btree ("to_stage_id");