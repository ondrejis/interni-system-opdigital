CREATE TABLE "invoice" (
	"id" uuid PRIMARY KEY NOT NULL,
	"number" text,
	"title" text DEFAULT '' NOT NULL,
	"kind" text NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"job_id" uuid,
	"company_id" uuid NOT NULL,
	"person_id" uuid,
	"issue_date" date,
	"taxable_date" date,
	"due_date" date,
	"currency" text DEFAULT 'CZK' NOT NULL,
	"variable_symbol" text,
	"note" text,
	"net_minor" bigint DEFAULT 0 NOT NULL,
	"vat_minor" bigint DEFAULT 0 NOT NULL,
	"gross_minor" bigint DEFAULT 0 NOT NULL,
	"paid_minor" bigint DEFAULT 0 NOT NULL,
	"overdue" boolean DEFAULT false NOT NULL,
	"original_invoice_id" uuid,
	"supplier" jsonb,
	"customer" jsonb,
	"issued_at" date,
	"custom" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "invoice_line" (
	"id" uuid PRIMARY KEY NOT NULL,
	"invoice_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(14, 3) DEFAULT '1' NOT NULL,
	"unit" text DEFAULT 'ks' NOT NULL,
	"unit_price_minor" bigint DEFAULT 0 NOT NULL,
	"vat_rate_bp" integer DEFAULT 2100 NOT NULL,
	"net_minor" bigint DEFAULT 0 NOT NULL,
	"vat_minor" bigint DEFAULT 0 NOT NULL,
	"gross_minor" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"invoice_id" uuid NOT NULL,
	"date" date NOT NULL,
	"amount_minor" bigint NOT NULL,
	"method" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_original_invoice_id_invoice_id_fk" FOREIGN KEY ("original_invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line" ADD CONSTRAINT "invoice_line_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_number_uq" ON "invoice" USING btree ("number") WHERE "invoice"."number" is not null;--> statement-breakpoint
CREATE INDEX "invoice_job_idx" ON "invoice" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "invoice_company_idx" ON "invoice" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "invoice_state_idx" ON "invoice" USING btree ("state");--> statement-breakpoint
CREATE INDEX "invoice_due_idx" ON "invoice" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "invoice_custom_idx" ON "invoice" USING gin ("custom");--> statement-breakpoint
CREATE INDEX "invoice_line_invoice_idx" ON "invoice_line" USING btree ("invoice_id","position");--> statement-breakpoint
CREATE INDEX "payment_invoice_idx" ON "payment" USING btree ("invoice_id","date");