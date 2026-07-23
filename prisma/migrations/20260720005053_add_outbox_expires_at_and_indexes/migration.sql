-- AlterTable
ALTER TABLE "outbox_events" ADD COLUMN     "expires_at" TIMESTAMP(3);

-- CreateIndex (varredura de retenção; coluna com typo histórico "ocurred_at")
CREATE INDEX "outbox_events_ocurred_at_idx" ON "outbox_events"("ocurred_at");

-- CreateIndex
-- Índice parcial (editado manualmente): só eventos com expiração — eventos de
-- formulário ficam com expires_at NULL e não entram no índice.
CREATE INDEX "outbox_events_expires_at_idx" ON "outbox_events"("expires_at") WHERE "expires_at" IS NOT NULL;

-- Higiene: tokens de reset em texto puro emitidos antes do hashing at-rest nunca
-- casariam com a busca por hash pós-deploy; invalida os remanescentes.
UPDATE "users" SET "token" = NULL, "token_expires_at" = NULL WHERE "token" IS NOT NULL;
