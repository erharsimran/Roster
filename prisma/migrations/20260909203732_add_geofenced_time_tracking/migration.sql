/*
  Warnings:

  - You are about to drop the column `clock_in_verified` on the `time_entries` table. All the data in the column will be lost.
  - You are about to drop the column `created_via` on the `time_entries` table. All the data in the column will be lost.
  - You are about to drop the column `synced_at` on the `time_entries` table. All the data in the column will be lost.
  - You are about to alter the column `clock_in_lat` on the `time_entries` table. The data in that column could be lost. The data in that column will be cast from `Decimal(9,6)` to `DoublePrecision`.
  - You are about to alter the column `clock_in_lng` on the `time_entries` table. The data in that column could be lost. The data in that column will be cast from `Decimal(9,6)` to `DoublePrecision`.
  - Added the required column `clock_in_distance` to the `time_entries` table without a default value. This is not possible if the table is not empty.
  - Added the required column `org_id` to the `time_entries` table without a default value. This is not possible if the table is not empty.
  - Made the column `clock_in_lat` on table `time_entries` required. This step will fail if there are existing NULL values in that column.
  - Made the column `clock_in_lng` on table `time_entries` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "TimeEntryStatus" AS ENUM ('active', 'completed', 'flagged', 'approved');

-- DropForeignKey
ALTER TABLE "time_entries" DROP CONSTRAINT "time_entries_location_id_fkey";

-- DropForeignKey
ALTER TABLE "time_entries" DROP CONSTRAINT "time_entries_user_id_fkey";

-- DropIndex
DROP INDEX "time_entries_user_id_clock_in_idx";

-- AlterTable
ALTER TABLE "locations" ADD COLUMN     "geofence_radius_meters" INTEGER NOT NULL DEFAULT 150,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "time_entries" DROP COLUMN "clock_in_verified",
DROP COLUMN "created_via",
DROP COLUMN "synced_at",
ADD COLUMN     "clock_in_distance" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "clock_out_distance" DOUBLE PRECISION,
ADD COLUMN     "clock_out_lat" DOUBLE PRECISION,
ADD COLUMN     "clock_out_lng" DOUBLE PRECISION,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "org_id" TEXT NOT NULL,
ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "reviewed_by" TEXT,
ADD COLUMN     "status" "TimeEntryStatus" NOT NULL DEFAULT 'active',
ADD COLUMN     "variance_minutes" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "clock_in_lat" SET NOT NULL,
ALTER COLUMN "clock_in_lat" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "clock_in_lng" SET NOT NULL,
ALTER COLUMN "clock_in_lng" SET DATA TYPE DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "time_entries_location_id_clock_in_idx" ON "time_entries"("location_id", "clock_in");

-- CreateIndex
CREATE INDEX "time_entries_user_id_status_idx" ON "time_entries"("user_id", "status");

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
