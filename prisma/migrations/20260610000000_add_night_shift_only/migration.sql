-- 夜勤専従フラグ。true の従業員はシフト希望で夜勤を入れた日だけ夜勤に入り、
-- それ以外は自動で公休になる (NRS/ショートの自動生成のみ適用)。非破壊。
ALTER TABLE "employees" ADD COLUMN "night_shift_only" BOOLEAN NOT NULL DEFAULT false;
