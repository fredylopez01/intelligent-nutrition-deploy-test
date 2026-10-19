-- AlterTable
ALTER TABLE "product_image" ALTER COLUMN "size_bytes" SET DATA TYPE BIGINT;

-- RenameIndex
ALTER INDEX "product_image_product_id_idx" RENAME TO "idx_product_image_product_id";
