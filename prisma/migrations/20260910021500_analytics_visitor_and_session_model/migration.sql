-- Analytics: introduz AnalyticsVisitor e reescreve o modelo de sessão/evento.
--
-- Ver docs/analytics-cookie-architecture.md §6.
--
-- POR QUE AS LINHAS ANTIGAS SÃO APAGADAS, E NÃO MIGRADAS:
--
-- O modelo anterior não tem como produzir os dados que o novo exige. Cada
-- `analytics_sessions.visitor_id` passa a referenciar `analytics_visitors`, e
-- não existe linha de visitante para nenhum deles; `first_seen_at` só poderia
-- ser aproximado por `MIN(created_at)`, e `user_agent` — a única fonte para
-- browser/os/device — é descartado por minimização (§5.2). Um backfill
-- produziria visitantes sintéticos com datas aproximadas: pior do que nenhum
-- dado, porque pareceria verdadeiro num dashboard.
--
-- A decisão foi tomada explicitamente: não há dados de produção a preservar.
--
-- O TRUNCATE também é o que torna esta migração DETERMINÍSTICA. Sem ele, os dois
-- comandos abaixo falhariam em qualquer banco com linhas:
--   1. ADD COLUMN "last_seen_at" ... NOT NULL, sem DEFAULT (@updatedAt);
--   2. a FK analytics_sessions -> analytics_visitors, sem visitante correspondente.
-- Depender de a tabela "por acaso" estar vazia é o tipo de suposição que só
-- aparece no deploy.

TRUNCATE TABLE "analytics_events", "analytics_sessions";


-- DropIndex
DROP INDEX "analytics_events_event_type_idx";

-- AlterTable
ALTER TABLE "analytics_events" ADD COLUMN     "duration_ms" INTEGER,
ADD COLUMN     "referrer" TEXT,
ADD COLUMN     "scroll_depth" INTEGER,
ADD COLUMN     "title" TEXT;

-- AlterTable
ALTER TABLE "analytics_sessions" DROP COLUMN "created_at",
DROP COLUMN "user_agent",
ADD COLUMN     "browser" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "device" TEXT,
ADD COLUMN     "duration_ms" INTEGER,
ADD COLUMN     "ended_at" TIMESTAMP(3),
ADD COLUMN     "event_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "exit_path" TEXT,
ADD COLUMN     "is_bounce" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "landing_path" TEXT,
ADD COLUMN     "language" TEXT,
ADD COLUMN     "last_seen_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "os" TEXT,
ADD COLUMN     "page_view_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "referrer" TEXT,
ADD COLUMN     "region" TEXT,
ADD COLUMN     "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "user_id" TEXT;

-- CreateTable
CREATE TABLE "analytics_visitors" (
    "id" TEXT NOT NULL,
    "visitor_id" TEXT NOT NULL,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "session_count" INTEGER NOT NULL DEFAULT 1,
    "first_utm_source" TEXT,
    "first_utm_medium" TEXT,
    "first_utm_campaign" TEXT,
    "first_landing_path" TEXT,
    "user_id" TEXT,

    CONSTRAINT "analytics_visitors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "analytics_visitors_visitor_id_key" ON "analytics_visitors"("visitor_id");

-- CreateIndex
CREATE INDEX "analytics_visitors_user_id_idx" ON "analytics_visitors"("user_id");

-- CreateIndex
CREATE INDEX "analytics_visitors_last_seen_at_idx" ON "analytics_visitors"("last_seen_at");

-- CreateIndex
CREATE INDEX "analytics_events_event_type_occurred_at_idx" ON "analytics_events"("event_type", "occurred_at");

-- CreateIndex
CREATE INDEX "analytics_events_path_idx" ON "analytics_events"("path");

-- CreateIndex
CREATE INDEX "analytics_sessions_user_id_idx" ON "analytics_sessions"("user_id");

-- CreateIndex
CREATE INDEX "analytics_sessions_started_at_idx" ON "analytics_sessions"("started_at");

-- CreateIndex
CREATE INDEX "analytics_sessions_utm_campaign_idx" ON "analytics_sessions"("utm_campaign");

-- AddForeignKey
ALTER TABLE "analytics_visitors" ADD CONSTRAINT "analytics_visitors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("public_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_sessions" ADD CONSTRAINT "analytics_sessions_visitor_id_fkey" FOREIGN KEY ("visitor_id") REFERENCES "analytics_visitors"("visitor_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_sessions" ADD CONSTRAINT "analytics_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("public_id") ON DELETE SET NULL ON UPDATE CASCADE;

