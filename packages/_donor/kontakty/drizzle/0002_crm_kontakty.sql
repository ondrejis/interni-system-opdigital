CREATE TABLE "person_contact_point" (
	"id" uuid PRIMARY KEY NOT NULL,
	"person_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"value" text NOT NULL,
	"label" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "company" ADD COLUMN "type" text;--> statement-breakpoint
ALTER TABLE "company" ADD COLUMN "parent_company_id" uuid;--> statement-breakpoint
ALTER TABLE "company" ADD COLUMN "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "role" text;--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "email_type" text;--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "phone_type" text;--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "person_contact_point" ADD CONSTRAINT "person_contact_point_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_contact_point" ADD CONSTRAINT "person_contact_point_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_contact_point" ADD CONSTRAINT "person_contact_point_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "person_contact_point_person_idx" ON "person_contact_point" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "person_contact_point_value_idx" ON "person_contact_point" USING btree ("kind","value");--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_parent_company_id_company_id_fk" FOREIGN KEY ("parent_company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_parent_idx" ON "company" USING btree ("parent_company_id");