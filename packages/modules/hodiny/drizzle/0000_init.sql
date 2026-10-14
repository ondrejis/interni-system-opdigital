CREATE TABLE "time_entry" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"task_id" uuid,
	"date" date NOT NULL,
	"minutes" integer NOT NULL,
	"note" text,
	"is_private" boolean DEFAULT false NOT NULL,
	"visibility_source" text DEFAULT 'own' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"deleted_batch" uuid,
	CONSTRAINT "time_entry_minutes_chk" CHECK ("time_entry"."minutes" > 0)
);
--> statement-breakpoint
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "time_entry_user_date_idx" ON "time_entry" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "time_entry_job_idx" ON "time_entry" USING btree ("job_id","date");--> statement-breakpoint
CREATE INDEX "time_entry_task_idx" ON "time_entry" USING btree ("task_id") WHERE "time_entry"."task_id" is not null;--> statement-breakpoint
CREATE INDEX "time_entry_private_idx" ON "time_entry" USING btree ("is_private") WHERE "time_entry"."is_private";