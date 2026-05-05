DO $$
BEGIN
  ALTER TABLE "Client" ADD COLUMN "customVisitIntervalDays" INTEGER;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Client"
    ADD CONSTRAINT "Client_customVisitIntervalDays_range_check"
    CHECK (
      "customVisitIntervalDays" IS NULL
      OR (
        "customVisitIntervalDays" >= 1
        AND "customVisitIntervalDays" <= 365
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

UPDATE "Client"
SET "customVisitIntervalDays" = 7
WHERE "visitType" = 'CUSTOM'
  AND "customVisitIntervalDays" IS NULL;
