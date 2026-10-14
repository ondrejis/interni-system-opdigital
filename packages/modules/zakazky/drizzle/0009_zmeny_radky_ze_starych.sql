-- Dosavadní vícepráce a méněpráce byly jedna souhrnná částka (job_change.amount_minor) bez řádků.
-- Každá dostane jeden řádek „nová položka“ za celou částku (množství 1, cena = částka), takže částka změny
-- je i u starých dokladů součet dopadů řádků. Rozpočet se tím nemění: appliedAt zůstává prázdné a schválené
-- částky jsou už ve smluvní ceně přes součet schválených změn. Migrace je opakovatelná (jen změny bez řádků).
INSERT INTO "job_change_line" ("id", "change_id", "position", "kind", "title", "unit", "item_kind", "quantity_before", "quantity_after", "unit_cost_minor", "unit_price_minor", "vat_rate_bp", "price_impact_minor", "cost_impact_minor")
SELECT gen_random_uuid(), c."id", 0, 'add',
  (CASE WHEN c."amount_minor" < 0 THEN 'Méněpráce MP-' ELSE 'Vícepráce VP-' END) || c."number",
  'ks', 'other', '0', '1', 0, c."amount_minor", 2100, c."amount_minor", 0
FROM "job_change" c
WHERE c."deleted_at" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "job_change_line" l WHERE l."change_id" = c."id");
--> statement-breakpoint
-- Schválená změna je zamčená (úprava = vrácení do konceptu se zápisem do auditu).
UPDATE "job_change" SET "locked_at" = COALESCE("locked_at", now()) WHERE "status" = 'approved' AND "locked_at" IS NULL;
