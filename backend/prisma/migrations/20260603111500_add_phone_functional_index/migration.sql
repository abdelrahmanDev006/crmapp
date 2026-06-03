-- Functional index on normalized phone for fast duplicate checking
-- This avoids full table scan when checking phone duplicates during client creation
CREATE INDEX IF NOT EXISTS "idx_client_normalized_phone" ON "Client" (
  regexp_replace(
    translate(phone, '٠١٢٣٤٥٦٧٨٩', '0123456789'),
    '[^0-9]',
    '',
    'g'
  )
) WHERE "isDeleted" = false;
