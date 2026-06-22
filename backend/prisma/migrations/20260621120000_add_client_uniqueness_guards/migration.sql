-- Backfill normalized phone values before adding uniqueness guards.
UPDATE "Client"
SET "phoneNormalized" = NULLIF(
  regexp_replace(
    translate(phone, '٠١٢٣٤٥٦٧٨٩', '0123456789'),
    '[^0-9]',
    '',
    'g'
  ),
  ''
)
WHERE "phoneNormalized" IS NULL;

-- Speed up duplicate active phone checks without deleting or blocking
-- existing production records that may already contain duplicates.
CREATE INDEX IF NOT EXISTS "idx_client_phone_normalized_active"
ON "Client"("phoneNormalized")
WHERE "isDeleted" = false AND "phoneNormalized" IS NOT NULL;

-- Speed up duplicate-name checks while preserving the existing force override behavior.
CREATE INDEX IF NOT EXISTS "idx_client_region_lower_name_active"
ON "Client"("regionId", LOWER("name"))
WHERE "isDeleted" = false;
