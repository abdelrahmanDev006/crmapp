-- Functional composite index for duplicate name checking inside a region
CREATE INDEX IF NOT EXISTS "idx_client_region_lower_name" ON "Client" (
  "regionId",
  LOWER(name)
) WHERE "isDeleted" = false;
