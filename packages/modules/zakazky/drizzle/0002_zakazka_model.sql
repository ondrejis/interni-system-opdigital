CREATE TABLE "approval" (
	"id" uuid PRIMARY KEY NOT NULL,
	"doc_type" text NOT NULL,
	"doc_id" uuid NOT NULL,
	"job_id" uuid,
	"amount_minor" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by" uuid,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"comment" text,
	"rule_id" uuid
);
--> statement-breakpoint
CREATE TABLE "approval_rule" (
	"id" uuid PRIMARY KEY NOT NULL,
	"doc_type" text NOT NULL,
	"min_amount_minor" bigint DEFAULT 0 NOT NULL,
	"approver_permission" text,
	"approver_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "budget_calc_line" (
	"id" uuid PRIMARY KEY NOT NULL,
	"item_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"variable" text,
	"description" text,
	"formula" text DEFAULT '' NOT NULL,
	"result" numeric(14, 3) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_item" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"code" text,
	"title" text NOT NULL,
	"kind" text DEFAULT 'other' NOT NULL,
	"unit" text DEFAULT 'ks' NOT NULL,
	"quantity" numeric(14, 3) DEFAULT '1' NOT NULL,
	"unit_cost_minor" bigint DEFAULT 0 NOT NULL,
	"unit_price_minor" bigint DEFAULT 0 NOT NULL,
	"vat_rate_bp" integer DEFAULT 2100 NOT NULL,
	"start_date" date,
	"end_date" date,
	"spec" text,
	"note" text,
	"original_quantity" numeric(14, 3),
	"original_unit_cost_minor" bigint,
	"original_unit_price_minor" bigint,
	"change_id" uuid,
	"catalog_item_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "budget_object" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version_id" uuid NOT NULL,
	"code" text,
	"title" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"responsible_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "budget_section" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version_id" uuid NOT NULL,
	"object_id" uuid NOT NULL,
	"parent_id" uuid,
	"code" text,
	"title" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"cost_category" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "budget_version" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"number" integer DEFAULT 1 NOT NULL,
	"title" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" uuid,
	"source_version_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cost_allocation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"source" text NOT NULL,
	"source_ref" text NOT NULL,
	"section_id" uuid NOT NULL,
	"item_id" uuid,
	"amount_minor" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "job_change_line" (
	"id" uuid PRIMARY KEY NOT NULL,
	"change_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"kind" text NOT NULL,
	"item_id" uuid,
	"section_id" uuid,
	"title" text NOT NULL,
	"unit" text DEFAULT 'ks' NOT NULL,
	"item_kind" text DEFAULT 'other' NOT NULL,
	"quantity_before" numeric(14, 3) DEFAULT '0' NOT NULL,
	"quantity_after" numeric(14, 3) DEFAULT '0' NOT NULL,
	"unit_cost_minor" bigint DEFAULT 0 NOT NULL,
	"unit_price_minor" bigint DEFAULT 0 NOT NULL,
	"vat_rate_bp" integer DEFAULT 2100 NOT NULL,
	"price_impact_minor" bigint DEFAULT 0 NOT NULL,
	"cost_impact_minor" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_order" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"number" text NOT NULL,
	"title" text NOT NULL,
	"supplier_id" uuid,
	"supplier_name" text,
	"order_date" date,
	"delivery_date" date,
	"section_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"total_minor" bigint DEFAULT 0 NOT NULL,
	"note" text,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "job_order_line" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"item_id" uuid,
	"title" text NOT NULL,
	"unit" text DEFAULT 'ks' NOT NULL,
	"quantity" numeric(14, 3) DEFAULT '1' NOT NULL,
	"unit_price_minor" bigint DEFAULT 0 NOT NULL,
	"vat_rate_bp" integer DEFAULT 2100 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_share" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"label" text,
	"scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "job_template" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "work_statement" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"object_id" uuid,
	"number" integer NOT NULL,
	"period_from" date NOT NULL,
	"period_to" date NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"claimed_minor" bigint DEFAULT 0 NOT NULL,
	"approved_minor" bigint DEFAULT 0 NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" uuid,
	"invoice_id" uuid,
	"note" text,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "work_statement_line" (
	"id" uuid PRIMARY KEY NOT NULL,
	"statement_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"quantity_period" numeric(14, 3) DEFAULT '0' NOT NULL,
	"quantity_total" numeric(14, 3) DEFAULT '0' NOT NULL,
	"amount_period_minor" bigint DEFAULT 0 NOT NULL,
	"amount_total_minor" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "phase" text DEFAULT 'preparation' NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "phase_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "paused_from" text;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "lost_reason" text;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "won_at" date;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "handover_at" date;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "closed_at" date;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "vat_mode" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "retention_bp" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "warranty_months" integer;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "warranty_until" date;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "site_lat" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "site_lng" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "source_inquiry_id" uuid;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "template_id" uuid;--> statement-breakpoint
ALTER TABLE "job_change" ADD COLUMN "object_id" uuid;--> statement-breakpoint
ALTER TABLE "job_change" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "job_change" ADD COLUMN "cost_impact_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "job_change" ADD COLUMN "applied_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "job_change" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "job_cost" ADD COLUMN "section_id" uuid;--> statement-breakpoint
ALTER TABLE "job_cost" ADD COLUMN "item_id" uuid;--> statement-breakpoint
ALTER TABLE "job_cost" ADD COLUMN "order_id" uuid;--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_rule" ADD CONSTRAINT "approval_rule_approver_id_user_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_rule" ADD CONSTRAINT "approval_rule_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_rule" ADD CONSTRAINT "approval_rule_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_calc_line" ADD CONSTRAINT "budget_calc_line_item_id_budget_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."budget_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_item" ADD CONSTRAINT "budget_item_version_id_budget_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."budget_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_item" ADD CONSTRAINT "budget_item_section_id_budget_section_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."budget_section"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_item" ADD CONSTRAINT "budget_item_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_item" ADD CONSTRAINT "budget_item_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_object" ADD CONSTRAINT "budget_object_version_id_budget_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."budget_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_object" ADD CONSTRAINT "budget_object_responsible_id_user_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_object" ADD CONSTRAINT "budget_object_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_object" ADD CONSTRAINT "budget_object_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_section" ADD CONSTRAINT "budget_section_version_id_budget_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."budget_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_section" ADD CONSTRAINT "budget_section_object_id_budget_object_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."budget_object"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_section" ADD CONSTRAINT "budget_section_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_section" ADD CONSTRAINT "budget_section_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_version" ADD CONSTRAINT "budget_version_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_version" ADD CONSTRAINT "budget_version_locked_by_user_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_version" ADD CONSTRAINT "budget_version_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_version" ADD CONSTRAINT "budget_version_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_allocation" ADD CONSTRAINT "cost_allocation_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_allocation" ADD CONSTRAINT "cost_allocation_section_id_budget_section_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."budget_section"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_allocation" ADD CONSTRAINT "cost_allocation_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_allocation" ADD CONSTRAINT "cost_allocation_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_change_line" ADD CONSTRAINT "job_change_line_change_id_job_change_id_fk" FOREIGN KEY ("change_id") REFERENCES "public"."job_change"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_order" ADD CONSTRAINT "job_order_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_order" ADD CONSTRAINT "job_order_supplier_id_company_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_order" ADD CONSTRAINT "job_order_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_order" ADD CONSTRAINT "job_order_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_order_line" ADD CONSTRAINT "job_order_line_order_id_job_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."job_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_share" ADD CONSTRAINT "job_share_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_share" ADD CONSTRAINT "job_share_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_share" ADD CONSTRAINT "job_share_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_template" ADD CONSTRAINT "job_template_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_template" ADD CONSTRAINT "job_template_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_statement" ADD CONSTRAINT "work_statement_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_statement" ADD CONSTRAINT "work_statement_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_statement" ADD CONSTRAINT "work_statement_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_statement" ADD CONSTRAINT "work_statement_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_statement_line" ADD CONSTRAINT "work_statement_line_statement_id_work_statement_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."work_statement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_statement_line" ADD CONSTRAINT "work_statement_line_item_id_budget_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."budget_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approval_doc_idx" ON "approval" USING btree ("doc_type","doc_id");--> statement-breakpoint
CREATE INDEX "approval_status_idx" ON "approval" USING btree ("status");--> statement-breakpoint
CREATE INDEX "approval_rule_doc_type_idx" ON "approval_rule" USING btree ("doc_type");--> statement-breakpoint
CREATE INDEX "budget_calc_line_item_idx" ON "budget_calc_line" USING btree ("item_id","position");--> statement-breakpoint
CREATE INDEX "budget_item_section_idx" ON "budget_item" USING btree ("section_id","position");--> statement-breakpoint
CREATE INDEX "budget_item_version_idx" ON "budget_item" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "budget_object_version_idx" ON "budget_object" USING btree ("version_id","position");--> statement-breakpoint
CREATE INDEX "budget_section_version_idx" ON "budget_section" USING btree ("version_id","position");--> statement-breakpoint
CREATE INDEX "budget_section_object_idx" ON "budget_section" USING btree ("object_id");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_version_uq" ON "budget_version" USING btree ("job_id","kind","number");--> statement-breakpoint
CREATE INDEX "cost_allocation_job_idx" ON "cost_allocation" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "cost_allocation_source_idx" ON "cost_allocation" USING btree ("source","source_ref");--> statement-breakpoint
CREATE INDEX "job_change_line_change_idx" ON "job_change_line" USING btree ("change_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "job_order_number_uq" ON "job_order" USING btree ("number");--> statement-breakpoint
CREATE INDEX "job_order_job_idx" ON "job_order" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "job_order_line_order_idx" ON "job_order_line" USING btree ("order_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "job_share_token_uq" ON "job_share" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "job_share_job_idx" ON "job_share" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "work_statement_number_uq" ON "work_statement" USING btree ("job_id","number");--> statement-breakpoint
CREATE INDEX "work_statement_line_statement_idx" ON "work_statement_line" USING btree ("statement_id","position");--> statement-breakpoint
CREATE INDEX "job_phase_idx" ON "job" USING btree ("phase");--> statement-breakpoint
CREATE INDEX "job_cost_section_idx" ON "job_cost" USING btree ("section_id");