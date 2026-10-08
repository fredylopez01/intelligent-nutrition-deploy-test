-- Add the customer relationship status.
ALTER TABLE "customer"
ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

-- Populate names from the canonical person record before enforcing NOT NULL.
UPDATE "customer" AS customer
SET "full_name" = COALESCE(
    NULLIF(BTRIM(person."business_name"), ''),
    NULLIF(
        BTRIM(
            CONCAT_WS(
                ' ',
                NULLIF(BTRIM(person."first_name"), ''),
                NULLIF(BTRIM(person."last_name"), '')
            )
        ),
        ''
    ),
    'Cliente ' || LEFT(customer."person_id"::text, 8)
)
FROM "person" AS person
WHERE customer."person_id" = person."id"
  AND (customer."full_name" IS NULL OR BTRIM(customer."full_name") = '');

ALTER TABLE "customer"
ALTER COLUMN "full_name" SET NOT NULL;