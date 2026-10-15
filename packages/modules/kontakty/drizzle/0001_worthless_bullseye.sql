ALTER TABLE "person" ADD COLUMN "primary_email" text;--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "primary_phone" text;--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "last_activity_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "person_primary_email_trgm_idx" ON "person" USING gin (lower(f_unaccent("primary_email")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "person_primary_phone_trgm_idx" ON "person" USING gin (lower(f_unaccent("primary_phone")) gin_trgm_ops);