-- AlterTable
ALTER TABLE "shift_patterns" ADD COLUMN     "am_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pm_count" INTEGER NOT NULL DEFAULT 0;
