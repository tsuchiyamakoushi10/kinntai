-- 雇用形態を「正社員 / パート（社保あり）/ パート（社保なし）」に再編する。
-- 契約社員(contract)は廃止(該当者なし想定だが保険的に full_time へ寄せる)。
-- 既存パート(part_time)は「社保なし」を初期値とする。
-- Postgres enum は値の削除ができないため新 type を作って USING で移し替え、旧 type を破棄して rename する。

CREATE TYPE "employment_type_new" AS ENUM ('full_time', 'part_time_insured', 'part_time_uninsured');

ALTER TABLE "employees"
  ALTER COLUMN "employment_type" TYPE "employment_type_new"
  USING (
    CASE "employment_type"::text
      WHEN 'full_time' THEN 'full_time'
      WHEN 'contract'  THEN 'full_time'
      WHEN 'part_time' THEN 'part_time_uninsured'
    END::"employment_type_new"
  );

ALTER TABLE "employment_contracts"
  ALTER COLUMN "employment_type" TYPE "employment_type_new"
  USING (
    CASE "employment_type"::text
      WHEN 'full_time' THEN 'full_time'
      WHEN 'contract'  THEN 'full_time'
      WHEN 'part_time' THEN 'part_time_uninsured'
    END::"employment_type_new"
  );

DROP TYPE "employment_type";
ALTER TYPE "employment_type_new" RENAME TO "employment_type";

-- 勤務表の手動並び順 (拠点内)。0 = 未設定。
ALTER TABLE "employees" ADD COLUMN "display_order" INTEGER NOT NULL DEFAULT 0;
