-- AlterTable
ALTER TABLE "locations" ADD COLUMN     "operating_hours" JSONB,
ADD COLUMN     "require_leadership_on_duty" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "positions" ADD COLUMN     "is_leadership" BOOLEAN NOT NULL DEFAULT false;
