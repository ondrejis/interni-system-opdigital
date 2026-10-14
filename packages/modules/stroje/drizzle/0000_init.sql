CREATE TABLE "asset" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'van' NOT NULL,
	"plate" text,
	"vin" text,
	"brand" text,
	"model" text,
	"year" integer,
	"fuel" text DEFAULT 'diesel' NOT NULL,
	"meter" text DEFAULT 'km' NOT NULL,
	"meter_value" numeric(12, 1) DEFAULT '0' NOT NULL,
	"tank_liters" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"responsible_id" uuid,
	"purchase_date" date,
	"purchase_price_minor" bigint,
	"internal_rate_minor" bigint,
	"stk_date" date,
	"insurance_date" date,
	"vignette_date" date,
	"fuel_card" text,
	"note" text,
	"custom" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "asset_defect" (
	"id" uuid PRIMARY KEY NOT NULL,
	"asset_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"severity" text DEFAULT 'normal' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"reported_by" uuid,
	"task_id" uuid,
	"resolution" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "asset_fuel" (
	"id" uuid PRIMARY KEY NOT NULL,
	"asset_id" uuid NOT NULL,
	"date" date NOT NULL,
	"user_id" uuid,
	"liters" numeric(10, 2) NOT NULL,
	"total_minor" bigint NOT NULL,
	"vat_rate" numeric(5, 2) DEFAULT '21' NOT NULL,
	"meter_value" numeric(12, 1),
	"full_tank" boolean DEFAULT true NOT NULL,
	"station" text,
	"payment" text DEFAULT 'card' NOT NULL,
	"job_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "asset_interval" (
	"id" uuid PRIMARY KEY NOT NULL,
	"asset_id" uuid NOT NULL,
	"title" text NOT NULL,
	"every_meter" integer,
	"every_months" integer,
	"last_date" date,
	"last_meter" numeric(12, 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "asset_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"asset_id" uuid NOT NULL,
	"date" date NOT NULL,
	"user_id" uuid,
	"meter_start" numeric(12, 1),
	"meter_end" numeric(12, 1),
	"amount" numeric(12, 1) NOT NULL,
	"route" text,
	"purpose" text,
	"job_id" uuid,
	"private" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "asset_reservation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"asset_id" uuid NOT NULL,
	"date_from" date NOT NULL,
	"date_to" date NOT NULL,
	"job_id" uuid,
	"user_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "asset_service" (
	"id" uuid PRIMARY KEY NOT NULL,
	"asset_id" uuid NOT NULL,
	"date" date NOT NULL,
	"kind" text DEFAULT 'service' NOT NULL,
	"title" text NOT NULL,
	"vendor" text,
	"cost_minor" bigint DEFAULT 0 NOT NULL,
	"meter_value" numeric(12, 1),
	"interval_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_responsible_id_user_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_defect" ADD CONSTRAINT "asset_defect_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_defect" ADD CONSTRAINT "asset_defect_reported_by_user_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_defect" ADD CONSTRAINT "asset_defect_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_defect" ADD CONSTRAINT "asset_defect_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_defect" ADD CONSTRAINT "asset_defect_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_fuel" ADD CONSTRAINT "asset_fuel_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_fuel" ADD CONSTRAINT "asset_fuel_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_fuel" ADD CONSTRAINT "asset_fuel_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_fuel" ADD CONSTRAINT "asset_fuel_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_interval" ADD CONSTRAINT "asset_interval_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_interval" ADD CONSTRAINT "asset_interval_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_interval" ADD CONSTRAINT "asset_interval_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_log" ADD CONSTRAINT "asset_log_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_log" ADD CONSTRAINT "asset_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_log" ADD CONSTRAINT "asset_log_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_log" ADD CONSTRAINT "asset_log_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_reservation" ADD CONSTRAINT "asset_reservation_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_reservation" ADD CONSTRAINT "asset_reservation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_reservation" ADD CONSTRAINT "asset_reservation_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_reservation" ADD CONSTRAINT "asset_reservation_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_service" ADD CONSTRAINT "asset_service_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_service" ADD CONSTRAINT "asset_service_interval_id_asset_interval_id_fk" FOREIGN KEY ("interval_id") REFERENCES "public"."asset_interval"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_service" ADD CONSTRAINT "asset_service_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_service" ADD CONSTRAINT "asset_service_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_plate_uq" ON "asset" USING btree ("plate") WHERE "asset"."plate" is not null and "asset"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "asset_status_idx" ON "asset" USING btree ("status");--> statement-breakpoint
CREATE INDEX "asset_name_trgm_idx" ON "asset" USING gin (lower(f_unaccent("name")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "asset_custom_idx" ON "asset" USING gin ("custom");--> statement-breakpoint
CREATE INDEX "asset_defect_asset_idx" ON "asset_defect" USING btree ("asset_id","status");--> statement-breakpoint
CREATE INDEX "asset_defect_status_idx" ON "asset_defect" USING btree ("status");--> statement-breakpoint
CREATE INDEX "asset_fuel_asset_idx" ON "asset_fuel" USING btree ("asset_id","date");--> statement-breakpoint
CREATE INDEX "asset_fuel_job_idx" ON "asset_fuel" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "asset_interval_asset_idx" ON "asset_interval" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "asset_log_asset_idx" ON "asset_log" USING btree ("asset_id","date");--> statement-breakpoint
CREATE INDEX "asset_log_job_idx" ON "asset_log" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "asset_log_user_idx" ON "asset_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "asset_reservation_asset_idx" ON "asset_reservation" USING btree ("asset_id","date_from");--> statement-breakpoint
CREATE INDEX "asset_reservation_job_idx" ON "asset_reservation" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "asset_service_asset_idx" ON "asset_service" USING btree ("asset_id","date");