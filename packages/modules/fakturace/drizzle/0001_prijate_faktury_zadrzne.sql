CREATE TABLE "received_invoice" (
	"id" uuid PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"job_id" uuid,
	"supplier_id" uuid,
	"supplier" jsonb,
	"variable_symbol" text,
	"constant_symbol" text,
	"order_id" uuid,
	"issue_date" date,
	"taxable_date" date,
	"due_date" date,
	"received_date" date,
	"currency" text DEFAULT 'CZK' NOT NULL,
	"net_minor" bigint DEFAULT 0 NOT NULL,
	"vat_minor" bigint DEFAULT 0 NOT NULL,
	"gross_minor" bigint DEFAULT 0 NOT NULL,
	"paid_minor" bigint DEFAULT 0 NOT NULL,
	"paid_date" date,
	"state" text DEFAULT 'draft' NOT NULL,
	"vat_mode" text DEFAULT 'standard' NOT NULL,
	"file_id" uuid,
	"note" text,
	"locked_at" timestamp with time zone,
	"custom" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "received_invoice_line" (
	"id" uuid PRIMARY KEY NOT NULL,
	"invoice_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"description" text NOT NULL,
	"section_id" uuid,
	"item_id" uuid,
	"category" text DEFAULT 'other' NOT NULL,
	"net_minor" bigint DEFAULT 0 NOT NULL,
	"vat_rate_bp" integer DEFAULT 2100 NOT NULL,
	"vat_minor" bigint DEFAULT 0 NOT NULL,
	"gross_minor" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "vat_mode" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "retention_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "statement_id" uuid;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoice_line" ADD COLUMN "budget_item_id" uuid;--> statement-breakpoint
ALTER TABLE "received_invoice" ADD CONSTRAINT "received_invoice_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "received_invoice" ADD CONSTRAINT "received_invoice_supplier_id_company_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "received_invoice" ADD CONSTRAINT "received_invoice_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "received_invoice" ADD CONSTRAINT "received_invoice_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "received_invoice_line" ADD CONSTRAINT "received_invoice_line_invoice_id_received_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."received_invoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "received_invoice_job_idx" ON "received_invoice" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "received_invoice_supplier_idx" ON "received_invoice" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "received_invoice_state_idx" ON "received_invoice" USING btree ("state");--> statement-breakpoint
CREATE INDEX "received_invoice_line_invoice_idx" ON "received_invoice_line" USING btree ("invoice_id","position");