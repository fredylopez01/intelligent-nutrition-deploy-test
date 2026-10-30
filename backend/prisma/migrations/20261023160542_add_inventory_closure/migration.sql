-- CreateEnum
CREATE TYPE "InventoryClosureStatus" AS ENUM ('PENDING', 'CONFIRMED', 'NOT_CONFIRMED');

-- CreateTable
CREATE TABLE "inventory_closure" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "user_id" UUID,
    "closure_date" DATE NOT NULL,
    "status" "InventoryClosureStatus" NOT NULL DEFAULT 'PENDING',
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "closed_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "inventory_closure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_closure_detail" (
    "id" UUID NOT NULL,
    "closure_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "system_quantity" INTEGER NOT NULL,
    "physical_quantity" INTEGER,
    "difference" INTEGER,
    "observation" TEXT,

    CONSTRAINT "inventory_closure_detail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_closure_branch_id_idx" ON "inventory_closure"("branch_id");

-- CreateIndex
CREATE INDEX "inventory_closure_closure_date_idx" ON "inventory_closure"("closure_date");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_closure_branch_id_closure_date_key" ON "inventory_closure"("branch_id", "closure_date");

-- CreateIndex
CREATE INDEX "inventory_closure_detail_closure_id_idx" ON "inventory_closure_detail"("closure_id");

-- CreateIndex
CREATE INDEX "inventory_closure_detail_product_id_idx" ON "inventory_closure_detail"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_closure_detail_closure_id_product_id_key" ON "inventory_closure_detail"("closure_id", "product_id");

-- AddForeignKey
ALTER TABLE "inventory_closure" ADD CONSTRAINT "inventory_closure_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_closure" ADD CONSTRAINT "inventory_closure_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_account"("person_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_closure_detail" ADD CONSTRAINT "inventory_closure_detail_closure_id_fkey" FOREIGN KEY ("closure_id") REFERENCES "inventory_closure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_closure_detail" ADD CONSTRAINT "inventory_closure_detail_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
