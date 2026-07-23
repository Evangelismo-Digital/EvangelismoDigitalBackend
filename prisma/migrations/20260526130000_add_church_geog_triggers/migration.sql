-- Enable PostGIS (safe & idempotent)
CREATE EXTENSION IF NOT EXISTS postgis;

-- Add geog column if it doesn't exist (assuming it's created via Prisma schema)
-- Note: Prisma schema defines geog as Unsupported("geography(Point, 4326)"), so ensure it's added in migration

-- Create or replace trigger function to calculate geog on insert/update
CREATE OR REPLACE FUNCTION update_church_geog() RETURNS TRIGGER AS $$
BEGIN
    NEW.geog := ST_SetSRID(ST_MakePoint(NEW.lon, NEW.lat), 4326)::geography;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers to auto-calculate geog for inserts and lat/lon changes
DROP TRIGGER IF EXISTS trg_update_church_geog_insert ON churches;
DROP TRIGGER IF EXISTS trg_update_church_geog_update ON churches;

CREATE TRIGGER trg_update_church_geog_insert
BEFORE INSERT ON churches
FOR EACH ROW EXECUTE PROCEDURE update_church_geog();

CREATE TRIGGER trg_update_church_geog_update
BEFORE UPDATE OF lat, lon ON churches
FOR EACH ROW
WHEN (OLD.lat IS DISTINCT FROM NEW.lat OR OLD.lon IS DISTINCT FROM NEW.lon)
EXECUTE PROCEDURE update_church_geog();

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
