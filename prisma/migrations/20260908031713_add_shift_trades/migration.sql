/*
  Warnings:

  - You are about to drop the `shift_swap_requests` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "TradeType" AS ENUM ('swap', 'drop');

-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('pending_peer', 'pending_manager', 'approved', 'rejected', 'cancelled');

-- DropForeignKey
ALTER TABLE "shift_swap_requests" DROP CONSTRAINT "shift_swap_requests_covering_user_id_fkey";

-- DropForeignKey
ALTER TABLE "shift_swap_requests" DROP CONSTRAINT "shift_swap_requests_requesting_user_id_fkey";

-- DropForeignKey
ALTER TABLE "shift_swap_requests" DROP CONSTRAINT "shift_swap_requests_shift_id_fkey";

-- DropTable
DROP TABLE "shift_swap_requests";

-- CreateTable
CREATE TABLE "shift_trades" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "source_user_id" TEXT NOT NULL,
    "target_user_id" TEXT,
    "target_shift_id" TEXT,
    "type" "TradeType" NOT NULL,
    "status" "TradeStatus" NOT NULL DEFAULT 'pending_manager',
    "manager_approved" BOOLEAN,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_trades_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shift_trades_org_id_status_idx" ON "shift_trades"("org_id", "status");

-- CreateIndex
CREATE INDEX "shift_trades_shift_id_idx" ON "shift_trades"("shift_id");

-- AddForeignKey
ALTER TABLE "shift_trades" ADD CONSTRAINT "shift_trades_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_trades" ADD CONSTRAINT "shift_trades_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_trades" ADD CONSTRAINT "shift_trades_source_user_id_fkey" FOREIGN KEY ("source_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_trades" ADD CONSTRAINT "shift_trades_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
