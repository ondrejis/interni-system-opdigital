CREATE TABLE "invoice_dispatch" (
	"id" uuid PRIMARY KEY NOT NULL,
	"invoice_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"to_email" text NOT NULL,
	"cc" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subject" text NOT NULL,
	"email_log_id" uuid,
	"status" text DEFAULT 'queued' NOT NULL,
	"error" text,
	"sent_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "sent_on" date;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "reminder_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "last_reminder_on" date;--> statement-breakpoint
ALTER TABLE "invoice_dispatch" ADD CONSTRAINT "invoice_dispatch_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_dispatch_invoice_idx" ON "invoice_dispatch" USING btree ("invoice_id","created_at");--> statement-breakpoint
CREATE INDEX "invoice_dispatch_pending_idx" ON "invoice_dispatch" USING btree ("status") WHERE "invoice_dispatch"."status" = 'queued';