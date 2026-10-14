CREATE TABLE "ares_cache" (
	"ico" text PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"official_name" text,
	"ico" text,
	"dic" text,
	"legal_form" text,
	"street" text,
	"city" text,
	"zip" text,
	"country" text DEFAULT 'CZ' NOT NULL,
	"web" text,
	"web_domain" text,
	"email" text,
	"phone" text,
	"industry" text,
	"owner_id" uuid,
	"client_status" text,
	"client_since" date,
	"client_until" date,
	"client_end_reason" text,
	"services" text[] DEFAULT '{}'::text[] NOT NULL,
	"client_context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"drive_folder_id" text,
	"drive_status" text DEFAULT 'none' NOT NULL,
	"ares_synced_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone,
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
CREATE TABLE "person" (
	"id" uuid PRIMARY KEY NOT NULL,
	"first_name" text,
	"last_name" text NOT NULL,
	"full_name" text GENERATED ALWAYS AS (btrim(coalesce(first_name, '') || ' ' || last_name)) STORED,
	"position" text,
	"primary_company_id" uuid,
	"linkedin" text,
	"is_decision_maker" boolean DEFAULT false NOT NULL,
	"owner_id" uuid,
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
	CONSTRAINT "person_last_name_chk" CHECK (btrim("person"."last_name") <> '')
);
--> statement-breakpoint
CREATE TABLE "person_company" (
	"id" uuid PRIMARY KEY NOT NULL,
	"person_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"role" text,
	"position" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"deleted_batch" uuid
);
--> statement-breakpoint
CREATE TABLE "person_contact_point" (
	"id" uuid PRIMARY KEY NOT NULL,
	"person_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"value" text NOT NULL,
	"value_norm" text NOT NULL,
	"label" text,
	"is_primary" boolean DEFAULT false NOT NULL,
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
ALTER TABLE "company" ADD CONSTRAINT "company_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_primary_company_id_company_id_fk" FOREIGN KEY ("primary_company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_company" ADD CONSTRAINT "person_company_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_company" ADD CONSTRAINT "person_company_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_company" ADD CONSTRAINT "person_company_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_company" ADD CONSTRAINT "person_company_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_company" ADD CONSTRAINT "person_company_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_contact_point" ADD CONSTRAINT "person_contact_point_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_contact_point" ADD CONSTRAINT "person_contact_point_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_contact_point" ADD CONSTRAINT "person_contact_point_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_contact_point" ADD CONSTRAINT "person_contact_point_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_ico_uq" ON "company" USING btree ("ico") WHERE "company"."ico" is not null and "company"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "company_name_trgm_idx" ON "company" USING gin (lower(f_unaccent("name")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "company_official_name_trgm_idx" ON "company" USING gin (lower(f_unaccent("official_name")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "company_ico_trgm_idx" ON "company" USING gin (lower(f_unaccent("ico")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "company_city_trgm_idx" ON "company" USING gin (lower(f_unaccent("city")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "company_email_trgm_idx" ON "company" USING gin (lower(f_unaccent("email")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "company_phone_trgm_idx" ON "company" USING gin (lower(f_unaccent("phone")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "company_web_domain_trgm_idx" ON "company" USING gin (lower(f_unaccent("web_domain")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "company_web_domain_idx" ON "company" USING btree ("web_domain") WHERE "company"."web_domain" is not null;--> statement-breakpoint
CREATE INDEX "company_owner_idx" ON "company" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "company_client_status_idx" ON "company" USING btree ("client_status") WHERE "company"."client_status" is not null;--> statement-breakpoint
CREATE INDEX "company_services_idx" ON "company" USING gin ("services");--> statement-breakpoint
CREATE INDEX "company_tags_idx" ON "company" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "company_custom_idx" ON "company" USING gin ("custom");--> statement-breakpoint
CREATE INDEX "company_private_idx" ON "company" USING btree ("is_private") WHERE "company"."is_private";--> statement-breakpoint
CREATE INDEX "person_full_name_trgm_idx" ON "person" USING gin (lower(f_unaccent("full_name")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "person_position_trgm_idx" ON "person" USING gin (lower(f_unaccent("position")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "person_primary_company_idx" ON "person" USING btree ("primary_company_id");--> statement-breakpoint
CREATE INDEX "person_owner_idx" ON "person" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "person_decision_idx" ON "person" USING btree ("primary_company_id") WHERE "person"."is_decision_maker";--> statement-breakpoint
CREATE INDEX "person_tags_idx" ON "person" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "person_custom_idx" ON "person" USING gin ("custom");--> statement-breakpoint
CREATE INDEX "person_private_idx" ON "person" USING btree ("is_private") WHERE "person"."is_private";--> statement-breakpoint
CREATE UNIQUE INDEX "person_company_uq" ON "person_company" USING btree ("person_id","company_id") WHERE "person_company"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "person_company_company_idx" ON "person_company" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "person_contact_point_person_idx" ON "person_contact_point" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "person_contact_point_norm_idx" ON "person_contact_point" USING btree ("kind","value_norm");--> statement-breakpoint
CREATE INDEX "person_contact_point_norm_trgm_idx" ON "person_contact_point" USING gin (lower(f_unaccent("value_norm")) gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "person_contact_point_value_uq" ON "person_contact_point" USING btree ("person_id","kind","value_norm") WHERE "person_contact_point"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "person_contact_point_primary_uq" ON "person_contact_point" USING btree ("person_id","kind") WHERE "person_contact_point"."is_primary" and "person_contact_point"."deleted_at" is null;