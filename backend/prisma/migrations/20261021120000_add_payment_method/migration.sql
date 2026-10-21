CREATE TABLE "payment_method" (
    "id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "payment_method_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_method_code_key" ON "payment_method"("code");

INSERT INTO "payment_method" ("id", "code", "name", "active", "created_at", "updated_at")
VALUES
    (gen_random_uuid(), 'CASH', 'Efectivo', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'CARD', 'Tarjeta', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'NEQUI', 'Nequi', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'BANK_TRANSFER', 'Transferencia bancaria', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'OTHER', 'Otro', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);