-- AlterTable
ALTER TABLE "earning" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "job_card" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "project" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "stage" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "user" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "idempotency_record" (
    "key" VARCHAR(120) NOT NULL,
    "user_id" UUID NOT NULL,
    "endpoint" VARCHAR(200) NOT NULL,
    "request_hash" VARCHAR(64) NOT NULL,
    "status_code" INTEGER NOT NULL,
    "response" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_record_pkey" PRIMARY KEY ("user_id","key")
);

-- CreateIndex
CREATE INDEX "idempotency_record_created_at_idx" ON "idempotency_record"("created_at");
