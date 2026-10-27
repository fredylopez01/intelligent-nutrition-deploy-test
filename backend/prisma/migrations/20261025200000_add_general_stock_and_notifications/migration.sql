-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('LOW_STOCK', 'CLOSURE_NOT_CONFIRMED', 'PURCHASE_PENDING_RECEIPT');

-- AlterTable
ALTER TABLE "inventory_movement" ADD COLUMN     "expiration_date" TIMESTAMP(6);

-- CreateTable
CREATE TABLE "general_stock" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "expiration_date" TIMESTAMP(6) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "general_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "branch_id" UUID,
    "product_id" UUID,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "general_stock_product_id_idx" ON "general_stock"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "general_stock_product_id_expiration_date_key" ON "general_stock"("product_id", "expiration_date");

-- CreateIndex
CREATE INDEX "notification_user_id_read_created_at_idx" ON "notification"("user_id", "read", "created_at");

-- AddForeignKey
ALTER TABLE "general_stock" ADD CONSTRAINT "general_stock_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_account"("person_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

