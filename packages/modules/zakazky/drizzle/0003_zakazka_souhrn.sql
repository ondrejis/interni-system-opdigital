ALTER TABLE "job" ADD COLUMN "sum_contract_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "sum_planned_cost_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "sum_cost_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "sum_invoiced_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "sum_paid_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "sum_margin_pct" numeric(7, 1);--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "sum_drawdown_pct" numeric(7, 1);--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "sum_health" text;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "sum_at" timestamp with time zone;