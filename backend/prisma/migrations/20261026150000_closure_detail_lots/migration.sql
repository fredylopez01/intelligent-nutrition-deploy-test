-- DropIndex
DROP INDEX "inventory_closure_detail_closure_id_product_id_key";

-- AlterTable
ALTER TABLE "inventory_closure_detail" ADD COLUMN     "expiration_date" TIMESTAMP(6);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_closure_detail_closure_id_product_id_expiration_d_key" ON "inventory_closure_detail"("closure_id", "product_id", "expiration_date");

