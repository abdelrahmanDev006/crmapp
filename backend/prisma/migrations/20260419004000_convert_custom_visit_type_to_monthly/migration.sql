UPDATE "Client"
SET "visitType" = 'MONTHLY'
WHERE "visitType"::text = 'CUSTOM';
