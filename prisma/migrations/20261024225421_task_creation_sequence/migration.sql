-- DropIndex
DROP INDEX "tasks_user_id_date_created_at_id_idx";

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "sequence" BIGSERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "tasks_sequence_key" ON "tasks"("sequence");

-- CreateIndex
CREATE INDEX "tasks_user_id_date_sequence_idx" ON "tasks"("user_id", "date", "sequence");

