DO $$
BEGIN
  ALTER TABLE "Client"
    ADD COLUMN "noAnswerCount" INTEGER NOT NULL DEFAULT 0;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

UPDATE "Client"
SET "noAnswerCount" = 1
WHERE "status" = 'NO_ANSWER'
  AND COALESCE("noAnswerCount", 0) < 1;
