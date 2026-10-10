-- The initial seeded administrator predates the required contact columns.
-- Keep its migration-time values aligned with prisma/seed.ts.
UPDATE "person"
SET "phone" = COALESCE(NULLIF(BTRIM("phone"), ''), '0000000000'),
        "address" = COALESCE(NULLIF(BTRIM("address"), ''), 'System account')
WHERE "document_number" = '1000000000'
    AND LOWER("email") = LOWER('intelligentnutrition.shop@gmail.com');

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "person"
        WHERE "document_type_id" IS NULL
           OR NULLIF(BTRIM("document_number"), '') IS NULL
           OR NULLIF(BTRIM("email"), '') IS NULL
           OR NULLIF(BTRIM("phone"), '') IS NULL
           OR NULLIF(BTRIM("address"), '') IS NULL
    ) THEN
        RAISE EXCEPTION 'Cannot require person identity/contact fields: person rows contain NULL or blank document number, email, phone, or address values. Correct those rows before retrying this migration.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "person"
        GROUP BY "email"
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Cannot make person.email unique: duplicate email values exist. Correct those rows before retrying this migration.';
    END IF;
END $$;

ALTER TABLE "person"
    ALTER COLUMN "document_type_id" SET NOT NULL,
    ALTER COLUMN "document_number" SET NOT NULL,
    ALTER COLUMN "email" SET NOT NULL,
    ALTER COLUMN "phone" SET NOT NULL,
    ALTER COLUMN "address" SET NOT NULL;

CREATE UNIQUE INDEX "person_email_key" ON "person"("email");