-- シフト希望に管理者向けの「事務日」(office_day) と「実績周り日」(record_round) を追加する。
-- 管理者が希望休と同じ画面で指定し、自動生成で該当勤務を固定配置する (公休を入れない)。
-- enum への値追加は非破壊。既存行・既存コードには影響しない。
ALTER TYPE "shift_preference_type" ADD VALUE IF NOT EXISTS 'office_day';
ALTER TYPE "shift_preference_type" ADD VALUE IF NOT EXISTS 'record_round';
