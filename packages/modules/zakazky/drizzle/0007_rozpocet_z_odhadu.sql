-- Přesun dřívějšího plochého odhadu (job_estimate_line) do nového rozpočtu: pro každou zakázku s řádky vznikne
-- realizační verze č. 1 (rozpracovaná), skrytý výchozí objekt „Celá zakázka“, oddíly podle kategorie nákladu a položky.
-- Zakázky, které už nějakou verzi rozpočtu mají, se přeskočí. Tabulka job_estimate_line se zde nemaže (maže ji pozdější migrace).
CREATE TEMP TABLE _est_job ON COMMIT DROP AS
SELECT j.job_id, gen_random_uuid() AS version_id, gen_random_uuid() AS object_id
FROM (SELECT DISTINCT job_id FROM job_estimate_line WHERE deleted_at IS NULL) j
WHERE NOT EXISTS (SELECT 1 FROM budget_version v WHERE v.job_id = j.job_id AND v.deleted_at IS NULL);--> statement-breakpoint
INSERT INTO budget_version (id, job_id, kind, number, title, status, note)
SELECT version_id, job_id, 'realization', 1, NULL, 'draft', 'Převedeno z dřívějšího odhadu zakázky.'
FROM _est_job;--> statement-breakpoint
INSERT INTO budget_object (id, version_id, title, is_default, position)
SELECT object_id, version_id, 'Celá zakázka', true, 0 FROM _est_job;--> statement-breakpoint
CREATE TEMP TABLE _est_section ON COMMIT DROP AS
SELECT x.version_id, x.object_id, x.cat, gen_random_uuid() AS section_id,
  (CASE x.cat WHEN 'labour' THEN 'Práce' WHEN 'material' THEN 'Materiál' WHEN 'subcontract' THEN 'Subdodávky'
     WHEN 'machines' THEN 'Stroje a doprava' ELSE 'Ostatní' END) AS title,
  (row_number() OVER (PARTITION BY x.version_id ORDER BY
     CASE x.cat WHEN 'labour' THEN 0 WHEN 'material' THEN 1 WHEN 'subcontract' THEN 2 WHEN 'machines' THEN 3 ELSE 4 END) - 1)::int AS pos
FROM (
  SELECT DISTINCT e.version_id, e.object_id,
    CASE WHEN l.category IN ('labour','material','subcontract','machines') THEN l.category ELSE 'other' END AS cat
  FROM _est_job e
  JOIN job_estimate_line l ON l.job_id = e.job_id AND l.deleted_at IS NULL
) x;--> statement-breakpoint
INSERT INTO budget_section (id, version_id, object_id, title, position, cost_category)
SELECT section_id, version_id, object_id, title, pos, cat FROM _est_section;--> statement-breakpoint
INSERT INTO budget_item (id, version_id, section_id, position, title, kind, unit, quantity,
  unit_cost_minor, unit_price_minor, vat_rate_bp, created_at, created_by, updated_by)
SELECT gen_random_uuid(), s.version_id, s.section_id,
  (row_number() OVER (PARTITION BY s.section_id ORDER BY l.position, l.created_at, l.id) - 1)::int,
  l.description, s.cat, l.unit, l.quantity, l.unit_cost_minor, l.unit_price_minor,
  round(l.vat_rate * 100)::int, l.created_at, l.created_by, l.updated_by
FROM _est_job e
JOIN job_estimate_line l ON l.job_id = e.job_id AND l.deleted_at IS NULL
JOIN _est_section s ON s.version_id = e.version_id
  AND s.cat = (CASE WHEN l.category IN ('labour','material','subcontract','machines') THEN l.category ELSE 'other' END);
