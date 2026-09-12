-- AlterTable
ALTER TABLE "roles" ADD COLUMN     "last_updated_by" TEXT;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_last_updated_by_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
