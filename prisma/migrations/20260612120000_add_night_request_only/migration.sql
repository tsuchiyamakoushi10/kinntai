-- 夜勤チェッカー: true の従業員は夜勤希望に出した日までしか夜勤に入らない。
-- 不足分はこのフラグの無い人に振り分けられる (日勤は通常どおり配置)。
ALTER TABLE "employees" ADD COLUMN "night_request_only" BOOLEAN NOT NULL DEFAULT false;
