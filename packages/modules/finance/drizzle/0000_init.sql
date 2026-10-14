CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_id" uuid,
	"company_id" uuid,
	"description" text NOT NULL,
	"kind" text DEFAULT 'one_off' NOT NULL,
	"period_month" text,
	"amount_minor" bigint NOT NULL,
	"issuer_id" uuid,
	"status" text DEFAULT 'planned' NOT NULL,
	"invoice_number" text,
	"invoice_url" text,
	"issued_on" date,
	"due_on" date,
	"paid_on" date,
	"allocation_mode" text DEFAULT 'rules' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"retainer_id" uuid,
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
	CONSTRAINT "payment_amount_chk" CHECK ("payment"."amount_minor" > 0),
	CONSTRAINT "payment_period_month_chk" CHECK ("payment"."period_month" is null or "payment"."period_month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
CREATE TABLE "payment_allocation" (
	"payment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"deleted_batch" uuid,
	CONSTRAINT "payment_allocation_payment_id_user_id_pk" PRIMARY KEY("payment_id","user_id"),
	CONSTRAINT "payment_allocation_amount_chk" CHECK ("payment_allocation"."amount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "retainer" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"from_month" text NOT NULL,
	"to_month" text,
	"issue_day" integer DEFAULT 1 NOT NULL,
	"issuer_mode" text DEFAULT 'fixed' NOT NULL,
	"issuer_id" uuid NOT NULL,
	"first_issuer_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"deleted_batch" uuid,
	CONSTRAINT "retainer_amount_chk" CHECK ("retainer"."amount_minor" > 0),
	CONSTRAINT "retainer_issue_day_chk" CHECK ("retainer"."issue_day" between 1 and 28),
	CONSTRAINT "retainer_from_month_chk" CHECK ("retainer"."from_month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
CREATE TABLE "settlement" (
	"id" uuid PRIMARY KEY NOT NULL,
	"from_user_id" uuid NOT NULL,
	"to_user_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"settled_on" date NOT NULL,
	"method" text NOT NULL,
	"reference" text,
	"note" text,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"deleted_batch" uuid,
	CONSTRAINT "settlement_amount_chk" CHECK ("settlement"."amount_minor" > 0),
	CONSTRAINT "settlement_users_chk" CHECK ("settlement"."from_user_id" <> "settlement"."to_user_id")
);
--> statement-breakpoint
CREATE TABLE "split_rule" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"percent" numeric(5, 2),
	"fixed_minor" bigint,
	"applies_to" text DEFAULT 'all' NOT NULL,
	"valid_from_month" text,
	"valid_to_month" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"deleted_batch" uuid,
	CONSTRAINT "split_rule_percent_chk" CHECK ("split_rule"."percent" is null or "split_rule"."percent" between 0 and 100),
	CONSTRAINT "split_rule_fixed_chk" CHECK ("split_rule"."fixed_minor" is null or "split_rule"."fixed_minor" >= 0)
);
--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_issuer_id_user_id_fk" FOREIGN KEY ("issuer_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_retainer_id_retainer_id_fk" FOREIGN KEY ("retainer_id") REFERENCES "public"."retainer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocation" ADD CONSTRAINT "payment_allocation_payment_id_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocation" ADD CONSTRAINT "payment_allocation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocation" ADD CONSTRAINT "payment_allocation_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocation" ADD CONSTRAINT "payment_allocation_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocation" ADD CONSTRAINT "payment_allocation_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retainer" ADD CONSTRAINT "retainer_issuer_id_user_id_fk" FOREIGN KEY ("issuer_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retainer" ADD CONSTRAINT "retainer_first_issuer_id_user_id_fk" FOREIGN KEY ("first_issuer_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retainer" ADD CONSTRAINT "retainer_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retainer" ADD CONSTRAINT "retainer_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retainer" ADD CONSTRAINT "retainer_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement" ADD CONSTRAINT "settlement_from_user_id_user_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement" ADD CONSTRAINT "settlement_to_user_id_user_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement" ADD CONSTRAINT "settlement_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement" ADD CONSTRAINT "settlement_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement" ADD CONSTRAINT "settlement_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_rule" ADD CONSTRAINT "split_rule_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_rule" ADD CONSTRAINT "split_rule_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_rule" ADD CONSTRAINT "split_rule_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_rule" ADD CONSTRAINT "split_rule_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_retainer_month_uq" ON "payment" USING btree ("job_id","retainer_id","period_month") WHERE "payment"."retainer_id" is not null and "payment"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "payment_job_idx" ON "payment" USING btree ("job_id","status") WHERE "payment"."job_id" is not null;--> statement-breakpoint
CREATE INDEX "payment_company_idx" ON "payment" USING btree ("company_id") WHERE "payment"."company_id" is not null;--> statement-breakpoint
CREATE INDEX "payment_status_due_idx" ON "payment" USING btree ("status","due_on");--> statement-breakpoint
CREATE INDEX "payment_paid_idx" ON "payment" USING btree ("paid_on") WHERE "payment"."status" = 'paid';--> statement-breakpoint
CREATE INDEX "payment_issued_idx" ON "payment" USING btree ("issued_on") WHERE "payment"."issued_on" is not null;--> statement-breakpoint
CREATE INDEX "payment_issuer_idx" ON "payment" USING btree ("issuer_id");--> statement-breakpoint
CREATE INDEX "payment_description_trgm_idx" ON "payment" USING gin (lower(f_unaccent("description")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "payment_invoice_number_trgm_idx" ON "payment" USING gin (lower(f_unaccent("invoice_number")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "payment_private_idx" ON "payment" USING btree ("is_private") WHERE "payment"."is_private";--> statement-breakpoint
CREATE INDEX "payment_allocation_user_idx" ON "payment_allocation" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "retainer_job_idx" ON "retainer" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "retainer_active_idx" ON "retainer" USING btree ("from_month") WHERE "retainer"."active" and "retainer"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "settlement_date_idx" ON "settlement" USING btree ("settled_on");--> statement-breakpoint
CREATE INDEX "settlement_users_idx" ON "settlement" USING btree ("from_user_id","to_user_id");--> statement-breakpoint
CREATE INDEX "split_rule_job_idx" ON "split_rule" USING btree ("job_id","position");--> statement-breakpoint
CREATE INDEX "split_rule_user_idx" ON "split_rule" USING btree ("user_id");