-- Cuentas de usuario (sdd/002-user-accounts).
-- RF-33: los datos de la 001 pertenecen a identificadores X-User-Id sin cuenta y no pueden asociarse a
-- ninguna; se vacían antes de convertir user_id en UUID con clave foránea a users (excepción del
-- principio IV declarada en el plan de la 002, sección 2)
TRUNCATE TABLE "tasks", "alerts", "alert_period_checks", "user_time_zones";

-- AlterTable
ALTER TABLE "alert_period_checks" DROP CONSTRAINT "alert_period_checks_pkey",
DROP COLUMN "user_id",
ADD COLUMN     "user_id" UUID NOT NULL,
ADD CONSTRAINT "alert_period_checks_pkey" PRIMARY KEY ("user_id", "type", "period_start");

-- AlterTable
ALTER TABLE "alerts" DROP COLUMN "user_id",
ADD COLUMN     "user_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "tasks" DROP COLUMN "user_id",
ADD COLUMN     "user_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "user_time_zones" DROP CONSTRAINT "user_time_zones_pkey",
DROP COLUMN "user_id",
ADD COLUMN     "user_id" UUID NOT NULL,
ADD CONSTRAINT "user_time_zones_pkey" PRIMARY KEY ("user_id");

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(254) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "name" VARCHAR(100),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "generation" INTEGER NOT NULL DEFAULT 0,
    "access_token_hash" CHAR(64) NOT NULL,
    "csrf_token_hash" CHAR(64) NOT NULL,
    "access_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "refresh_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "rotated_at" TIMESTAMPTZ(3),
    "grace_tokens" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "token_hash" CHAR(64) NOT NULL,
    "session_id" UUID NOT NULL,
    "generation" INTEGER NOT NULL,
    "rotated_at" TIMESTAMPTZ(3),

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("token_hash")
);

-- CreateTable
CREATE TABLE "csrf_tokens" (
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "csrf_tokens_pkey" PRIMARY KEY ("token_hash")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "email" VARCHAR(254) NOT NULL,
    "failed_at" TIMESTAMPTZ(3)[],
    "locked_until" TIMESTAMPTZ(3),

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("email")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_access_token_hash_key" ON "sessions"("access_token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "sessions_refresh_expires_at_idx" ON "sessions"("refresh_expires_at");

-- CreateIndex
CREATE INDEX "refresh_tokens_session_id_idx" ON "refresh_tokens"("session_id");

-- CreateIndex
CREATE INDEX "csrf_tokens_expires_at_idx" ON "csrf_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "alerts_user_id_created_at_id_idx" ON "alerts"("user_id", "created_at" DESC, "id");

-- CreateIndex
CREATE UNIQUE INDEX "alerts_user_id_type_period_start_key" ON "alerts"("user_id", "type", "period_start");

-- CreateIndex
CREATE INDEX "tasks_user_id_date_sequence_idx" ON "tasks"("user_id", "date", "sequence");

-- CreateIndex
CREATE INDEX "tasks_user_id_completed_date_idx" ON "tasks"("user_id", "completed", "date");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_period_checks" ADD CONSTRAINT "alert_period_checks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_time_zones" ADD CONSTRAINT "user_time_zones_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

