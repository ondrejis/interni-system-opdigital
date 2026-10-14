CREATE TABLE "crm_activity" (
	"id" uuid PRIMARY KEY NOT NULL,
	"type_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"due_at" timestamp with time zone,
	"all_day" boolean DEFAULT false NOT NULL,
	"duration_min" integer,
	"priority" text DEFAULT 'normal' NOT NULL,
	"location" text,
	"note" text,
	"outcome" text,
	"done_at" timestamp with time zone,
	"done_by" uuid,
	"assignee_id" uuid,
	"job_id" uuid,
	"company_id" uuid,
	"person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "crm_activity_type" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"icon" text DEFAULT 'circle' NOT NULL,
	"default_duration_min" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "crm_follower" (
	"job_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_follower_job_id_user_id_pk" PRIMARY KEY("job_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "crm_note" (
	"id" uuid PRIMARY KEY NOT NULL,
	"body" text NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"author_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "crm_activity" ADD CONSTRAINT "crm_activity_type_id_crm_activity_type_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."crm_activity_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activity" ADD CONSTRAINT "crm_activity_done_by_user_id_fk" FOREIGN KEY ("done_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activity" ADD CONSTRAINT "crm_activity_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activity" ADD CONSTRAINT "crm_activity_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activity" ADD CONSTRAINT "crm_activity_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activity_type" ADD CONSTRAINT "crm_activity_type_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activity_type" ADD CONSTRAINT "crm_activity_type_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_follower" ADD CONSTRAINT "crm_follower_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_follower" ADD CONSTRAINT "crm_follower_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_note" ADD CONSTRAINT "crm_note_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_note" ADD CONSTRAINT "crm_note_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_note" ADD CONSTRAINT "crm_note_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_activity_job_idx" ON "crm_activity" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "crm_activity_company_idx" ON "crm_activity" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "crm_activity_person_idx" ON "crm_activity" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "crm_activity_assignee_due_idx" ON "crm_activity" USING btree ("assignee_id","due_at");--> statement-breakpoint
CREATE INDEX "crm_activity_due_idx" ON "crm_activity" USING btree ("due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_activity_type_key_uq" ON "crm_activity_type" USING btree ("key") WHERE "crm_activity_type"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "crm_follower_user_idx" ON "crm_follower" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "crm_note_entity_idx" ON "crm_note" USING btree ("entity_type","entity_id");