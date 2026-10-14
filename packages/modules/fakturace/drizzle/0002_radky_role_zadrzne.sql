ALTER TABLE "invoice_line" ADD COLUMN "role" text DEFAULT 'work' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_line" ADD COLUMN "ref_invoice_id" uuid;--> statement-breakpoint
CREATE INDEX "invoice_line_ref_idx" ON "invoice_line" USING btree ("ref_invoice_id");