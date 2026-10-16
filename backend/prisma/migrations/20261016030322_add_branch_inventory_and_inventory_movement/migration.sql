-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('ENTRY', 'EXIT', 'ADJUSTMENT_ENTRY', 'ADJUSTMENT_EXIT', 'TRANSFER');

-- CreateTable
CREATE TABLE "branch_inventory" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "minimum_stock" INTEGER NOT NULL DEFAULT 0,
    "expiration_date" TIMESTAMP(6) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "branch_inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movement" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "branch_id" UUID,
    "origin_branch_id" UUID,
    "user_id" UUID NOT NULL,
    "movement_type" "InventoryMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "observation" TEXT,
    "movement_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sale_id" UUID,
    "purchase_id" UUID,

    CONSTRAINT "inventory_movement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "branch_inventory_branch_id_idx" ON "branch_inventory"("branch_id");

-- CreateIndex
CREATE INDEX "branch_inventory_product_id_idx" ON "branch_inventory"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "branch_inventory_branch_id_product_id_expiration_date_key" ON "branch_inventory"("branch_id", "product_id", "expiration_date");

-- CreateIndex
CREATE INDEX "inventory_movement_product_id_idx" ON "inventory_movement"("product_id");

-- CreateIndex
CREATE INDEX "inventory_movement_branch_id_idx" ON "inventory_movement"("branch_id");

-- CreateIndex
CREATE INDEX "inventory_movement_origin_branch_id_idx" ON "inventory_movement"("origin_branch_id");

-- CreateIndex
CREATE INDEX "inventory_movement_user_id_idx" ON "inventory_movement"("user_id");

-- CreateIndex
CREATE INDEX "inventory_movement_movement_at_idx" ON "inventory_movement"("movement_at");

-- CreateIndex
CREATE INDEX "inventory_movement_movement_type_idx" ON "inventory_movement"("movement_type");

-- AddForeignKey
ALTER TABLE "branch_inventory" ADD CONSTRAINT "branch_inventory_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_inventory" ADD CONSTRAINT "branch_inventory_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_origin_branch_id_fkey" FOREIGN KEY ("origin_branch_id") REFERENCES "branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_account"("person_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK constraints
ALTER TABLE "branch_inventory"
  ADD CONSTRAINT "branch_inventory_quantity_non_negative"
  CHECK ("quantity" >= 0);

ALTER TABLE "branch_inventory"
  ADD CONSTRAINT "branch_inventory_minimum_stock_non_negative"
  CHECK ("minimum_stock" >= 0);