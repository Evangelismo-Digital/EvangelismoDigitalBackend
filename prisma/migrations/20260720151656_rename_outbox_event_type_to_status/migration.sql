-- Renomeia o enum "OutboxEventType" (que modela o *status* do evento) para
-- "OutboxEventStatus", refletindo seu significado real. Renomear preserva os
-- valores e a coluna existentes (sem perda de dados).
ALTER TYPE "OutboxEventType" RENAME TO "OutboxEventStatus";
