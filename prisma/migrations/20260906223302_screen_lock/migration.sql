-- AlterTable
ALTER TABLE "session" ADD COLUMN     "locked_at" TIMESTAMP(3),
ADD COLUMN     "pin_attempts" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "pin_hash" TEXT;
