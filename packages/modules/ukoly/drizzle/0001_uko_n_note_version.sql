ALTER TABLE "note" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_version_chk" CHECK ("note"."version" >= 1);