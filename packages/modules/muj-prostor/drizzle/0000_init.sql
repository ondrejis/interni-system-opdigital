CREATE TABLE "email_library_item" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"category" text,
	"subject" text DEFAULT '' NOT NULL,
	"body_json" jsonb,
	"body_text" text DEFAULT '' NOT NULL,
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
CREATE TABLE "recurring_invoice" (
	"id" uuid PRIMARY KEY NOT NULL,
	"recurring_service_id" uuid NOT NULL,
	"period_from" date NOT NULL,
	"period_to" date NOT NULL,
	"amount_minor" bigint NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"fakturoid_id" text,
	"fakturoid_number" text,
	"fakturoid_url" text,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"deleted_batch" uuid
);
--> statement-breakpoint
CREATE TABLE "recurring_service" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"job_id" uuid,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"web" text,
	"price_minor" bigint,
	"period" text DEFAULT 'yearly' NOT NULL,
	"since" date,
	"next_renewal" date,
	"status" text DEFAULT 'active' NOT NULL,
	"runs_at" text,
	"auto_prepare_invoice" boolean DEFAULT false NOT NULL,
	"invoice_lead_days" integer DEFAULT 14 NOT NULL,
	"fakturoid_subject_id" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"deleted_batch" uuid
);
--> statement-breakpoint
CREATE TABLE "web_domain" (
	"id" uuid PRIMARY KEY NOT NULL,
	"domain" text NOT NULL,
	"company_id" uuid,
	"registrar" text,
	"expires_on" date,
	"payer" text DEFAULT 'client' NOT NULL,
	"auto_renew" boolean DEFAULT false NOT NULL,
	"renewal_price_minor" bigint,
	"dns" text,
	"recurring_service_id" uuid,
	"warn_days" integer DEFAULT 30 NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"deleted_batch" uuid
);
--> statement-breakpoint
ALTER TABLE "email_library_item" ADD CONSTRAINT "email_library_item_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_library_item" ADD CONSTRAINT "email_library_item_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_library_item" ADD CONSTRAINT "email_library_item_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_invoice" ADD CONSTRAINT "recurring_invoice_recurring_service_id_recurring_service_id_fk" FOREIGN KEY ("recurring_service_id") REFERENCES "public"."recurring_service"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_invoice" ADD CONSTRAINT "recurring_invoice_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_invoice" ADD CONSTRAINT "recurring_invoice_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_invoice" ADD CONSTRAINT "recurring_invoice_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_invoice" ADD CONSTRAINT "recurring_invoice_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_service" ADD CONSTRAINT "recurring_service_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_service" ADD CONSTRAINT "recurring_service_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_service" ADD CONSTRAINT "recurring_service_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_domain" ADD CONSTRAINT "web_domain_recurring_service_id_recurring_service_id_fk" FOREIGN KEY ("recurring_service_id") REFERENCES "public"."recurring_service"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_domain" ADD CONSTRAINT "web_domain_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_domain" ADD CONSTRAINT "web_domain_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_domain" ADD CONSTRAINT "web_domain_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_library_item_title_trgm_idx" ON "email_library_item" USING gin (lower(f_unaccent("title")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "email_library_item_body_trgm_idx" ON "email_library_item" USING gin (lower(f_unaccent("body_text")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "email_library_item_category_idx" ON "email_library_item" USING btree ("category");--> statement-breakpoint
CREATE INDEX "email_library_item_tags_idx" ON "email_library_item" USING gin ("tags");--> statement-breakpoint
CREATE UNIQUE INDEX "recurring_invoice_period_uq" ON "recurring_invoice" USING btree ("recurring_service_id","period_from") WHERE "recurring_invoice"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "recurring_invoice_status_idx" ON "recurring_invoice" USING btree ("status");--> statement-breakpoint
CREATE INDEX "recurring_service_company_idx" ON "recurring_service" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "recurring_service_renewal_idx" ON "recurring_service" USING btree ("next_renewal") WHERE "recurring_service"."status" = 'active';--> statement-breakpoint
CREATE INDEX "recurring_service_name_trgm_idx" ON "recurring_service" USING gin (lower(f_unaccent("name")) gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "web_domain_domain_uq" ON "web_domain" USING btree (lower("domain")) WHERE "web_domain"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "web_domain_expires_idx" ON "web_domain" USING btree ("expires_on");--> statement-breakpoint
CREATE INDEX "web_domain_company_idx" ON "web_domain" USING btree ("company_id") WHERE "web_domain"."company_id" is not null;--> statement-breakpoint
CREATE INDEX "web_domain_domain_trgm_idx" ON "web_domain" USING gin (lower(f_unaccent("domain")) gin_trgm_ops);