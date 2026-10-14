ALTER TABLE "job_cost" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "job_cost" ADD COLUMN "source_ref" text;--> statement-breakpoint
CREATE INDEX "job_cost_source_idx" ON "job_cost" USING btree ("source","source_ref");