CREATE INDEX "company_ico_trgm_idx" ON "company" USING gin (lower(f_unaccent("ico")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "company_city_trgm_idx" ON "company" USING gin (lower(f_unaccent("city")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "company_email_trgm_idx" ON "company" USING gin (lower(f_unaccent("email")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "company_phone_trgm_idx" ON "company" USING gin (lower(f_unaccent("phone")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "company_dic_trgm_idx" ON "company" USING gin (lower(f_unaccent("dic")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "company_street_trgm_idx" ON "company" USING gin (lower(f_unaccent("street")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "company_zip_trgm_idx" ON "company" USING gin (lower(f_unaccent("zip")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "company_web_trgm_idx" ON "company" USING gin (lower(f_unaccent("web")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "person_position_trgm_idx" ON "person" USING gin (lower(f_unaccent("position")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "person_email_trgm_idx" ON "person" USING gin (lower(f_unaccent("email")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "person_phone_trgm_idx" ON "person" USING gin (lower(f_unaccent("phone")) gin_trgm_ops);