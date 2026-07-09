/*
  Warnings:

  - A unique constraint covering the columns `[email]` on the table `form_submissions` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "churches_geog_gist_idx";

-- AlterTable
ALTER TABLE "form_submissions" ADD COLUMN     "ip_address" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "form_submissions_email_key" ON "form_submissions"("email");
