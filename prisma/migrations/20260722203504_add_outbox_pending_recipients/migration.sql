-- AlterTable
ALTER TABLE "outbox_events" ADD COLUMN     "pending_recipients" TEXT[] DEFAULT ARRAY[]::TEXT[];
