ALTER TABLE "site_diary" ADD COLUMN "weather_data" jsonb;--> statement-breakpoint
ALTER TABLE "site_diary" ADD COLUMN "workers" jsonb;--> statement-breakpoint
ALTER TABLE "site_diary" ADD COLUMN "material_rows" jsonb;--> statement-breakpoint
ALTER TABLE "site_diary" ADD COLUMN "machine_rows" jsonb;--> statement-breakpoint
ALTER TABLE "site_diary" ADD COLUMN "incidents" jsonb;--> statement-breakpoint
ALTER TABLE "site_diary" ADD COLUMN "photo_ids" jsonb;--> statement-breakpoint
ALTER TABLE "site_diary" ADD COLUMN "for_investor" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "site_diary" ADD COLUMN "signed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "site_diary" ADD COLUMN "signed_by_id" uuid;--> statement-breakpoint
ALTER TABLE "site_diary" ADD COLUMN "signed_name" text;--> statement-breakpoint
ALTER TABLE "site_diary" ADD COLUMN "signature_file_id" uuid;--> statement-breakpoint
ALTER TABLE "site_diary" ADD CONSTRAINT "site_diary_signed_by_id_user_id_fk" FOREIGN KEY ("signed_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;