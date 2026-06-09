-- 配置基準に看護師(看護職員)の必要数を追加 (午前/午後)。非破壊。
ALTER TABLE "office_coverage_demands" ADD COLUMN "nurse_am_required" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "office_coverage_demands" ADD COLUMN "nurse_pm_required" INTEGER NOT NULL DEFAULT 0;
