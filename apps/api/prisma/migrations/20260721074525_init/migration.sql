-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'CARPENTER', 'PAINTER', 'SUPERVISOR');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "StageType" AS ENUM ('CARPENTRY', 'PAINTING');

-- CreateEnum
CREATE TYPE "StageStatus" AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'READY_FOR_INSPECTION', 'APPROVED', 'REJECTED', 'PRICE_PROPOSED', 'PRICE_DECLINED', 'PRICE_ACCEPTED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PricingAction" AS ENUM ('PROPOSED', 'REVISED', 'ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "EarningStatus" AS ENUM ('UNPAID', 'PAID');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('DESIGN');

-- CreateEnum
CREATE TYPE "NotificationEvent" AS ENUM ('STAGE_ASSIGNED', 'READY_FOR_INSPECTION', 'INSPECTION_APPROVED', 'INSPECTION_REJECTED', 'PRICE_PROPOSED', 'PRICE_REVISED', 'PRICE_ACCEPTED', 'PRICE_DECLINED', 'EARNING_PAID');

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(20),
    "role" "Role" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "password_hash" VARCHAR(60) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_token" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "family_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" VARCHAR(120) NOT NULL,
    "client" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "deadline" TIMESTAMPTZ(6),
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_card" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "project_id" UUID NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "job_card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachment" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "job_card_id" UUID NOT NULL,
    "file_ref" VARCHAR(500) NOT NULL,
    "kind" "AttachmentKind" NOT NULL DEFAULT 'DESIGN',
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stage" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "job_card_id" UUID NOT NULL,
    "type" "StageType" NOT NULL,
    "sequence_no" INTEGER NOT NULL,
    "assignee_id" UUID,
    "status" "StageStatus" NOT NULL DEFAULT 'ASSIGNED',
    "accepted_price" BIGINT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "rejection_reason" VARCHAR(500),
    "approved_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "stage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_history" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "stage_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "action" "PricingAction" NOT NULL,
    "value" BIGINT,
    "reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pricing_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_photo" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "stage_id" UUID NOT NULL,
    "supervisor_id" UUID NOT NULL,
    "file_ref" VARCHAR(500) NOT NULL,
    "thumb_ref" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspection_photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "earning" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "stage_id" UUID NOT NULL,
    "worker_id" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "status" "EarningStatus" NOT NULL DEFAULT 'UNPAID',
    "paid_date" TIMESTAMPTZ(6),
    "paid_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "earning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "recipient_id" UUID NOT NULL,
    "event_type" "NotificationEvent" NOT NULL,
    "ref_type" VARCHAR(40) NOT NULL,
    "ref_id" UUID NOT NULL,
    "payload" JSONB,
    "read_flag" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "actor_id" UUID,
    "action" VARCHAR(80) NOT NULL,
    "entity" VARCHAR(60) NOT NULL,
    "entity_id" UUID,
    "meta" JSONB,
    "ip" VARCHAR(45),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_phone_key" ON "user"("phone");

-- CreateIndex
CREATE INDEX "user_role_status_idx" ON "user"("role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_token_token_hash_key" ON "refresh_token"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_token_user_id_revoked_at_idx" ON "refresh_token"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "refresh_token_family_id_idx" ON "refresh_token"("family_id");

-- CreateIndex
CREATE INDEX "project_status_idx" ON "project"("status");

-- CreateIndex
CREATE INDEX "job_card_project_id_idx" ON "job_card"("project_id");

-- CreateIndex
CREATE INDEX "attachment_job_card_id_idx" ON "attachment"("job_card_id");

-- CreateIndex
CREATE INDEX "stage_status_idx" ON "stage"("status");

-- CreateIndex
CREATE INDEX "stage_assignee_id_status_idx" ON "stage"("assignee_id", "status");

-- CreateIndex
CREATE INDEX "stage_job_card_id_sequence_no_idx" ON "stage"("job_card_id", "sequence_no");

-- CreateIndex
CREATE UNIQUE INDEX "stage_job_card_id_type_key" ON "stage"("job_card_id", "type");

-- CreateIndex
CREATE INDEX "pricing_history_stage_id_created_at_idx" ON "pricing_history"("stage_id", "created_at");

-- CreateIndex
CREATE INDEX "inspection_photo_stage_id_idx" ON "inspection_photo"("stage_id");

-- CreateIndex
CREATE UNIQUE INDEX "earning_stage_id_key" ON "earning"("stage_id");

-- CreateIndex
CREATE INDEX "earning_worker_id_status_created_at_idx" ON "earning"("worker_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "notification_recipient_id_read_flag_idx" ON "notification"("recipient_id", "read_flag");

-- CreateIndex
CREATE INDEX "audit_log_actor_id_created_at_idx" ON "audit_log"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_entity_entity_id_idx" ON "audit_log"("entity", "entity_id");

-- AddForeignKey
ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_card" ADD CONSTRAINT "job_card_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_job_card_id_fkey" FOREIGN KEY ("job_card_id") REFERENCES "job_card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage" ADD CONSTRAINT "stage_job_card_id_fkey" FOREIGN KEY ("job_card_id") REFERENCES "job_card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage" ADD CONSTRAINT "stage_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_history" ADD CONSTRAINT "pricing_history_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "stage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_history" ADD CONSTRAINT "pricing_history_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_photo" ADD CONSTRAINT "inspection_photo_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "stage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_photo" ADD CONSTRAINT "inspection_photo_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earning" ADD CONSTRAINT "earning_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "stage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earning" ADD CONSTRAINT "earning_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earning" ADD CONSTRAINT "earning_paid_by_fkey" FOREIGN KEY ("paid_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
