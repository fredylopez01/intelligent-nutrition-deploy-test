-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('PENDING_RECEIPT', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED');

-- CreateTable
CREATE TABLE "purchase" (
    "id" UUID NOT NULL,
    "purchase_number" VARCHAR(30) NOT NULL,
    "supplier_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "purchase_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "observation" TEXT,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'PENDING_RECEIPT',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_detail" (
    "id" UUID NOT NULL,
    "purchase_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "requested_quantity" INTEGER NOT NULL,
    "received_quantity" INTEGER NOT NULL DEFAULT 0,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "observation" TEXT,
    "received" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "purchase_detail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_purchase_number_key" ON "purchase"("purchase_number");

-- CreateIndex
CREATE INDEX "purchase_supplier_id_idx" ON "purchase"("supplier_id");

-- CreateIndex
CREATE INDEX "purchase_user_id_idx" ON "purchase"("user_id");

-- CreateIndex
CREATE INDEX "purchase_purchase_at_idx" ON "purchase"("purchase_at");

-- CreateIndex
CREATE INDEX "purchase_detail_purchase_id_idx" ON "purchase_detail"("purchase_id");

-- CreateIndex
CREATE INDEX "purchase_detail_product_id_idx" ON "purchase_detail"("product_id");

-- AddForeignKey
ALTER TABLE "purchase" ADD CONSTRAINT "purchase_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier"("person_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase" ADD CONSTRAINT "purchase_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_account"("person_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_detail" ADD CONSTRAINT "purchase_detail_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_detail" ADD CONSTRAINT "purchase_detail_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (inventory_movement -> purchase)
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
