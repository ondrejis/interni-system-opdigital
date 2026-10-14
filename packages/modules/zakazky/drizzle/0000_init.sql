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
ALTER TABLE "job" ADD CONSTRAINT "job_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_stage_id_pipeline_stage_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."pipeline_stage"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_manager_id_user_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_member" ADD CONSTRAINT "job_member_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_member" ADD CONSTRAINT "job_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_number_uq" ON "job" USING btree ("number");--> statement-breakpoint
CREATE INDEX "job_company_idx" ON "job" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "job_stage_idx" ON "job" USING btree ("stage_id");--> statement-breakpoint
CREATE INDEX "job_manager_idx" ON "job" USING btree ("manager_id");--> statement-breakpoint
CREATE INDEX "job_title_trgm_idx" ON "job" USING gin (lower(f_unaccent("title")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "job_custom_idx" ON "job" USING gin ("custom");--> statement-breakpoint
CREATE INDEX "job_member_user_idx" ON "job_member" USING btree ("user_id");