CREATE INDEX "invoice_title_trgm_idx" ON "invoice" USING gin (lower(f_unaccent("title")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "invoice_number_trgm_idx" ON "invoice" USING gin (lower(f_unaccent("number")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "invoice_variable_symbol_trgm_idx" ON "invoice" USING gin (lower(f_unaccent("variable_symbol")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "received_invoice_number_trgm_idx" ON "received_invoice" USING gin (lower(f_unaccent("number")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "received_invoice_variable_symbol_trgm_idx" ON "received_invoice" USING gin (lower(f_unaccent("variable_symbol")) gin_trgm_ops);