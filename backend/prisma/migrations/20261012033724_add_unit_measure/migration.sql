-- CreateTable
CREATE TABLE "unit_measure" (
    "id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "abreviation" VARCHAR(10) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "unit_measure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "unit_measure_name_key" ON "unit_measure"("name");

-- CreateIndex
CREATE UNIQUE INDEX "unit_measure_abreviation_key" ON "unit_measure"("abreviation");
