-- Token CSRF de la sesión en GET /me (sdd/003-session-csrf-on-me).
-- RF-04: las sesiones abiertas no tienen copia cifrada de su token CSRF y no podrían devolverlo; se cierran
-- antes de añadir la columna obligatoria. Sus refresh tokens se borran en cascada
DELETE FROM "sessions";

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "csrf_token_sealed" TEXT NOT NULL;
