CREATE TABLE "email_template" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"language" text DEFAULT 'cs' NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"body_json" jsonb,
	"body_text" text DEFAULT '' NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"is_private" boolean DEFAULT false NOT NULL,
	"visibility_source" text DEFAULT 'own' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"deleted_batch" uuid
);
--> statement-breakpoint
ALTER TABLE "email_template" ADD CONSTRAINT "email_template_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_template" ADD CONSTRAINT "email_template_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_template" ADD CONSTRAINT "email_template_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_template_name_trgm_idx" ON "email_template" USING gin (lower(f_unaccent("name")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "email_template_subject_trgm_idx" ON "email_template" USING gin (lower(f_unaccent("subject")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "email_template_category_idx" ON "email_template" USING btree ("category");--> statement-breakpoint
CREATE INDEX "email_template_usage_idx" ON "email_template" USING btree ("usage_count");--> statement-breakpoint
CREATE INDEX "email_template_tags_idx" ON "email_template" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "email_template_private_idx" ON "email_template" USING btree ("is_private") WHERE "email_template"."is_private";