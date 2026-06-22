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

-- Prevent duplicate active phone numbers. This intentionally fails deployment
-- if existing active duplicates must be cleaned before production.
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_client_phone_normalized_active"
ON "Client"("phoneNormalized")
WHERE "isDeleted" = false AND "phoneNormalized" IS NOT NULL;

-- Speed up duplicate-name checks while preserving the existing force override behavior.
CREATE INDEX IF NOT EXISTS "idx_client_region_lower_name_active"
ON "Client"("regionId", LOWER("name"))
WHERE "isDeleted" = false;
