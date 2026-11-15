-- CreateEnum
CREATE TYPE "alert_type" AS ENUM ('daily', 'weekly', 'monthly');

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(1000),
    "date" DATE NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "type" "alert_type" NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "tasks" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_period_checks" (
    "user_id" TEXT NOT NULL,
    "type" "alert_type" NOT NULL,
    "period_start" DATE NOT NULL,
    "checked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_period_checks_pkey" PRIMARY KEY ("user_id","type","period_start")
);

-- CreateTable
CREATE TABLE "user_time_zones" (
    "user_id" TEXT NOT NULL,
    "time_zone" VARCHAR(64) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_time_zones_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE INDEX "tasks_user_id_date_created_at_id_idx" ON "tasks"("user_id", "date", "created_at", "id");

-- CreateIndex
CREATE INDEX "tasks_user_id_completed_date_idx" ON "tasks"("user_id", "completed", "date");

-- CreateIndex
CREATE INDEX "alerts_user_id_created_at_id_idx" ON "alerts"("user_id", "created_at" DESC, "id");

-- CreateIndex
CREATE UNIQUE INDEX "alerts_user_id_type_period_start_key" ON "alerts"("user_id", "type", "period_start");
