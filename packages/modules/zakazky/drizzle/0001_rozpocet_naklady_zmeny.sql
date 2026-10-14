CREATE TABLE "job_change" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"amount_minor" bigint NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"decided_at" date,
	"decided_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "job_cost" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"date" date NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"supplier_id" uuid,
	"supplier_name" text,
	"amount_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "job_estimate_line" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(14, 3) DEFAULT '1' NOT NULL,
	"unit" text DEFAULT 'ks' NOT NULL,
	"unit_price_minor" bigint DEFAULT 0 NOT NULL,
	"unit_cost_minor" bigint DEFAULT 0 NOT NULL,
	"vat_rate" numeric(5, 2) DEFAULT '21' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "job_change" ADD CONSTRAINT "job_change_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_change" ADD CONSTRAINT "job_change_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_change" ADD CONSTRAINT "job_change_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_cost" ADD CONSTRAINT "job_cost_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_cost" ADD CONSTRAINT "job_cost_supplier_id_company_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_cost" ADD CONSTRAINT "job_cost_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_cost" ADD CONSTRAINT "job_cost_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_estimate_line" ADD CONSTRAINT "job_estimate_line_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_estimate_line" ADD CONSTRAINT "job_estimate_line_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_estimate_line" ADD CONSTRAINT "job_estimate_line_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_change_number_uq" ON "job_change" USING btree ("job_id","number");--> statement-breakpoint
CREATE INDEX "job_cost_job_idx" ON "job_cost" USING btree ("job_id","date");--> statement-breakpoint
CREATE INDEX "job_estimate_line_job_idx" ON "job_estimate_line" USING btree ("job_id","position");