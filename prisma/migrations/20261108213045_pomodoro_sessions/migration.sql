-- Sesiones pomodoro (sdd/004): sesiones, tareas propias y logros, todo en cascada con la cuenta (plan de la 004, sección 4)

-- CreateEnum
CREATE TYPE "pomodoro_status" AS ENUM ('running', 'paused', 'finished');

-- CreateEnum
CREATE TYPE "pomodoro_end_reason" AS ENUM ('time', 'manual');

-- CreateTable
CREATE TABLE "pomodoros" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "active_user_id" UUID,
    "duration_minutes" SMALLINT NOT NULL,
    "status" "pomodoro_status" NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3),
    "remaining_ms" INTEGER,
    "finished_at" TIMESTAMPTZ(3),
    "finished_on" DATE,
    "end_reason" "pomodoro_end_reason",
    "focused_seconds" INTEGER,
    "tasks_snapshot" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pomodoros_pkey" PRIMARY KEY ("id"),
    -- Duración entre 1 y 120 minutos (RF-09 de la 004). Prisma no modela los CHECK: se añade a mano
    CONSTRAINT "pomodoros_duration_minutes_check" CHECK ("duration_minutes" BETWEEN 1 AND 120)
);

-- CreateTable
CREATE TABLE "pomodoro_tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "pomodoro_id" UUID,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(1000),
    "date" DATE NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMPTZ(3),
    "position" INTEGER,
    "sequence" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pomodoro_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pomodoro_achievements" (
    "user_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "unlocked_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pomodoro_achievements_pkey" PRIMARY KEY ("user_id","code")
);

-- CreateIndex
CREATE UNIQUE INDEX "pomodoros_active_user_id_key" ON "pomodoros"("active_user_id");

-- CreateIndex
CREATE INDEX "pomodoros_user_id_started_at_id_idx" ON "pomodoros"("user_id", "started_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "pomodoros_status_ends_at_idx" ON "pomodoros"("status", "ends_at");

-- CreateIndex
CREATE INDEX "pomodoros_user_id_end_reason_finished_on_idx" ON "pomodoros"("user_id", "end_reason", "finished_on");

-- CreateIndex
CREATE UNIQUE INDEX "pomodoro_tasks_sequence_key" ON "pomodoro_tasks"("sequence");

-- CreateIndex
CREATE INDEX "pomodoro_tasks_user_id_pomodoro_id_completed_date_sequence_idx" ON "pomodoro_tasks"("user_id", "pomodoro_id", "completed", "date", "sequence");

-- CreateIndex
CREATE INDEX "pomodoro_tasks_pomodoro_id_position_idx" ON "pomodoro_tasks"("pomodoro_id", "position");

-- CreateIndex
CREATE INDEX "pomodoro_tasks_user_id_completed_idx" ON "pomodoro_tasks"("user_id", "completed");

-- AddForeignKey
ALTER TABLE "pomodoros" ADD CONSTRAINT "pomodoros_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pomodoro_tasks" ADD CONSTRAINT "pomodoro_tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pomodoro_tasks" ADD CONSTRAINT "pomodoro_tasks_pomodoro_id_fkey" FOREIGN KEY ("pomodoro_id") REFERENCES "pomodoros"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pomodoro_achievements" ADD CONSTRAINT "pomodoro_achievements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

