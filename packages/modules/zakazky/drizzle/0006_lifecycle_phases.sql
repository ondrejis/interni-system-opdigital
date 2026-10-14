-- Životní cyklus zakázek (ADR 015): stavy pipeline `job/default` dostanou fázi, doplní se chybějící stavy
-- a existující zakázky dostanou fázi podle svého stavu. Na čisté databázi pipeline ještě není (zakládá ji seed
-- už s fázemi), takže se nic nestane. Mapování stejné jako `phaseForLegacyStage` v kódu.
UPDATE "pipeline_stage" ps SET "phase" = CASE lower(ps."name")
    WHEN 'příprava' THEN 'preparation'
    WHEN 'realizace' THEN 'execution'
    WHEN 'předání' THEN 'handover'
    WHEN 'hotovo' THEN 'closed'
    WHEN 'zrušeno' THEN 'lost'
  END
FROM "pipeline" p
WHERE ps."pipeline_id" = p."id" AND p."entity_type" = 'job' AND p."key" = 'default'
  AND ps."phase" IS NULL AND ps."deleted_at" IS NULL
  AND lower(ps."name") IN ('příprava', 'realizace', 'předání', 'hotovo', 'zrušeno');
--> statement-breakpoint
UPDATE "pipeline_stage" ps SET "phase" = CASE ps."kind" WHEN 'done' THEN 'closed' ELSE 'lost' END
FROM "pipeline" p
WHERE ps."pipeline_id" = p."id" AND p."entity_type" = 'job' AND p."key" = 'default'
  AND ps."phase" IS NULL AND ps."deleted_at" IS NULL AND ps."kind" IN ('done', 'lost');
--> statement-breakpoint
INSERT INTO "pipeline_stage" ("id", "pipeline_id", "name", "color", "kind", "phase", "position")
SELECT gen_random_uuid(), p."id", v."name", v."color", v."kind", v."phase", 0
FROM "pipeline" p
CROSS JOIN (VALUES
  ('Poptávka', 'gray', 'open', 'inquiry'),
  ('Nabídka', 'purple', 'open', 'offer'),
  ('Příprava', 'blue', 'open', 'preparation'),
  ('Realizace', 'orange', 'open', 'execution'),
  ('Předání', 'teal', 'open', 'handover'),
  ('Záruka', 'indigo', 'open', 'warranty'),
  ('Uzavřeno', 'green', 'done', 'closed'),
  ('Prohráno', 'red', 'lost', 'lost'),
  ('Pozastaveno', 'yellow', 'open', 'paused')
) AS v("name", "color", "kind", "phase")
WHERE p."entity_type" = 'job' AND p."key" = 'default' AND p."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "pipeline_stage" s
    WHERE s."pipeline_id" = p."id" AND s."phase" = v."phase" AND s."deleted_at" IS NULL
  );
--> statement-breakpoint
WITH ranked AS (
  SELECT s."id",
    row_number() OVER (
      PARTITION BY s."pipeline_id"
      ORDER BY CASE s."phase"
        WHEN 'inquiry' THEN 1 WHEN 'offer' THEN 2 WHEN 'preparation' THEN 3 WHEN 'execution' THEN 4
        WHEN 'handover' THEN 5 WHEN 'warranty' THEN 6 WHEN 'closed' THEN 7 WHEN 'lost' THEN 8
        WHEN 'paused' THEN 9 ELSE 4 END,
        s."position", s."created_at"
    ) - 1 AS pos
  FROM "pipeline_stage" s
  JOIN "pipeline" p ON p."id" = s."pipeline_id"
  WHERE p."entity_type" = 'job' AND p."key" = 'default' AND s."deleted_at" IS NULL
)
UPDATE "pipeline_stage" s SET "position" = r.pos FROM ranked r WHERE s."id" = r."id";
--> statement-breakpoint
UPDATE "job" j SET "phase" = s."phase", "phase_changed_at" = COALESCE(j."phase_changed_at", j."updated_at")
FROM "pipeline_stage" s
WHERE s."id" = j."stage_id" AND s."phase" IS NOT NULL;
