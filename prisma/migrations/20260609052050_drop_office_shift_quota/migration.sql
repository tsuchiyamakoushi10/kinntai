/*
  Warnings:

  - You are about to drop the `office_shift_quotas` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "office_shift_quotas" DROP CONSTRAINT "office_shift_quotas_office_id_fkey";

-- DropForeignKey
ALTER TABLE "office_shift_quotas" DROP CONSTRAINT "office_shift_quotas_shift_pattern_id_fkey";

-- DropTable
DROP TABLE "office_shift_quotas";
