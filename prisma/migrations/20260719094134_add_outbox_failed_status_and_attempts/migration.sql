-- AlterEnum
ALTER TYPE "OutboxEventType" ADD VALUE 'FAILED';

-- AlterTable
ALTER TABLE "outbox_events" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
