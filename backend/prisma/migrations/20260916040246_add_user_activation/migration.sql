/*
  Warnings:

  - A unique constraint covering the columns `[activation_token_hash]` on the table `user_account` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "user_account" ADD COLUMN     "activation_token_expires_at" TIMESTAMP(6),
ADD COLUMN     "activation_token_hash" VARCHAR(255),
ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "password_hash" DROP NOT NULL;

UPDATE "user_account"
SET "must_change_password" = false
WHERE "password_hash" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "user_account_activation_token_hash_key" ON "user_account"("activation_token_hash");
