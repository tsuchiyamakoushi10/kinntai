-- 管理者 (施設管理者) フラグ。true の職員はシフト希望画面で「事務日 / 実績周り日」を指定でき、
-- 自動生成でその日を事務/実績周りの勤務で固定配置し公休を入れない。
-- ログイン権限 (users.role) とは別軸のシフト用フラグ。列追加は非破壊。
ALTER TABLE "employees" ADD COLUMN "is_manager" BOOLEAN NOT NULL DEFAULT false;
