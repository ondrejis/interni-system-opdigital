ALTER TABLE "drive_request" ADD COLUMN "client_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "drive_request" ADD COLUMN "event_id" uuid;--> statement-breakpoint
ALTER TABLE "drive_request" ADD COLUMN "blocked_by" uuid;--> statement-breakpoint
ALTER TABLE "drive_request" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "drive_request" ADD COLUMN "is_private" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "drive_request_client_open_idx" ON "drive_request" USING btree ("client_id","requested_at") WHERE "drive_request"."state" in ('pending', 'sent');--> statement-breakpoint
CREATE UNIQUE INDEX "drive_request_event_uq" ON "drive_request" USING btree ("event_id") WHERE "drive_request"."event_id" is not null;--> statement-breakpoint
CREATE INDEX "drive_request_blocked_idx" ON "drive_request" USING btree ("blocked_by") WHERE "drive_request"."blocked_by" is not null;