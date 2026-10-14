-- Zpětné doplnění historie stavů: každá existující zakázka dostane jeden otevřený řádek (aktuální stav od posledního
-- přechodu fáze, jinak od založení) a `crm_stage_entered_at`. Idempotentní: zakázka, která už historii má, se přeskočí.
INSERT INTO "job_stage_history" ("id", "job_id", "stage_id", "phase", "entered_at")
SELECT gen_random_uuid(), j."id", j."stage_id", j."phase", COALESCE(j."phase_changed_at", j."created_at")
FROM "job" j
WHERE j."deleted_at" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "job_stage_history" h WHERE h."job_id" = j."id");
--> statement-breakpoint
UPDATE "job" SET "crm_stage_entered_at" = COALESCE("phase_changed_at", "created_at")
WHERE "crm_stage_entered_at" IS NULL;
