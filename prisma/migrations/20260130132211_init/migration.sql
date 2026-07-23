-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateEnum
CREATE TYPE "AuthenticationStatus" AS ENUM ('SUCCESS', 'USER_NOT_EXISTS', 'INCORRECT_PASSWORD', 'RECOVER_PASSWORD', 'INVALID_TOKEN', 'BLOCKED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'DEFAULT');

-- CreateTable
CREATE TABLE "authentication_audit" (
    "id" TEXT NOT NULL,
    "ip_address" TEXT,
    "remote_port" TEXT,
    "user_agent" TEXT,
    "origin" TEXT,
    "status" "AuthenticationStatus" NOT NULL,
    "user_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "authentication_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "login_attempts" INTEGER NOT NULL DEFAULT 0,
    "last_login" TIMESTAMP(3),
    "role" "UserRole" NOT NULL DEFAULT 'DEFAULT',
    "token" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "password_changed_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_submissions" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "decisaoPorCristo" BOOLEAN NOT NULL,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "form_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "churches" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "geog" geography(Point, 4326),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "churches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_auth_audit_user_date" ON "authentication_audit"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_public_id_key" ON "users"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_cpf_key" ON "users"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "users_token_key" ON "users"("token");

-- CreateIndex
CREATE INDEX "idx_user_name" ON "users"("name");

-- CreateIndex
CREATE INDEX "idx_user_token" ON "users"("token");

-- CreateIndex
CREATE UNIQUE INDEX "form_submissions_public_id_key" ON "form_submissions"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "churches_public_id_key" ON "churches"("public_id");

-- AddForeignKey
ALTER TABLE "authentication_audit" ADD CONSTRAINT "authentication_audit_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
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