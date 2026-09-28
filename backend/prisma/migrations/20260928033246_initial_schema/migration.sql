-- CreateTable
CREATE TABLE "role" (
    "id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "description" VARCHAR(255),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_type" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "document_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person" (
    "id" UUID NOT NULL,
    "document_type_id" UUID,
    "document_number" VARCHAR(50),
    "first_name" VARCHAR(100),
    "last_name" VARCHAR(100),
    "business_name" VARCHAR(200),
    "email" VARCHAR(150),
    "phone" VARCHAR(30),
    "address" VARCHAR(255),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_account" (
    "person_id" UUID NOT NULL,
    "password_hash" VARCHAR(255),
    "role_id" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "activation_token" VARCHAR(255),
    "activation_token_expires_at" TIMESTAMP(6),
    "password_reset_token" VARCHAR(255),
    "password_reset_token_expires_at" TIMESTAMP(6),
    "last_login_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "user_account_pkey" PRIMARY KEY ("person_id")
);

-- CreateTable
CREATE TABLE "customer" (
    "person_id" UUID NOT NULL,
    "full_name" VARCHAR(200),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "customer_pkey" PRIMARY KEY ("person_id")
);

-- CreateTable
CREATE TABLE "supplier" (
    "person_id" UUID NOT NULL,
    "commercial_name" VARCHAR(200),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "supplier_pkey" PRIMARY KEY ("person_id")
);

-- CreateTable
CREATE TABLE "branch" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "address" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(30) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_branch" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "assignment_date" DATE NOT NULL,
    "end_date" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "user_branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "entity" VARCHAR(50) NOT NULL,
    "entity_id" UUID NOT NULL,
    "old_data" JSON,
    "new_data" JSON,
    "reason" TEXT NOT NULL,
    "ip_address" VARCHAR(45),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "role_name_key" ON "role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "document_type_code_key" ON "document_type"("code");

-- CreateIndex
CREATE UNIQUE INDEX "person_document_type_id_document_number_key" ON "person"("document_type_id", "document_number");

-- CreateIndex
CREATE UNIQUE INDEX "user_account_activation_token_key" ON "user_account"("activation_token");

-- CreateIndex
CREATE UNIQUE INDEX "user_account_password_reset_token_key" ON "user_account"("password_reset_token");

-- CreateIndex
CREATE UNIQUE INDEX "user_branch_user_id_branch_id_assignment_date_key" ON "user_branch"("user_id", "branch_id", "assignment_date");

-- AddForeignKey
ALTER TABLE "person" ADD CONSTRAINT "person_document_type_id_fkey" FOREIGN KEY ("document_type_id") REFERENCES "document_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_account" ADD CONSTRAINT "user_account_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_account" ADD CONSTRAINT "user_account_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer" ADD CONSTRAINT "customer_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_branch" ADD CONSTRAINT "user_branch_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_account"("person_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_branch" ADD CONSTRAINT "user_branch_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_account"("person_id") ON DELETE RESTRICT ON UPDATE CASCADE;
