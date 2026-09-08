/*
  Warnings:

  - You are about to drop the column `location_id` on the `positions` table. All the data in the column will be lost.
  - Added the required column `org_id` to the `positions` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "positions" DROP CONSTRAINT "positions_location_id_fkey";

-- AlterTable
ALTER TABLE "positions" DROP COLUMN "location_id",
ADD COLUMN     "org_id" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "positions_org_id_idx" ON "positions"("org_id");

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
