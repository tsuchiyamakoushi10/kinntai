-- デイ送迎ロジック用: 午前のうち送迎(8:15開始)で必要な人数。
ALTER TABLE "office_coverage_demands" ADD COLUMN "early_am_required" INTEGER NOT NULL DEFAULT 0;
-- 半日勤務しかしない職員フラグ (デイ自動生成で終日を割り当てない)。
ALTER TABLE "shift_constraints" ADD COLUMN "half_day_only" BOOLEAN NOT NULL DEFAULT false;
