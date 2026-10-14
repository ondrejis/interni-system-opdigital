CREATE TABLE "purchase_order" (
	"id" uuid PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"supplier_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"job_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"date" date NOT NULL,
	"expected_date" date,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "purchase_order_line" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"qty" numeric(14, 3) NOT NULL,
	"received_qty" numeric(14, 3) DEFAULT '0' NOT NULL,
	"unit_price_minor" bigint
);
--> statement-breakpoint
CREATE TABLE "stock_count" (
	"id" uuid PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"note" text,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stock_count_line" (
	"id" uuid PRIMARY KEY NOT NULL,
	"count_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"expected_qty" numeric(14, 3) NOT NULL,
	"counted_qty" numeric(14, 3)
);
--> statement-breakpoint
CREATE TABLE "stock_doc" (
	"id" uuid PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"type" text NOT NULL,
	"date" date NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"target_warehouse_id" uuid,
	"supplier_id" uuid,
	"job_id" uuid,
	"purchase_order_id" uuid,
	"count_id" uuid,
	"supplier_doc_no" text,
	"note" text,
	"total_minor" bigint DEFAULT 0 NOT NULL,
	"line_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stock_doc_line" (
	"id" uuid PRIMARY KEY NOT NULL,
	"doc_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"qty" numeric(14, 3) NOT NULL,
	"unit_cost" numeric(16, 4) NOT NULL,
	"total_minor" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_item" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"unit" text DEFAULT 'ks' NOT NULL,
	"ean" text,
	"min_qty" numeric(14, 3) DEFAULT '0' NOT NULL,
	"total_qty" numeric(14, 3) DEFAULT '0' NOT NULL,
	"supplier_id" uuid,
	"last_price_minor" bigint,
	"avg_cost" numeric(16, 4) DEFAULT '0' NOT NULL,
	"avg_cost_minor" bigint GENERATED ALWAYS AS (round(avg_cost)::bigint) STORED,
	"value_minor" bigint GENERATED ALWAYS AS (round(total_qty * avg_cost)::bigint) STORED,
	"below_min" boolean GENERATED ALWAYS AS (min_qty > 0 and total_qty < min_qty) STORED,
	"vat_rate" numeric(5, 2) DEFAULT '21' NOT NULL,
	"note" text,
	"active" boolean DEFAULT true NOT NULL,
	"custom" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stock_level" (
	"item_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"qty" numeric(14, 3) DEFAULT '0' NOT NULL,
	CONSTRAINT "stock_level_item_id_warehouse_id_pk" PRIMARY KEY("item_id","warehouse_id")
);
--> statement-breakpoint
CREATE TABLE "warehouse" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'warehouse' NOT NULL,
	"asset_id" uuid,
	"job_id" uuid,
	"responsible_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_supplier_id_company_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_warehouse_id_warehouse_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_order_id_purchase_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."purchase_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_item_id_stock_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."stock_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count" ADD CONSTRAINT "stock_count_warehouse_id_warehouse_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count" ADD CONSTRAINT "stock_count_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count" ADD CONSTRAINT "stock_count_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_line" ADD CONSTRAINT "stock_count_line_count_id_stock_count_id_fk" FOREIGN KEY ("count_id") REFERENCES "public"."stock_count"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_line" ADD CONSTRAINT "stock_count_line_item_id_stock_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."stock_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_doc" ADD CONSTRAINT "stock_doc_warehouse_id_warehouse_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_doc" ADD CONSTRAINT "stock_doc_target_warehouse_id_warehouse_id_fk" FOREIGN KEY ("target_warehouse_id") REFERENCES "public"."warehouse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_doc" ADD CONSTRAINT "stock_doc_supplier_id_company_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_doc" ADD CONSTRAINT "stock_doc_purchase_order_id_purchase_order_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_doc" ADD CONSTRAINT "stock_doc_count_id_stock_count_id_fk" FOREIGN KEY ("count_id") REFERENCES "public"."stock_count"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_doc" ADD CONSTRAINT "stock_doc_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_doc" ADD CONSTRAINT "stock_doc_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_doc_line" ADD CONSTRAINT "stock_doc_line_doc_id_stock_doc_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."stock_doc"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_doc_line" ADD CONSTRAINT "stock_doc_line_item_id_stock_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."stock_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_item" ADD CONSTRAINT "stock_item_supplier_id_company_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_item" ADD CONSTRAINT "stock_item_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_item" ADD CONSTRAINT "stock_item_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_level" ADD CONSTRAINT "stock_level_item_id_stock_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."stock_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_level" ADD CONSTRAINT "stock_level_warehouse_id_warehouse_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouse"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse" ADD CONSTRAINT "warehouse_responsible_id_user_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse" ADD CONSTRAINT "warehouse_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse" ADD CONSTRAINT "warehouse_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_order_number_uq" ON "purchase_order" USING btree ("number");--> statement-breakpoint
CREATE INDEX "po_supplier_idx" ON "purchase_order" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "po_line_order_idx" ON "purchase_order_line" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_count_number_uq" ON "stock_count" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_count_open_uq" ON "stock_count" USING btree ("warehouse_id") WHERE "stock_count"."status" = 'open' and "stock_count"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "stock_count_line_count_idx" ON "stock_count_line" USING btree ("count_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_doc_number_uq" ON "stock_doc" USING btree ("number");--> statement-breakpoint
CREATE INDEX "stock_doc_job_idx" ON "stock_doc" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "stock_doc_date_idx" ON "stock_doc" USING btree ("date");--> statement-breakpoint
CREATE INDEX "stock_doc_warehouse_idx" ON "stock_doc" USING btree ("warehouse_id");--> statement-breakpoint
CREATE INDEX "stock_doc_line_item_idx" ON "stock_doc_line" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "stock_doc_line_doc_idx" ON "stock_doc_line" USING btree ("doc_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_item_code_uq" ON "stock_item" USING btree ("code") WHERE "stock_item"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "stock_item_supplier_idx" ON "stock_item" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "stock_item_name_trgm_idx" ON "stock_item" USING gin (lower(f_unaccent("name")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "stock_item_custom_idx" ON "stock_item" USING gin ("custom");