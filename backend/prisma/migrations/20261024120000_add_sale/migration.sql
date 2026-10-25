-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('COMPLETED', 'REVERSED');

-- CreateTable
CREATE TABLE "sale" (
    "id" UUID NOT NULL,
    "sale_number" VARCHAR(30) NOT NULL,
    "branch_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "customer_id" UUID,
    "sale_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discount_amount" DECIMAL(12,2) NOT NULL,
    "tax_amount" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "status" "SaleStatus" NOT NULL DEFAULT 'COMPLETED',
    "reversal_reason" TEXT,
    "reversed_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_detail" (
    "id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discount_amount" DECIMAL(12,2) NOT NULL,
    "tax_amount" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "sale_detail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_payment" (
    "id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "payment_method_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reference" VARCHAR(100),
    "paid_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sale_branch_id_sale_number_key" ON "sale"("branch_id", "sale_number");

-- CreateIndex
CREATE INDEX "sale_branch_id_idx" ON "sale"("branch_id");

-- CreateIndex
CREATE INDEX "sale_user_id_idx" ON "sale"("user_id");

-- CreateIndex
CREATE INDEX "sale_customer_id_idx" ON "sale"("customer_id");

-- CreateIndex
CREATE INDEX "sale_sale_at_idx" ON "sale"("sale_at");

-- CreateIndex
CREATE INDEX "sale_status_idx" ON "sale"("status");

-- CreateIndex
CREATE INDEX "sale_detail_sale_id_idx" ON "sale_detail"("sale_id");

-- CreateIndex
CREATE INDEX "sale_detail_product_id_idx" ON "sale_detail"("product_id");

-- CreateIndex
CREATE INDEX "sale_payment_sale_id_idx" ON "sale_payment"("sale_id");

-- CreateIndex
CREATE INDEX "sale_payment_payment_method_id_idx" ON "sale_payment"("payment_method_id");

-- CreateIndex
CREATE INDEX "inventory_movement_sale_id_idx" ON "inventory_movement"("sale_id");

-- AddForeignKey
ALTER TABLE "sale" ADD CONSTRAINT "sale_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale" ADD CONSTRAINT "sale_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_account"("person_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale" ADD CONSTRAINT "sale_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("person_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_detail" ADD CONSTRAINT "sale_detail_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_detail" ADD CONSTRAINT "sale_detail_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_payment" ADD CONSTRAINT "sale_payment_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_payment" ADD CONSTRAINT "sale_payment_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "payment_method"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
