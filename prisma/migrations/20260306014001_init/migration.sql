-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateEnum
CREATE TYPE "OutboxEventType" AS ENUM ('PENDING', 'SENDING');

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "OutboxEventType" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "ocurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sending_at" TIMESTAMP(3),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_public_id_key" ON "outbox_events"("public_id");

-- CreateIndex
CREATE INDEX "outbox_events_status_ocurred_at_idx" ON "outbox_events"("status", "ocurred_at");

-- CreateIndex
CREATE INDEX "outbox_events_status_sending_at_idx" ON "outbox_events"("status", "sending_at");

-- Enable PostGIS (safe & idempotent)
CREATE EXTENSION IF NOT EXISTS postgis;

-- Add geog column if it doesn't exist (assuming it's created via Prisma schema)
-- Note: Prisma schema defines geog as Unsupported("geography(Point, 4326)")?, so ensure it's added in migration

-- Create or replace trigger function to calculate geog on insert/update
CREATE OR REPLACE FUNCTION update_church_geog() RETURNS TRIGGER AS $$
BEGIN
    NEW.geog := ST_SetSRID(ST_MakePoint(NEW.lon, NEW.lat), 4326)::geography;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-calculate geog for seed inserts and individual church inserts
DROP TRIGGER IF EXISTS trg_update_church_geog ON churches;
CREATE TRIGGER trg_update_church_geog BEFORE INSERT OR UPDATE ON churches
FOR EACH ROW EXECUTE PROCEDURE update_church_geog();

-- Spatial index (created once, reused forever)
CREATE INDEX IF NOT EXISTS churches_geog_gist_idx
ON churches
USING GIST (geog);

-- 1) Case-sensitive unique index on church name
CREATE UNIQUE INDEX IF NOT EXISTS churches_unique_lower_name_idx
ON churches ((lower(trim(name))));

-- 2) Approximate unique coordinates 
-- Acts as a "grid" to prevent identical coordinates from being inserted simultaneously.
-- Using 7 decimal places creates a grid.
CREATE UNIQUE INDEX IF NOT EXISTS churches_unique_rounded_coords_idx
ON churches (round(lat::numeric, 6), round(lon::numeric, 6));

-- Optional documentation
COMMENT ON COLUMN churches.geog
IS 'Auto-calculated geography point derived from lat/lon via trigger';