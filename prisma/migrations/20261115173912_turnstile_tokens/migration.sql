-- Huellas de los tokens de Cloudflare Turnstile recibidos en los últimos 300 s: cada token se acepta una sola vez
-- (RF-20 a RF-23 de la 005; plan de la 005, D-3)
-- CreateTable
CREATE TABLE "turnstile_tokens" (
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "turnstile_tokens_pkey" PRIMARY KEY ("token_hash")
);

-- CreateIndex
CREATE INDEX "turnstile_tokens_expires_at_idx" ON "turnstile_tokens"("expires_at");

