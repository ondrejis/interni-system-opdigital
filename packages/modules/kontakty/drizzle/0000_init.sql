CREATE TABLE "company" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"ico" text,
	"dic" text,
	"street" text,
	"city" text,
	"zip" text,
	"email" text,
	"phone" text,
	"web" text,
	"note" text,
	"roles" text[] DEFAULT '{client}'::text[] NOT NULL,
	"owner_id" uuid,
	"ares_checked_at" timestamp with time zone,
	"custom" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "person" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"position" text,
	"company_id" uuid,
	"note" text,
	"owner_id" uuid,
	"custom" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_ico_uq" ON "company" USING btree ("ico") WHERE "company"."ico" is not null and "company"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "company_name_trgm_idx" ON "company" USING gin (lower(f_unaccent("name")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "company_owner_idx" ON "company" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "company_custom_idx" ON "company" USING gin ("custom");--> statement-breakpoint
CREATE INDEX "person_name_trgm_idx" ON "person" USING gin (lower(f_unaccent("name")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "person_company_idx" ON "person" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "person_owner_idx" ON "person" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "person_custom_idx" ON "person" USING gin ("custom");